import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { createRecorder } from '../src/core/recorder.js';
import { McpProxy } from '../src/core/mcp.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestTracePath, readTrace } from '../src/core/storage.js';

describe('McpProxy', () => {
  it('correlates tool call and result and records them using in-memory streams', async () => {
    const runDir = await mkdtemp(join(tmpdir(), 'agentrec-mcp-proxy-test-'));
    const recorder = createRecorder({ runDir });
    recorder.startRun();

    const clientStdin = new PassThrough();
    const clientStdout = new PassThrough();
    const serverStdin = new PassThrough();
    const serverStdout = new PassThrough();

    const proxy = new McpProxy(recorder, clientStdin, clientStdout, serverStdin, serverStdout);
    proxy.start();

    // 1. Simulate client sending tools/call request
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'test_tool',
        arguments: { arg1: 'val1' }
      }
    };
    clientStdin.write(JSON.stringify(toolCallRequest) + '\n');

    // 2. Verify that the request is piped transparently to server
    await new Promise<void>((resolve) => {
      serverStdin.once('data', (chunk) => {
        const received = JSON.parse(chunk.toString().trim());
        expect(received).toEqual(toolCallRequest);
        resolve();
      });
    });

    // 3. Simulate server returning tool result
    const toolCallResponse = {
      jsonrpc: '2.0',
      id: 42,
      result: { output: 'success' }
    };
    serverStdout.write(JSON.stringify(toolCallResponse) + '\n');

    // 4. Verify that the response is piped transparently to client
    await new Promise<void>((resolve) => {
      clientStdout.once('data', (chunk) => {
        const received = JSON.parse(chunk.toString().trim());
        expect(received).toEqual(toolCallResponse);
        resolve();
      });
    });

    await recorder.finishRun();

    const path = await latestTracePath(runDir);
    const trace = await readTrace(path);

    expect(trace.events.some(e => e.type === 'tool.call' && e.name === 'test_tool' && e.data?.arg1 === 'val1')).toBe(true);
    expect(trace.events.some(e => e.type === 'tool.result' && e.name === 'test_tool' && (e.data as any)?.output === 'success')).toBe(true);

    await rm(runDir, { recursive: true, force: true });
  });
});
