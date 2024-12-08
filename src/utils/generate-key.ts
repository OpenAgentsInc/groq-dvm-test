#!/usr/bin/env node

import { getPublicKey } from 'nostr-tools';
import { randomBytes } from 'crypto';
import { bytesToHex } from '@noble/hashes/utils';

function generateKeys() {
  // Generate 32 random bytes for private key
  const privateKeyBytes = randomBytes(32);
  
  // Convert to hex string
  const privateKey = bytesToHex(privateKeyBytes);
  
  // Get public key
  const publicKey = getPublicKey(privateKeyBytes);

  return {
    privateKey,
    publicKey
  };
}

// Only run if this is the main module
if (import.meta.url === new URL(import.meta.resolve('./generate-key.js')).href) {
  const keys = generateKeys();
  console.log('Generated Nostr Keys:');
  console.log('---------------------');
  console.log('Private Key (keep this secret!):', keys.privateKey);
  console.log('Public Key:', keys.publicKey);
  console.log('\nTo use with the Groq DVM server:');
  console.log('export NOSTR_PRIVATE_KEY=' + keys.privateKey);
}

export { generateKeys };