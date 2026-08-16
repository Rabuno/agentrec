import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { latestTracePath, readTrace } from '../src/core/storage.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-mcp-'));
}

describe('CLI mcp command', () => {
  it('transparently proxies Stdio and records MCP tool calls/results into a trace', async () => {
    const dir = await tempDir();
    
    // Path to a mock MCP server that simply responds to a tool call
    const mockServerPath = join(__dirname, 'mock-mcp-server.ts');
    
    // Start the agentrec mcp command in the background
    const proxy = execa('node', [
      '--import',
      'tsx',
      'src/cli/index.ts',
      'mcp',
      '--dir',
      dir,
      '--',
      'npx',
      'tsx',
      mockServerPath
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Write a mock tools/call request to the proxy stdin
    const request = {
      jsonrpc: '2.0',
      id: 'request-123',
      method: 'tools/call',
      params: {
        name: 'calculate_sum',
        arguments: { a: 5, b: 10 }
      }
    };
    
    proxy.stdin!.write(JSON.stringify(request) + '\n');

    // Read the stdout from the proxy to verify transparency
    let stdoutBuffer = '';
    await new Promise<void>((resolve) => {
      proxy.stdout!.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        if (stdoutBuffer.includes('request-123')) {
          resolve();
        }
      });
    });

    // Parse the response from the mock server that was piped through
    const response = JSON.parse(stdoutBuffer.trim());
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'request-123',
      result: { sum: 15 }
    });

    // Gracefully close stdin to let the mock server and proxy exit
    proxy.stdin!.end();
    await proxy;

    // Verify trace generation
    const latestPath = await latestTracePath(dir);
    const trace = await readTrace(latestPath);

    expect(trace.status).toBe('completed');
    
    // Find tool call and result events
    const toolCall = trace.events.find(e => e.type === 'tool.call');
    const toolResult = trace.events.find(e => e.type === 'tool.result');

    expect(toolCall).toBeDefined();
    expect(toolCall?.name).toBe('calculate_sum');
    expect(toolCall?.data).toEqual({ a: 5, b: 10 });

    expect(toolResult).toBeDefined();
    expect(toolResult?.name).toBe('calculate_sum');
    expect(toolResult?.data).toEqual({ sum: 15 });

    await rm(dir, { recursive: true, force: true });
  }, 30000);
});
