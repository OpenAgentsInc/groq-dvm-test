import { Event } from 'nostr-tools';

export interface NostrConfig {
  privateKey: string;
  relays: string[];
  allowedPubkey?: string; // Optional pubkey to restrict service to
}

export interface JobRequest {
  id: string;
  pubkey: string;
  content: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  input: string;
  inputType: 'text' | 'url' | 'event' | 'job';
  relay?: string;
  marker?: string;
}

export interface JobResult {
  requestId: string;
  customerPubkey: string;
  content: string | null;
  request: Event;
}

export interface JobFeedback {
  requestId: string;
  customerPubkey: string;
  status: 'processing' | 'error' | 'success';
  extraInfo?: string;
  content?: string;
}

// NIP-90 event kinds
export const enum NostrKind {
  JOB_REQUEST = 5100,  // LLM completion request
  JOB_RESULT = 6100,   // LLM completion result
  JOB_FEEDBACK = 7000, // Job status/feedback
  APP_HANDLER = 31990  // NIP-89 handler advertisement
}