import { Event, SimplePool } from 'nostr-tools';
import WebSocket from 'ws';
import { NostrConfig, NostrKind } from './types.js';
import { createHandlerAdvertisement, createJobFeedback, createJobResult, parseJobRequest } from './events.js';
import { Groq } from 'groq-sdk';

// Polyfill WebSocket for nostr-tools
(global as any).WebSocket = WebSocket;

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry with exponential backoff
async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (attempt === maxAttempts) break;
      
      // If it's a rate limit error, wait longer
      const isRateLimit = error.message?.includes('rate-limit');
      const waitTime = isRateLimit ? 
        baseDelay * Math.pow(2, attempt) * (1 + Math.random()) : // Exponential backoff with jitter
        baseDelay; // Regular delay for other errors
      
      console.log(`Attempt ${attempt} failed, retrying in ${Math.round(waitTime/1000)}s...`);
      await delay(waitTime);
    }
  }
  
  throw lastError;
}

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
    try {
      await retry(async () => {
        await Promise.all(this.pool.publish(this.config.relays, event));
        console.log('Published handler advertisement');
      });
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
      await retry(async () => {
        await this.publishFeedback({
          requestId: request.id,
          customerPubkey: request.pubkey,
          status: 'processing'
        });
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
      await delay(1000);

      // Publish result
      await retry(async () => {
        await this.publishResult({
          requestId: request.id,
          customerPubkey: request.pubkey,
          content,
          request: event
        });
      });

      console.log(`[${event.id.slice(0, 8)}] Request completed`);

      // Add a small delay before publishing success
      await delay(1000);

      // Send success status
      await retry(async () => {
        await this.publishFeedback({
          requestId: request.id,
          customerPubkey: request.pubkey,
          status: 'success'
        });
      });

    } catch (error) {
      console.error(`[${event.id.slice(0, 8)}] Error:`, error);
      
      await delay(1000);

      // Send error status
      await retry(async () => {
        await this.publishFeedback({
          requestId: request.id,
          customerPubkey: request.pubkey,
          status: 'error',
          extraInfo: error instanceof Error ? error.message : 'Unknown error'
        });
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
      throw error; // Allow retry to catch this
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
      throw error; // Allow retry to catch this
    }
  }

  async stop() {
    // Close all subscriptions
    Object.values(this.subscriptions).forEach(close => close());
    
    // Close all relay connections
    this.pool.close(this.config.relays);
  }
}