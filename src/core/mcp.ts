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

function parseContentLengthMessage(buffer: string): { body: string; remaining: string } | null {
  const headerMatch = buffer.match(/Content-Length:\s*(\d+)/i);
  if (!headerMatch) return null;

  const contentLength = parseInt(headerMatch[1], 10);
  const headerIndex = headerMatch.index!;
  
  const remainingFromHeader = buffer.slice(headerIndex);
  const separatorMatch = remainingFromHeader.match(/\r?\n\r?\n/);
  if (!separatorMatch) return null;

  const separatorIndex = separatorMatch.index!;
  const separatorLength = separatorMatch[0].length;
  const bodyStartIndex = headerIndex + separatorIndex + separatorLength;

  if (buffer.length >= bodyStartIndex + contentLength) {
    const body = buffer.slice(bodyStartIndex, bodyStartIndex + contentLength);
    const remaining = buffer.slice(bodyStartIndex + contentLength);
    return { body, remaining };
  }

  return null;
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
      
      // 1. Try parsing Content-Length framing
      const parsed = parseContentLengthMessage(buffer);
      if (parsed) {
        buffer = parsed.remaining;
        tryParseJson(parsed.body, onMessage);
        processing = true;
        continue;
      }
      
      // If we have "content-length:" partially in the buffer, wait for more data.
      if (buffer.toLowerCase().includes('content-length:')) {
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
      const parsed = parseContentLengthMessage(line);
      if (parsed) {
        tryParseJson(parsed.body, onMessage);
      } else {
        tryParseJson(line, onMessage);
      }
    }
  });
}
