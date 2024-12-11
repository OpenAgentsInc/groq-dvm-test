# groq-dvm-test

A Model Context Protocol server that provides access to Groq's LLM API, with support for Nostr Data Vending Machine (DVM) functionality. [Currently focuses on NIP-90]

This is a TypeScript-based MCP server that implements a chat completion interface using Groq's API. It demonstrates core MCP concepts by providing:

- Tools for running chat completions via Groq's API
- Environment variable configuration for API access
- Nostr DVM support for decentralized LLM access (NIP-89/90)

## Features

### Tools
- `chat_completion` - Run chat completions via Groq's API
  - Takes messages array and optional parameters
  - Returns LLM response
  - Configurable temperature, max_tokens, etc.

### Nostr DVM Support
- Implements NIP-89 for service advertisement
- Implements NIP-90 for LLM completion requests
- Optional pubkey restriction for private services
- Status updates via kind:7000 events
- Supports all Groq models:
  - gemma-7b-it
  - llama3-70b-8192
  - llama3-8b-8192
  - mixtral-8x7b-32768

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Configuration

### Required Environment Variables
```bash
# Groq API Configuration
export GROQ_API_KEY=your-api-key-here

# Nostr Configuration (optional)
export NOSTR_PRIVATE_KEY=your-nostr-private-key
export NOSTR_RELAYS=wss://relay1.com,wss://relay2.com
export NOSTR_ALLOWED_PUBKEY=optional-allowed-pubkey  # Optional: restrict to specific pubkey
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "groq-mcp-test": {
      "command": "/path/to/groq-mcp-test/build/index.js"
    }
  }
}
```

### Nostr Usage

1. Set up environment variables for Nostr support
2. The server will automatically:
   - Advertise itself as a NIP-89 handler for LLM completions
   - Listen for kind:5100 job requests
   - Process requests and return results
   - Provide status updates

Example job request:
```json
{
  "kind": 5100,
  "content": "",
  "tags": [
    ["i", "What is the capital of France?", "text"],
    ["param", "model", "mixtral-8x7b-32768"],
    ["param", "temperature", "0.7"],
    ["param", "max_tokens", "1024"],
    ["param", "top_p", "1"]
  ]
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
