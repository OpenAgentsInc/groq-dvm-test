import { Event, SimplePool, getPublicKey } from 'nostr-tools';
import WebSocket from 'ws';
import { NostrConfig, NostrKind } from './types.js';
import { createHandlerAdvertisement, createJobFeedback, createJobResult, parseJobRequest } from './events.js';
import { Groq } from 'groq-sdk';

// Polyfill WebSocket for nostr-tools
(global as any).WebSocket = WebSocket;

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to convert hex to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

export class NostrHandler {
  private pool: SimplePool;
  private groq: Groq;
  private config: NostrConfig;
  private subscriptions: { [key: string]: () => void } = {};
  private isProcessing: boolean = false;
  private requestQueue: Event[] = [];
  private processedEvents: Set<string> = new Set();
  private pubkey: string;

  constructor(config: NostrConfig, groq: Groq) {
    this.pool = new SimplePool();
    this.groq = groq;
    this.config = config;
    this.pubkey = getPublicKey(hexToBytes(this.config.privateKey));
  }

  async start() {
    // Connect to relays
    await this.connectToRelays();

    // Load already processed events from the last 4 hours
    await this.loadProcessedEvents();

    // Publish handler advertisement
    await this.publishHandlerAd();

    // Subscribe to job requests
    this.subscribeToRequests();
  }

  private async loadProcessedEvents() {
    const since = Math.floor(Date.now() / 1000) - (4 * 60 * 60); // Last 4 hours
    
    // Look for our own responses (kind 6050) to find what we've already processed
    const responses = await Promise.all(
      this.config.relays.map(relay => 
        this.pool.querySync([relay], [{
          kinds: [6050],
          since,
          authors: [this.pubkey]
        }])
      )
    ).then(results => results.flat());

    // Extract the original request IDs from the responses
    responses.forEach(response => {
      const requestId = response.tags.find(t => t[0] === 'e')?.[1];
      if (requestId) {
        this.processedEvents.add(requestId);
        console.log(`Loaded processed event: ${requestId.slice(0, 8)}`);
      }
    });

    console.log(`Loaded ${this.processedEvents.size} processed events`);
  }

  private async connectToRelays() {
    for (const relay of this.config.relays) {
      try {
        await this.pool.ensureRelay(relay);
        console.log(`Connected to relay: ${relay}`);
      } catch (error) {
        console.error(`Failed to connect to relay ${relay}:`, error);
      }
    }
  }

  private async publishHandlerAd() {
    const event = createHandlerAdvertisement(this.config.privateKey);
    try {
      await Promise.all(this.pool.publish(this.config.relays, event));
      console.log('Published handler advertisement');
    } catch (error) {
      console.error('Failed to publish handler advertisement:', error);
    }
  }

  private subscribeToRequests() {
    const sub = this.pool.subscribeMany(
      this.config.relays,
      [{
        kinds: [5050],
        since: Math.floor(Date.now() / 1000) - (4 * 60 * 60) // Last 4 hours
      }],
      {
        onevent: async (event: Event) => {
          // Skip if we've already processed this event
          if (this.processedEvents.has(event.id)) {
            console.log(`[${event.id.slice(0, 8)}] Already processed, skipping`);
            return;
          }

          // Check if we should process this request
          if (this.config.allowedPubkey && event.pubkey !== this.config.allowedPubkey) {
            console.log(`[${event.id.slice(0, 8)}] Unauthorized pubkey: ${event.pubkey.slice(0, 8)}`);
            return;
          }

          // Add to queue and process if not already processing
          this.requestQueue.push(event);
          this.processNextRequest();
        }
      }
    );

    // Store subscription for cleanup
    this.subscriptions['requests'] = () => sub.close();
  }

  private async processNextRequest() {
    // If already processing or queue is empty, do nothing
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const event = this.requestQueue.shift()!;

    try {
      await this.handleJobRequest(event);
      // Mark as processed after successful handling
      this.processedEvents.add(event.id);
    } catch (error) {
      console.error(`[${event.id.slice(0, 8)}] Failed to process request:`, error);
    } finally {
      // Wait a bit before processing next request to avoid rate limits
      await delay(2000);
      this.isProcessing = false;
      this.processNextRequest();
    }
  }

  private async handleJobRequest(event: Event) {
    const request = parseJobRequest(event);
    if (!request) {
      return;
    }

    try {
      // Send processing status
      await this.publishFeedback({
        requestId: request.id,
        customerPubkey: request.pubkey,
        status: 'processing'
      });

      console.log(`[${event.id.slice(0, 8)}] Processing request from ${event.pubkey.slice(0, 8)}`);

      // Process the request
      const completion = await this.groq.chat.completions.create({
        messages: [{
          role: 'user',
          content: request.input
        }],
        model: request.model,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 1024,
        top_p: request.top_p ?? 1,
        stream: false
      });

      const content = completion.choices[0].message.content;

      // Add a small delay before publishing result
      await delay(2000);

      // Publish result
      await this.publishResult({
        requestId: request.id,
        customerPubkey: request.pubkey,
        content,
        request: event
      });

      console.log(`[${event.id.slice(0, 8)}] Request completed`);

      // Add a small delay before publishing success
      await delay(2000);

      // Send success status
      await this.publishFeedback({
        requestId: request.id,
        customerPubkey: request.pubkey,
        status: 'success'
      });

    } catch (error) {
      console.error(`[${event.id.slice(0, 8)}] Error:`, error);
      
      await delay(2000);

      // Send error status
      await this.publishFeedback({
        requestId: request.id,
        customerPubkey: request.pubkey,
        status: 'error',
        extraInfo: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async publishResult(result: {
    requestId: string;
    customerPubkey: string;
    content: string | null;
    request: Event;
  }) {
    const event = createJobResult(result, this.config.privateKey);
    try {
      await Promise.all(this.pool.publish(this.config.relays, event));
    } catch (error) {
      console.error(`[${result.requestId.slice(0, 8)}] Failed to publish result:`, error);
      throw error;
    }
  }

  private async publishFeedback(feedback: {
    requestId: string;
    customerPubkey: string;
    status: 'processing' | 'error' | 'success';
    extraInfo?: string;
    content?: string;
  }) {
    const event = createJobFeedback(feedback, this.config.privateKey);
    try {
      await Promise.all(this.pool.publish(this.config.relays, event));
    } catch (error) {
      console.error(`[${feedback.requestId.slice(0, 8)}] Failed to publish feedback:`, error);
      throw error;
    }
  }

  async stop() {
    // Close all subscriptions
    Object.values(this.subscriptions).forEach(close => close());
    
    // Close all relay connections
    this.pool.close(this.config.relays);
  }
}