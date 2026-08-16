import type { Readable } from 'node:stream';

export function createMcpInterceptor(
  stream: Readable,
  onMessage: (message: any) => void
): void {
  let buffer = '';

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString('utf8');
    
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      
      if (line) {
        try {
          const json = JSON.parse(line);
          onMessage(json);
        } catch {
          // Ignore invalid JSON lines gracefully
        }
      }
      boundary = buffer.indexOf('\n');
    }
  });

  stream.on('end', () => {
    const line = buffer.trim();
    if (line) {
      try {
        const json = JSON.parse(line);
        onMessage(json);
      } catch {
        // Ignore
      }
    }
  });
}
