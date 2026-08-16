import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

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
  // Ensure the buffer starts with an HTTP-style header to prevent false matches in JSON bodies
  if (!/^(content-length|content-type)/i.test(buffer.trimStart())) {
    return null;
  }

  const separatorMatch = buffer.match(/\r?\n\r?\n/);
  if (!separatorMatch) return null;

  const separatorIndex = separatorMatch.index!;
  const separatorLength = separatorMatch[0].length;
  const headerBlock = buffer.slice(0, separatorIndex);

  const contentLengthMatch = headerBlock.match(/Content-Length:\s*(\d+)/i);
  if (!contentLengthMatch) return null;

  const contentLength = parseInt(contentLengthMatch[1], 10);
  const bodyStartIndex = separatorIndex + separatorLength;

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
  const decoder = new StringDecoder('utf8');

  stream.on('data', (chunk: Buffer | string) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    
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
      
      // If we have a partial Content-Length/Type header at the start of buffer, wait for more data.
      const lowerBuf = buffer.trimStart().toLowerCase();
      if (lowerBuf.startsWith('content-length') || lowerBuf.startsWith('content-type')) {
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
    buffer += decoder.end();
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
