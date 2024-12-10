#!/usr/bin/env node

/**
 * This is an MCP server that provides access to Groq's LLM API.
 * It demonstrates core MCP concepts by implementing a chat completion tool
 * that interfaces with Groq's API.
 *
 * It also implements NIP-89/90 support to act as a Nostr Data Vending Machine.
 */

import Groq from "groq-sdk"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema, ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import { NostrHandler } from "./nostr/handler.js"
import { NostrConfig } from "./nostr/types.js"

// Initialize Groq client with API key from environment
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Valid Groq models
type GroqModel = "gemma-7b-it" | "llama3-70b-8192" | "llama3-8b-8192" | "mixtral-8x7b-32768";

/**
 * Create an MCP server with capabilities for tools to run chat completions
 */
const server = new Server(
  {
    name: "groq-mcp-test",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "chat_completion" tool that lets clients run Groq chat completions.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "chat_completion",
        description: "Run a chat completion via Groq's API",
        inputSchema: {
          type: "object",
          properties: {
            messages: {
              type: "array",
              description: "Array of messages to send to the model",
              items: {
                type: "object",
                properties: {
                  role: {
                    type: "string",
                    description: "Role of the message sender (system, user, or assistant)",
                    enum: ["system", "user", "assistant"],
                  },
                  content: {
                    type: "string",
                    description: "Content of the message",
                  },
                },
                required: ["role", "content"],
              },
            },
            model: {
              type: "string",
              description: "Model to use for completion",
              enum: ["gemma-7b-it", "llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768"],
            },
            temperature: {
              type: "number",
              description: "Sampling temperature (0-1)",
            },
            max_tokens: {
              type: "number",
              description: "Maximum tokens to generate",
            },
            top_p: {
              type: "number",
              description: "Nucleus sampling parameter",
            },
            stream: {
              type: "boolean",
              description: "Whether to stream the response",
            },
          },
          required: ["messages", "model"],
        },
      },
    ],
  };
});

/**
 * Handler for the chat_completion tool.
 * Runs a chat completion via Groq's API with the provided parameters.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "chat_completion") {
    throw new Error("Unknown tool");
  }

  const args = request.params.arguments || {};

  // Type check and validate messages
  if (!Array.isArray(args.messages) || !args.messages.length) {
    throw new Error("Messages must be a non-empty array");
  }

  const messages = args.messages
  const model = args.model as GroqModel;

  if (!model) {
    throw new Error("Model is required");
  }

  // Validate optional parameters
  const temperature = typeof args.temperature === 'number' ? args.temperature : 0.7;
  const max_tokens = typeof args.max_tokens === 'number' ? args.max_tokens : 1024;
  const top_p = typeof args.top_p === 'number' ? args.top_p : 1;
  const stream = false //typeof args.stream === 'boolean' ? args.stream : false;

  try {
    const completion = await groq.chat.completions.create({
      messages,
      model,
      temperature,
      max_tokens,
      top_p,
      stream,
    });

    return {
      content: [{
        type: "text",
        text: completion.choices[0].message.content,
      }],
    };
  } catch (err) {
    // Type guard for Error objects
    if (err instanceof Error) {
      throw new Error(`Groq API error: ${err.message}`);
    }
    // Fallback for unknown error types
    throw new Error("Groq API error: An unknown error occurred");
  }
});

let nostrHandler: NostrHandler | null = null;

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  // Verify GROQ_API_KEY is set
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable must be set");
  }

  // Initialize Nostr handler if config is present
  if (process.env.NOSTR_PRIVATE_KEY && process.env.NOSTR_RELAYS) {
    const config: NostrConfig = {
      privateKey: process.env.NOSTR_PRIVATE_KEY,
      relays: ["wss://relay.damus.io"], //process.env.NOSTR_RELAYS.split(','),
      // allowedPubkey: process.env.NOSTR_ALLOWED_PUBKEY // Optional
    };

    nostrHandler = new NostrHandler(config, groq);
    await nostrHandler.start();
    console.log('Nostr DVM handler started');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Handle shutdown
process.on('SIGINT', async () => {
  if (nostrHandler) {
    await nostrHandler.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (nostrHandler) {
    await nostrHandler.stop();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
