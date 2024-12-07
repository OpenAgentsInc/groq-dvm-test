# groq-mcp-test MCP Server

A Model Context Protocol server that provides access to Groq's LLM API.

This is a TypeScript-based MCP server that implements a chat completion interface using Groq's API. It demonstrates core MCP concepts by providing:

- Tools for running chat completions via Groq's API
- Environment variable configuration for API access

## Features

### Tools
- `chat_completion` - Run chat completions via Groq's API
  - Takes messages array and optional parameters
  - Returns LLM response
  - Configurable temperature, max_tokens, etc.

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

Set your Groq API key in the environment:
```bash
export GROQ_API_KEY=your-api-key-here
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

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.