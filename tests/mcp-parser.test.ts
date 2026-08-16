import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createMcpInterceptor } from '../src/core/mcp.js';

describe('MCP JSON-RPC Stream Interceptor', () => {
  it('correctly parses single-line JSON messages', async () => {
    const stream = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n']);
    const onMessage = vi.fn();
    
    const interceptor = createMcpInterceptor(stream, onMessage);
    await new Promise((resolve) => stream.on('end', resolve));
    
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    });
  });

  it('handles messages split across multiple chunks (fragmented)', async () => {
    const stream = Readable.from([
      '{"jsonrpc":"2.0"',
      ',"id":2,"method":',
      '"tools/call","params":{"name":"test"}}\n'
    ]);
    const onMessage = vi.fn();
    
    createMcpInterceptor(stream, onMessage);
    await new Promise((resolve) => stream.on('end', resolve));
    
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'test' }
    });
  });

  it('handles multiple messages in a single chunk or multiple lines', async () => {
    const stream = Readable.from([
      '{"id":1}\n{"id":2}\n',
      '{"id":3}\n'
    ]);
    const onMessage = vi.fn();
    
    createMcpInterceptor(stream, onMessage);
    await new Promise((resolve) => stream.on('end', resolve));
    
    expect(onMessage).toHaveBeenCalledTimes(3);
    expect(onMessage.mock.calls).toEqual([
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 3 }]
    ]);
  });

  it('ignores invalid JSON lines gracefully without crashing', async () => {
    const stream = Readable.from([
      'invalid json\n{"id":4}\n'
    ]);
    const onMessage = vi.fn();
    
    createMcpInterceptor(stream, onMessage);
    await new Promise((resolve) => stream.on('end', resolve));
    
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ id: 4 });
  });
});
