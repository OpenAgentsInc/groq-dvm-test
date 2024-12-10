export interface NostrConfig {
  privateKey: string;
  relays: string[];
  allowedPubkey?: string;
}

export enum NostrKind {
  JOB_REQUEST = 5050, // Changed from 5100 to 5050
  JOB_RESULT = 6050,  // Changed from 6100 to 6050
  JOB_FEEDBACK = 7000,
  APP_HANDLER = 31990
}

export interface JobRequest {
  id: string;
  pubkey: string;
  content: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  input: string;
  inputType: 'text' | 'url' | 'event' | 'job' | 'prompt';
  relay?: string;
  marker?: string;
}

export interface JobResult {
  requestId: string;
  customerPubkey: string;
  content: string | null;
  request: any;
}

export interface JobFeedback {
  requestId: string;
  customerPubkey: string;
  status: 'processing' | 'error' | 'success';
  extraInfo?: string;
  content?: string;
}