import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { wrapOpenAI } from '../src/adapters/openai.js';
import { createRecorder } from '../src/index.js';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function sseResponse(chunks: unknown[]) {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function chatCompletion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl_1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello there' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    ...overrides,
  };
}

function client(fetchImpl: (...args: unknown[]) => Promise<Response>) {
  return new OpenAI({ apiKey: 'test', fetch: fetchImpl as never });
}

describe('wrapOpenAI', () => {
  it('records a plain text llm.request/llm.response pair', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'hi' });

    const wrapped = wrapOpenAI(client(async () => jsonResponse(chatCompletion())), recorder);
    const completion = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    await recorder.finishRun({});

    expect(completion.choices[0].message.content).toBe('hello there');
    const types = recorder.currentTrace().events.map((e) => e.type);
    expect(types).toEqual(['run.started', 'llm.request', 'llm.response', 'run.finished']);
    const response = recorder.currentTrace().events.find((e) => e.type === 'llm.response')!;
    expect(response.data).toMatchObject({ text: 'hello there', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 3 } });
  });

  it('preserves a real APIPromise (.withResponse() still works)', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'hi' });

    const wrapped = wrapOpenAI(client(async () => jsonResponse(chatCompletion())), recorder);
    const apiPromise = wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(typeof (apiPromise as any)._thenUnwrap).toBe('function');

    const { data, response } = await (apiPromise as any).withResponse();
    expect(response.status).toBe(200);
    expect(data.choices[0].message.content).toBe('hello there');
  });

  it('records a function tool call and reconstructs its result from the next request', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'weather?' });

    let call = 0;
    const wrapped = wrapOpenAI(
      client(async () => {
        call += 1;
        if (call === 1) {
          return jsonResponse(
            chatCompletion({
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"sf"}' } }] },
                  finish_reason: 'tool_calls',
                },
              ],
            }),
          );
        }
        return jsonResponse(chatCompletion({ choices: [{ index: 0, message: { role: 'assistant', content: 'It is sunny.' }, finish_reason: 'stop' }] }));
      }),
      recorder,
    );

    const messages: any[] = [{ role: 'user', content: 'What is the weather in SF?' }];
    const first = await wrapped.chat.completions.create({ model: 'gpt-4o', messages });
    messages.push(first.choices[0].message);
    messages.push({ role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ tempF: 70, city: 'sf' }) });
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages });
    await recorder.finishRun({});

    const events = recorder.currentTrace().events;
    const toolCall = events.find((e) => e.type === 'tool.call')!;
    const toolResult = events.find((e) => e.type === 'tool.result')!;
    expect(toolCall.data).toMatchObject({ toolCallId: 'call_1', input: '{"city":"sf"}' });
    expect(toolCall.name).toBe('getWeather');
    expect(toolResult.data).toMatchObject({ toolCallId: 'call_1', output: JSON.stringify({ tempF: 70, city: 'sf' }) });
    expect(toolResult.name).toBe('getWeather');
    expect(events.filter((e) => e.type === 'llm.request')).toHaveLength(2);
  });

  it('records a streamed response, preserving the real Stream instance (.controller works)', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'stream?' });

    const wrapped = wrapOpenAI(
      client(async () =>
        sseResponse([
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hel' }, finish_reason: null }] },
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: null }] },
          {
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
          },
        ]),
      ),
      recorder,
    );

    const stream = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream: true });
    expect((stream as any).controller).toBeDefined();
    for await (const _chunk of stream as any) {
      // drain
    }
    await recorder.finishRun({});

    const response = recorder.currentTrace().events.find((e) => e.type === 'llm.response')!;
    expect(response.data).toMatchObject({ text: 'Hello', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 2 } });
  });

  it('accumulates a streamed tool call spread across delta chunks', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'weather?' });

    const wrapped = wrapOpenAI(
      client(async () =>
        sseResponse([
          {
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'getWeather', arguments: '{"city":' } }] }, finish_reason: null }],
          },
          {
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"sf"}' } }] }, finish_reason: null }],
          },
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ]),
      ),
      recorder,
    );

    const stream = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'weather in sf?' }], stream: true });
    for await (const _chunk of stream as any) {
      // drain
    }
    await recorder.finishRun({});

    const toolCall = recorder.currentTrace().events.find((e) => e.type === 'tool.call')!;
    expect(toolCall.name).toBe('getWeather');
    expect(toolCall.data).toMatchObject({ toolCallId: 'call_1', input: '{"city":"sf"}' });
  });

  it('records partial accumulation when the stream consumer breaks early', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'stream?' });

    const wrapped = wrapOpenAI(
      client(async () =>
        sseResponse([
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant', content: 'A' }, finish_reason: null }] },
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'B' }, finish_reason: null }] },
          { id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'C' }, finish_reason: 'stop' }] },
        ]),
      ),
      recorder,
    );

    const stream = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream: true });
    for await (const _chunk of stream as any) {
      break;
    }
    await recorder.finishRun({});

    const response = recorder.currentTrace().events.find((e) => e.type === 'llm.response')!;
    expect(response.data).toMatchObject({ text: 'A' });
  });

  it('passes calls through and warns only once across repeated calls when there is no active run', async () => {
    const recorder = createRecorder({ autoSave: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapped = wrapOpenAI(client(async () => jsonResponse(chatCompletion())), recorder);
    const first = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const second = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi again' }] });

    expect(first.choices[0].message.content).toBe('hello there');
    expect(second.choices[0].message.content).toBe('hello there');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('startRun()');

    warn.mockRestore();
  });

  it('does not let a failed trace write break the real API call', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun({ q: 'hi' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(recorder, 'recordLlmRequest').mockImplementation(() => {
      throw new Error('disk full');
    });

    const wrapped = wrapOpenAI(client(async () => jsonResponse(chatCompletion())), recorder);
    const completion = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });

    expect(completion.choices[0].message.content).toBe('hello there');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));

    warn.mockRestore();
  });
});
