# Nostr Implementation Plan for Groq MCP Server

This document outlines the plan to implement NIP-89 and NIP-90 support for the Groq MCP server, turning it into a Nostr Data Vending Machine (DVM).

## Overview

The Groq MCP server will be extended to:
1. Advertise itself as a NIP-89 application handler
2. Handle NIP-90 job requests for LLM completions
3. Process payments and deliver results according to the NIP-90 protocol

## Implementation Details

### 1. NIP-89 Handler Advertisement

Create and publish a kind:31990 event to advertise LLM completion capabilities:

```json
{
  "kind": 31990,
  "content": {
    "name": "Groq DVM",
    "about": "LLM completion service powered by Groq's API",
    "picture": "",  // Optional: Add service icon
    "nip90Params": {
      "models": [
        "gemma-7b-it",
        "llama3-70b-8192", 
        "llama3-8b-8192",
        "mixtral-8x7b-32768"
      ]
    }
  },
  "tags": [
    ["k", "5100"],  // Register as LLM completion handler
    ["web", "https://api-endpoint/chat/<bech32>"]
  ]
}
```

### 2. NIP-90 Job Request Handler (kind:5100)

Implement handler for kind:5100 (LLM Completion) requests:

```json
{
  "kind": 5100,
  "content": "",
  "tags": [
    ["i", "What is the capital of France?", "text"],
    ["param", "model", "mixtral-8x7b-32768"],
    ["param", "temperature", "0.7"],
    ["param", "max_tokens", "1024"],
    ["param", "top_p", "1"],
    ["bid", "1000"]  // 1000 msats
  ]
}
```

### 3. Job Result Response (kind:6100)

Return results in kind:6100 events:

```json
{
  "kind": 6100,
  "content": "The capital of France is Paris.",
  "tags": [
    ["request", "<job-request-event-json>"],
    ["e", "<job-request-id>", "<relay-hint>"],
    ["amount", "1000", "<optional-bolt11>"]
  ]
}
```

### 4. Job Feedback (kind:7000)

Implement status updates:

```json
{
  "kind": 7000,
  "tags": [
    ["status", "processing"],
    ["e", "<job-request-id>"],
    ["p", "<customer-pubkey>"]
  ]
}
```

## Required Changes

1. Add Nostr Dependencies:
```bash
npm install nostr-tools websocket-polyfill
```

2. New Source Files:
- `src/nostr/types.ts` - Nostr event type definitions
- `src/nostr/handler.ts` - NIP-90 request handling logic
- `src/nostr/events.ts` - Event creation/publishing utilities
- `src/nostr/payment.ts` - Payment processing logic

3. Code Changes:
- Extend server.ts to handle Nostr events
- Add payment processing capabilities
- Implement job queue management
- Add relay connection management

## Implementation Phases

### Phase 1: Basic Integration
- [ ] Set up Nostr event handling infrastructure
- [ ] Implement NIP-89 handler advertisement
- [ ] Basic NIP-90 job request processing
- [ ] Simple job result delivery

### Phase 2: Payment Processing
- [ ] Implement payment verification
- [ ] Add support for Lightning payments
- [ ] Handle payment-required status updates

### Phase 3: Advanced Features
- [ ] Add job queuing system
- [ ] Implement rate limiting
- [ ] Add support for encrypted requests
- [ ] Implement job cancellation

### Phase 4: Testing & Documentation
- [ ] Create test suite for Nostr integration
- [ ] Document API endpoints and event formats
- [ ] Create usage examples
- [ ] Security review

## Configuration

New environment variables needed:
```bash
NOSTR_PRIVATE_KEY=<hex-private-key>
NOSTR_RELAYS=wss://relay1,wss://relay2
LIGHTNING_NODE_URL=<ln-node-url>
LIGHTNING_MACAROON=<macaroon>
```

## Security Considerations

1. Validate all incoming Nostr events
2. Verify payments before processing
3. Rate limit requests per pubkey
4. Implement timeout handling
5. Sanitize all input data
6. Handle encrypted requests securely

## Testing Plan

1. Unit tests for event handling
2. Integration tests with Nostr relays
3. Payment processing tests
4. Load testing for concurrent jobs
5. Security testing for encrypted requests

## Future Enhancements

1. Support for more LLM models
2. Advanced payment options
3. Job priority system
4. Result caching
5. Automated pricing based on load
6. Integration with other DVMs for job chaining