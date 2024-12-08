#!/usr/bin/env node

import { SimplePool, getPublicKey, getEventHash } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';
import WebSocket from 'ws';

// Polyfill WebSocket for nostr-tools
(global as any).WebSocket = WebSocket;

// Helper function to convert hex to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

// Helper function to sign an event
function signEvent(event: any, privateKey: string): string {
  const hash = getEventHash(event);
  const sig = schnorr.sign(hash, hexToBytes(privateKey));
  return bytesToHex(sig);
}

async function main() {
  if (!process.env.NOSTR_PRIVATE_KEY) {
    console.error('NOSTR_PRIVATE_KEY environment variable must be set');
    process.exit(1);
  }

  const privateKey = process.env.NOSTR_PRIVATE_KEY;
  const pubkey = getPublicKey(hexToBytes(privateKey));
  
  // Create a test request
  const event = {
    kind: 5050,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['i', 'What is the capital of France?', 'prompt'],
      ['param', 'model', 'mixtral-8x7b-32768'],
      ['param', 'max_tokens', '512'],
      ['param', 'temperature', '0.7'],
      ['param', 'top-p', '0.9']
    ],
    content: '',
    pubkey,
    id: '',
    sig: ''
  };

  // Sign the event
  event.id = getEventHash(event);
  event.sig = signEvent(event, privateKey);

  // Connect to relays and publish
  const pool = new SimplePool();
  const relays = [
    'wss://purplepag.es',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://relay.snort.social',
    'wss://offchain.pub',
    'wss://nostr-pub.wellorder.net'
  ];

  try {
    // Publish the request
    console.log('Publishing request...');
    const pubs = await Promise.all(pool.publish(relays, event));
    console.log('Published to relays:', pubs);

    // Subscribe to responses
    console.log('Waiting for responses...');
    const sub = pool.subscribeMany(
      relays,
      [
        { kinds: [6050], '#e': [event.id] },  // Results
        { kinds: [7000], '#e': [event.id] }   // Feedback
      ],
      {
        onevent: (event) => {
          if (event.kind === 7000) {
            const status = event.tags.find(t => t[0] === 'status')?.[1];
            console.log('Received feedback:', status);
            if (status === 'success' || status === 'error') {
              console.log('Job complete, exiting...');
              process.exit(0);
            }
          } else {
            console.log('Received result:', event.content);
          }
        }
      }
    );

    // Exit after 30 seconds if no response
    setTimeout(() => {
      console.log('Timeout waiting for response');
      sub.close();
      process.exit(1);
    }, 30000);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();