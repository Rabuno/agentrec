import { generateText, streamText, stepCountIs, tool, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { agentrecMiddleware } from '../src/adapters/ai.js';
import { createRecorder } from '../src/index.js';

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
});

describe('agentrecMiddleware (Vercel AI SDK)', () => {
  it('records a plain text llm.request/llm.response pair', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'hi' });

    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: 'text', text: 'hello there' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: usage(3, 2),
          warnings: [],
        },
      }),
      middleware: agentrecMiddleware(recorder),
    });

    await generateText({ model, prompt: 'hi' });
    await recorder.finishRun({});

    const types = recorder.currentTrace().events.map((e) => e.type);
    expect(types).toEqual(['run.started', 'llm.request', 'llm.response', 'run.finished']);

    const response = recorder.currentTrace().events.find((e) => e.type === 'llm.response')!;
    expect(response.data).toMatchObject({ text: 'hello there', finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it('records a tool call and reconstructs its result from the next step prompt', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'weather?' });

    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: [
          {
            content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'getWeather', input: JSON.stringify({ city: 'sf' }) }],
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: usage(10, 5),
            warnings: [],
          },
          {
            content: [{ type: 'text', text: 'It is sunny.' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: usage(20, 8),
            warnings: [],
          },
        ],
      }),
      middleware: agentrecMiddleware(recorder),
    });

    await generateText({
      model,
      prompt: 'What is the weather in SF?',
      tools: {
        getWeather: tool({
          description: 'get weather',
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ tempF: 70, city }),
        }),
      },
      stopWhen: stepCountIs(5),
    });
    await recorder.finishRun({});

    const events = recorder.currentTrace().events;
    const call = events.find((e) => e.type === 'tool.call')!;
    const result = events.find((e) => e.type === 'tool.result')!;
    expect(call.data).toMatchObject({ toolCallId: 'call_1', input: JSON.stringify({ city: 'sf' }) });
    expect(result.data).toMatchObject({ toolCallId: 'call_1', output: { tempF: 70, city: 'sf' } });
    expect(events.filter((e) => e.type === 'llm.request')).toHaveLength(2);
  });

  it('records a streamed response by draining the stream', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'stream?' });

    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doStream: {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hel' },
              { type: 'text-delta', id: '1', delta: 'lo' },
              { type: 'text-end', id: '1' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(3, 2) },
            ],
          }),
        },
      }),
      middleware: agentrecMiddleware(recorder),
    });

    const result = streamText({ model, prompt: 'hi' });
    for await (const _ of result.textStream) {
      // drain so the underlying stream's flush() fires before we assert
    }
    await recorder.finishRun({ text: await result.text });

    const response = recorder.currentTrace().events.find((e) => e.type === 'llm.response')!;
    expect(response.data).toMatchObject({ text: 'Hello', finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it('passes calls through and warns only once across repeated calls when there is no active run', async () => {
    const recorder = createRecorder({ autoSave: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: { content: [{ type: 'text', text: 'ok' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(1, 1), warnings: [] },
      }),
      middleware: agentrecMiddleware(recorder),
    });

    const first = await generateText({ model, prompt: 'hi' });
    const second = await generateText({ model, prompt: 'hi again' });
    expect(first.text).toBe('ok');
    expect(second.text).toBe('ok');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('startRun()');

    warn.mockRestore();
  });

  it('does not let a failed trace write break the LLM call', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'hi' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(recorder, 'recordLlmRequest').mockImplementation(() => {
      throw new Error('disk full');
    });

    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: { content: [{ type: 'text', text: 'ok' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(1, 1), warnings: [] },
      }),
      middleware: agentrecMiddleware(recorder),
    });

    const result = await generateText({ model, prompt: 'hi' });
    expect(result.text).toBe('ok');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));

    warn.mockRestore();
  });
});
