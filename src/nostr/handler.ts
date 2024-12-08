import { Event, SimplePool } from 'nostr-tools';
import WebSocket from 'ws';
import { NostrConfig, NostrKind } from './types.js';
import { createHandlerAdvertisement, createJobFeedback, createJobResult, parseJobRequest } from './events.js';
import { Groq } from 'groq-sdk';

// Polyfill WebSocket for nostr-tools
(global as any).WebSocket = WebSocket;

// Relays with kind restrictions
const RESTRICTED_RELAYS = new Set([
  'wss://purplepag.es'
]);

export class NostrHandler {
  private pool: SimplePool;
  private groq: Groq;
  private config: NostrConfig;
  private subscriptions: { [key: string]: () => void } = {};

  constructor(config: NostrConfig, groq: Groq) {
    this.pool = new SimplePool();
    this.groq = groq;
    this.config = config;
  }

  async start() {
    // Connect to relays
    await this.connectToRelays();

    // Publish handler advertisement
    await this.publishHandlerAd();

    // Subscribe to job requests
    this.subscribeToRequests();
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
    
    // Filter out restricted relays for handler advertisement
    const publishRelays = this.config.relays.filter(relay => !RESTRICTED_RELAYS.has(relay));
    
    try {
      await Promise.all(this.pool.publish(publishRelays, event));
      console.log('Published handler advertisement');
    } catch (error) {
      console.error('Failed to publish handler advertisement:', error);
    }
  }

  private subscribeToRequests() {
    const sub = this.pool.subscribeMany(
      this.config.relays,
      [{ kinds: [NostrKind.JOB_REQUEST] }],
      {
        onevent: async (event: Event) => {
          // Check if we should process this request
          if (this.config.allowedPubkey && event.pubkey !== this.config.allowedPubkey) {
            console.log(`[${event.id.slice(0, 8)}] Unauthorized pubkey: ${event.pubkey.slice(0, 8)}`);
            return;
          }

          await this.handleJobRequest(event);
        }
      }
    );

    // Store subscription for cleanup
    this.subscriptions['requests'] = () => sub.close();
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

      // Filter out restricted relays for results
      const publishRelays = this.config.relays.filter(relay => !RESTRICTED_RELAYS.has(relay));

      // Publish result
      await this.publishResult({
        requestId: request.id,
        customerPubkey: request.pubkey,
        content,
        request: event
      }, publishRelays);

      console.log(`[${event.id.slice(0, 8)}] Request completed`);

      // Send success status
      await this.publishFeedback({
        requestId: request.id,
        customerPubkey: request.pubkey,
        status: 'success'
      });

    } catch (error) {
      console.error(`[${event.id.slice(0, 8)}] Error:`, error);
      
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
  }, relays?: string[]) {
    const event = createJobResult(result, this.config.privateKey);
    const publishRelays = relays || this.config.relays.filter(relay => !RESTRICTED_RELAYS.has(relay));
    
    try {
      await Promise.all(this.pool.publish(publishRelays, event));
    } catch (error) {
      console.error(`[${result.requestId.slice(0, 8)}] Failed to publish result:`, error);
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
    const publishRelays = this.config.relays.filter(relay => !RESTRICTED_RELAYS.has(relay));
    
    try {
      await Promise.all(this.pool.publish(publishRelays, event));
    } catch (error) {
      console.error(`[${feedback.requestId.slice(0, 8)}] Failed to publish feedback:`, error);
    }
  }

  async stop() {
    // Close all subscriptions
    Object.values(this.subscriptions).forEach(close => close());
    
    // Close all relay connections
    this.pool.close(this.config.relays);
  }
}