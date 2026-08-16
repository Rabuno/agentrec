import type { Readable } from 'node:stream';

export interface McpJsonRpcMessage {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    [key: string]: unknown;
  };
  result?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

function tryParseJson(text: string, onMessage: (message: McpJsonRpcMessage) => void): void {
  try {
    const json = JSON.parse(text);
    onMessage(json);
  } catch {
    // Ignore invalid JSON lines gracefully
  }
}

export function createMcpInterceptor(
  stream: Readable,
  onMessage: (message: McpJsonRpcMessage) => void
): void {
  let buffer = '';

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString('utf8');
    
    let processing = true;
    while (processing) {
      processing = false;
      
      // 1. Try parsing Content-Length framing (LSP / SSE / standard header format)
      const headerMatch = buffer.match(/^Content-Length:\s*(\d+)\r?\n\r?\n/i);
      if (headerMatch) {
        const contentLength = parseInt(headerMatch[1], 10);
        const headerLength = headerMatch[0].length;
        
        if (buffer.length >= headerLength + contentLength) {
          const body = buffer.slice(headerLength, headerLength + contentLength);
          buffer = buffer.slice(headerLength + contentLength);
          tryParseJson(body, onMessage);
          processing = true;
          continue;
        }
      }
      
      // If we see a partial Content-Length header at the start of buffer, wait for more data.
      if (buffer.toLowerCase().startsWith('content-length:')) {
        break;
      }
      
      // 2. Fallback to newline-delimited JSON
      const boundary = buffer.indexOf('\n');
      if (boundary !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        
        if (line) {
          tryParseJson(line, onMessage);
        }
        processing = true;
      }
    }
  });

  stream.on('end', () => {
    const line = buffer.trim();
    if (line) {
      const headerMatch = line.match(/^Content-Length:\s*(\d+)\r?\n\r?\n/i);
      if (headerMatch) {
        const contentLength = parseInt(headerMatch[1], 10);
        const headerLength = headerMatch[0].length;
        const body = line.slice(headerLength, headerLength + contentLength);
        tryParseJson(body, onMessage);
      } else {
        tryParseJson(line, onMessage);
      }
    }
  });
}
