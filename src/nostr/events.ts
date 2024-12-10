import { Event, getEventHash, getPublicKey, SimplePool } from 'nostr-tools';
import { JobFeedback, JobRequest, JobResult, NostrKind } from './types.js';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

// Helper function to convert hex to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

// Helper function to sign an event
function signEvent(event: Event, privateKey: string): string {
  const hash = getEventHash(event);
  const sig = schnorr.sign(hash, hexToBytes(privateKey));
  return bytesToHex(sig);
}

export function createHandlerAdvertisement(privateKey: string): Event {
  const pubkey = getPublicKey(hexToBytes(privateKey));
  
  const event: Event = {
    kind: NostrKind.APP_HANDLER,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['k', '5050'], // Changed to specifically handle kind 5050
      ['web', 'https://api-endpoint/chat/<bech32>']
    ],
    content: JSON.stringify({
      name: 'Groq DVM',
      about: 'AI Assistant powered by Groq\'s API',
      nip90Params: {
        models: [
          'gemma-7b-it',
          'llama3-70b-8192', 
          'llama3-8b-8192',
          'mixtral-8x7b-32768'
        ]
      }
    }),
    pubkey,
    id: '',
    sig: ''
  };

  event.id = getEventHash(event);
  event.sig = signEvent(event, privateKey);

  return event;
}

export function parseJobRequest(event: Event): JobRequest | null {
  try {
    if (event.kind !== 5050) return null; // Changed to specifically check for 5050

    // Skip encrypted requests
    if (event.tags.some(t => t[0] === 'encrypted')) {
      return null;
    }

    // Find input tag
    const inputTag = event.tags.find(t => t[0] === 'i');
    if (!inputTag) {
      console.log(`[${event.id.slice(0, 8)}] Missing input tag`);
      return null;
    }

    // Find model parameter (default to mixtral if not specified)
    const modelTag = event.tags.find(t => t[0] === 'param' && t[1] === 'model');
    const model = modelTag ? modelTag[2] : 'mixtral-8x7b-32768';

    // Validate model is one we support
    const supportedModels = [
      'gemma-7b-it',
      'llama3-70b-8192',
      'llama3-8b-8192',
      'mixtral-8x7b-32768'
    ];
    if (!supportedModels.includes(model)) {
      console.log(`[${event.id.slice(0, 8)}] Unsupported model: ${model}`);
      return null;
    }

    // Optional parameters
    const tempTag = event.tags.find(t => t[0] === 'param' && t[1] === 'temperature');
    const maxTokensTag = event.tags.find(t => t[0] === 'param' && t[1] === 'max_tokens');
    const topPTag = event.tags.find(t => t[0] === 'param' && t[1] === 'top_p');
    const topKTag = event.tags.find(t => t[0] === 'param' && t[1] === 'top_k');
    const freqPenaltyTag = event.tags.find(t => t[0] === 'param' && t[1] === 'frequency_penalty');

    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      model,
      temperature: tempTag ? parseFloat(tempTag[2]) : 0.7,
      max_tokens: maxTokensTag ? parseInt(maxTokensTag[2]) : 1024,
      top_p: topPTag ? parseFloat(topPTag[2]) : 1,
      top_k: topKTag ? parseInt(topKTag[2]) : undefined,
      frequency_penalty: freqPenaltyTag ? parseFloat(freqPenaltyTag[2]) : undefined,
      input: inputTag[1],
      inputType: inputTag[2] as 'text' | 'url' | 'event' | 'job' | 'prompt',
      relay: inputTag[3],
      marker: inputTag[4]
    };
  } catch (error) {
    console.log(`[${event.id.slice(0, 8)}] Parse error: ${error}`);
    return null;
  }
}

export function createJobResult(result: JobResult, privateKey: string): Event {
  const pubkey = getPublicKey(hexToBytes(privateKey));
  
  const event: Event = {
    kind: NostrKind.JOB_RESULT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', result.requestId],
      ['p', result.customerPubkey],
      ['request', JSON.stringify(result.request)]
    ],
    content: result.content || '',
    pubkey,
    id: '',
    sig: ''
  };

  event.id = getEventHash(event);
  event.sig = signEvent(event, privateKey);

  return event;
}

export function createJobFeedback(feedback: JobFeedback, privateKey: string): Event {
  const pubkey = getPublicKey(hexToBytes(privateKey));
  
  const event: Event = {
    kind: NostrKind.JOB_FEEDBACK,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', feedback.requestId],
      ['p', feedback.customerPubkey],
      ['status', feedback.status, feedback.extraInfo || '']
    ],
    content: feedback.content || '',
    pubkey,
    id: '',
    sig: ''
  };

  event.id = getEventHash(event);
  event.sig = signEvent(event, privateKey);

  return event;
}