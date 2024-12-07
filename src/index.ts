#!/usr/bin/env node

/**
 * This is an MCP server that provides access to Groq's LLM API.
 * It demonstrates core MCP concepts by implementing a chat completion tool
 * that interfaces with Groq's API.
 */

import Groq from "groq-sdk"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema, ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"

// Initialize Groq client with API key from environment
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
              description: "Model to use for completion (e.g. llama3-8b-8192)",
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

  const {
    messages,
    model,
    temperature = 0.7,
    max_tokens = 1024,
    top_p = 1,
    stream = false,
  } = request.params.arguments || {};

  if (!messages || !model) {
    throw new Error("Messages and model are required");
  }

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
  } catch (error) {
    throw new Error(`Groq API error: ${error.message}`);
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  // Verify GROQ_API_KEY is set
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable must be set");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
