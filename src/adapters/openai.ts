import type { AgentRecorder } from '../core/recorder.js';
import { createRecordingHelpers } from './shared.js';

type ToolCallInfo = { toolCallId: string; toolName: string; input: string };
type ChatMessage = {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type?: string; function?: { name: string; arguments: string } }>;
};
type CreateParams = { model?: string; messages: ChatMessage[]; tools?: unknown; stream?: boolean };
type APIPromiseLike<T> = Promise<T> & { _thenUnwrap<U>(transform: (data: T) => U): APIPromiseLike<U> };
type OpenAIClientLike = {
  chat: {
    completions: {
      // Method-shorthand syntax (not a `create: (...) => ...` property) so TS checks
      // parameters bivariantly — a real client's overloaded, narrower-typed `create`
      // is otherwise not assignable to a single wider structural signature like this one.
      create(params: CreateParams, options?: unknown): APIPromiseLike<any>;
    };
  };
};

/**
 * Transparent recording wrapper for the OpenAI SDK: wraps `client.chat.completions.create`
 * once and every call records automatically.
 *
 * Mutates the passed client in place and returns it (documented — not a clone; `OpenAI`
 * instances carry private fields and other resources that are unsafe to shallow-copy).
 * The wrapped `create` still returns a real `APIPromise`/`Stream` (via `_thenUnwrap` and
 * in-place iterator patching), so `.withResponse()`, `.parse()`, `.stream()`, and
 * `runTools()` keep working — a naive wrapper that reshapes the return value breaks them.
 *
 * Never throws into the wrapped call — recording is best-effort. A missing `startRun()`
 * or a failure while recording logs one warning per failure kind and degrades gracefully.
 */
export function wrapOpenAI<T extends OpenAIClientLike>(client: T, recorder: AgentRecorder): T {
  const seenToolResultIds = new Set<string>();
  const { warnOnce, isRecording, safeRecord, recordStreamResponse } = createRecordingHelpers(recorder);

  // Tool results only reappear on the NEXT request as {role:'tool', tool_call_id, content} —
  // that message has no tool name, but the preceding assistant tool-call message (resent as
  // history) does. Scan both within the same request, no cross-request state needed.
  function recordToolResultsFromMessages(messages: ChatMessage[]) {
    const toolNameByCallId = new Map<string, string>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const call of message.tool_calls ?? []) {
        if (call.type === 'function' && call.function) toolNameByCallId.set(call.id, call.function.name);
      }
    }
    for (const message of messages) {
      if (message.role !== 'tool' || !message.tool_call_id || seenToolResultIds.has(message.tool_call_id)) continue;
      seenToolResultIds.add(message.tool_call_id);
      recorder.recordToolResult(toolNameByCallId.get(message.tool_call_id) ?? 'unknown', {
        toolCallId: message.tool_call_id,
        output: message.content,
      });
    }
  }

  function recordRequest(params: CreateParams) {
    safeRecord(() => {
      recordToolResultsFromMessages(params.messages);
      recorder.recordLlmRequest({ provider: 'openai', model: params.model, messages: params.messages, tools: params.tools });
    });
  }

  function extractFunctionToolCalls(toolCalls: ChatMessage['tool_calls']): ToolCallInfo[] {
    const calls: ToolCallInfo[] = [];
    for (const call of toolCalls ?? []) {
      if (call.type === 'function' && call.function) calls.push({ toolCallId: call.id, toolName: call.function.name, input: call.function.arguments });
    }
    return calls;
  }

  function recordResponse(completion: any, startedAt: number) {
    safeRecord(() => {
      const message = completion.choices?.[0]?.message ?? {};
      const usage = completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : undefined;
      recorder.recordLlmResponse({
        provider: 'openai',
        model: completion.model,
        text: message.content ?? '',
        finishReason: completion.choices?.[0]?.finish_reason,
        usage,
        durationMs: Date.now() - startedAt,
      });
      for (const call of extractFunctionToolCalls(message.tool_calls)) {
        recorder.recordToolCall(call.toolName, { toolCallId: call.toolCallId, input: call.input });
      }
    });
  }

  // Patches the real Stream instance's iterator in place (never returns a reshaped plain
  // generator) so .controller/.toReadableStream() and SDK helpers built on them keep working.
  // The original iterator is captured lazily on first use — Stream's SSE source marks itself
  // "consumed" on the first [Symbol.asyncIterator]() call, so grabbing it eagerly here (before
  // the caller ever iterates) would break the caller's own iteration.
  function patchStreamIteration(stream: any, startedAt: number) {
    const originalAsyncIterator = Object.getPrototypeOf(stream)[Symbol.asyncIterator];
    let text = '';
    const toolCallsByIndex = new Map<number, ToolCallInfo>();
    let finishReason: string | undefined;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    let model: string | undefined;
    let recorded = false;

    const recordOnce = () => {
      if (recorded) return;
      recorded = true;
      if (!isRecording()) return;
      recordStreamResponse(model, { text, toolCalls: [...toolCallsByIndex.values()], finishReason, usage, durationMs: Date.now() - startedAt });
    };

    stream[Symbol.asyncIterator] = function () {
      let realIterator: AsyncIterator<any> | null = null;
      return {
        async next() {
          realIterator ??= originalAsyncIterator.call(stream);
          const result = await realIterator!.next();
          if (result.done) {
            recordOnce();
            return result;
          }
          try {
            const chunk = result.value;
            model ??= chunk.model;
            const choice = chunk.choices?.[0];
            if (choice?.delta?.content) text += choice.delta.content;
            for (const tc of choice?.delta?.tool_calls ?? []) {
              const existing = toolCallsByIndex.get(tc.index) ?? { toolCallId: tc.id ?? '', toolName: tc.function?.name ?? '', input: '' };
              if (tc.id) existing.toolCallId = tc.id;
              if (tc.function?.name) existing.toolName = tc.function.name;
              if (tc.function?.arguments) existing.input += tc.function.arguments;
              toolCallsByIndex.set(tc.index, existing);
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
          } catch (error) {
            warnOnce('record-failure', `failed to process a stream chunk for recording — ${error instanceof Error ? error.message : String(error)}`);
          }
          return result;
        },
        async return(value: unknown) {
          recordOnce();
          const iterator = (realIterator ??= originalAsyncIterator.call(stream));
          return iterator.return ? iterator.return(value) : { value, done: true };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    };
  }

  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = ((params: CreateParams, options?: unknown) => {
    if (!isRecording()) {
      warnOnce('no-active-run', 'no active run (call recorder.startRun() first) — recording skipped, call passed through.');
      return original(params, options);
    }

    recordRequest(params);
    const startedAt = Date.now();

    if (params.stream) {
      return original(params, options)._thenUnwrap((stream: any) => {
        patchStreamIteration(stream, startedAt);
        return stream;
      });
    }

    return original(params, options)._thenUnwrap((completion: any) => {
      recordResponse(completion, startedAt);
      return completion;
    });
  }) as OpenAIClientLike['chat']['completions']['create'];

  return client;
}
