import { createInterface } from 'node:readline';

/**
 * Mock MCP Stdio Server.
 * Communicates via JSON-RPC 2.0 messages separated by newlines on stdin/stdout.
 */
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed);

    // Handle tool list
    if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'calculator',
              description: 'Perform basic arithmetic',
              inputSchema: {
                type: 'object',
                properties: {
                  a: { type: 'number' },
                  b: { type: 'number' },
                  operation: { type: 'string', enum: ['add', 'multiply'] },
                },
                required: ['a', 'b', 'operation'],
              },
            },
            {
              name: 'get_weather',
              description: 'Get weather forecast for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          ],
        },
      };
      console.log(JSON.stringify(response));
      return;
    }

    // Handle tool calls
    if (request.method === 'tools/call') {
      const toolName = request.params?.name;
      const args = request.params?.arguments || {};

      if (toolName === 'calculator') {
        const { a = 0, b = 0, operation = 'add' } = args;
        const answer = operation === 'multiply' ? a * b : a + b;
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: `Calculation result: ${answer}` }],
            answer,
          },
        };
        console.log(JSON.stringify(response));
        return;
      }

      if (toolName === 'get_weather') {
        const { location = 'San Francisco' } = args;
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: `Weather in ${location}: 21°C, Sunny` }],
            temperature: 21,
            condition: 'Sunny',
          },
        };
        console.log(JSON.stringify(response));
        return;
      }

      // Tool not found
      console.log(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Tool ${toolName} not found` },
        })
      );
      return;
    }

    // Default response for other JSON-RPC requests
    if (request.id !== undefined) {
      console.log(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        })
      );
    }
  } catch (error) {
    console.error('Failed to parse line:', error);
  }
});
