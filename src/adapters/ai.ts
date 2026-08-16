import type { LanguageModelMiddleware } from 'ai';
import type { AgentRecorder } from '../core/recorder.js';
import { createRecordingHelpers } from './shared.js';

type ToolResultPart = { type: 'tool-result'; toolCallId: string; toolName: string; output: { type: string; value: unknown } };
type PromptMessage = { content?: unknown };
type ToolCallInfo = { toolCallId: string; toolName: string; input: string };
type GenerateResultLike = {
  content: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; input?: string }>;
  finishReason: { unified: string };
  usage: { inputTokens: { total: number | undefined }; outputTokens: { total: number | undefined } };
};

/**
 * Transparent recording middleware for the Vercel AI SDK: wrap a model once
 * with `wrapLanguageModel({ model, middleware: agentrecMiddleware(recorder) })`
 * and every generateText/streamText call records automatically.
 *
 * Never throws into the wrapped model — recording is best-effort. A missing
 * `startRun()` or a failure while recording logs one warning per failure kind
 * and degrades gracefully instead of breaking the user's LLM call or stream.
 */
export function agentrecMiddleware(recorder: AgentRecorder): LanguageModelMiddleware {
  const seenToolResultIds = new Set<string>();
  const { warnOnce, isRecording, safeRecord, recordStreamResponse } = createRecordingHelpers(recorder);

  // Tool results never come back to a model-level middleware directly; they reappear
  // as `tool-result` parts in the *next* step's prompt. Reconstruct them from there.
  function recordToolResultsFromPrompt(prompt: readonly PromptMessage[]) {
    for (const message of prompt) {
      const parts = Array.isArray(message.content) ? (message.content as ToolResultPart[]) : [];
      for (const part of parts) {
        if (part.type !== 'tool-result' || seenToolResultIds.has(part.toolCallId)) continue;
        seenToolResultIds.add(part.toolCallId);
        recorder.recordToolResult(part.toolName, { toolCallId: part.toolCallId, output: part.output.value });
      }
    }
  }

  function recordRequest(prompt: readonly PromptMessage[], tools: unknown, model: { provider: string; modelId: string }) {
    safeRecord(() => {
      recordToolResultsFromPrompt(prompt);
      recorder.recordLlmRequest({ provider: model.provider, modelId: model.modelId, prompt, tools });
    });
  }

  function recordGenerateResponse(model: { provider: string; modelId: string }, result: GenerateResultLike, startedAt: number) {
    safeRecord(() => {
      const { text, toolCalls } = extractGenerateResult(result);
      recorder.recordLlmResponse({
        provider: model.provider,
        modelId: model.modelId,
        text,
        finishReason: result.finishReason.unified,
        usage: { inputTokens: result.usage.inputTokens.total, outputTokens: result.usage.outputTokens.total },
        durationMs: Date.now() - startedAt,
      });
      for (const call of toolCalls) recorder.recordToolCall(call.toolName, { toolCallId: call.toolCallId, input: call.input });
    });
  }

  return {
    wrapGenerate: async ({ doGenerate, params, model }) => {
      if (!isRecording()) {
        warnOnce('no-active-run', 'no active run (call recorder.startRun() first) — recording skipped, call passed through.');
        return doGenerate();
      }

      recordRequest(params.prompt, params.tools, model);
      const startedAt = Date.now();
      const result = await doGenerate();

      recordGenerateResponse(model, result, startedAt);

      return result;
    },

    wrapStream: async ({ doStream, params, model }) => {
      if (!isRecording()) {
        warnOnce('no-active-run', 'no active run (call recorder.startRun() first) — recording skipped, call passed through.');
        return doStream();
      }

      recordRequest(params.prompt, params.tools, model);
      const startedAt = Date.now();
      const { stream, ...rest } = await doStream();

      let text = '';
      const toolCalls: ToolCallInfo[] = [];
      let finishReason: string | undefined;
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;

      const observed = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            // Accumulation must never throw here — a bad chunk would otherwise break the
            // user's stream drain, not just recording. controller.enqueue always runs.
            try {
              if (chunk.type === 'text-delta') text += chunk.delta;
              else if (chunk.type === 'tool-call') toolCalls.push({ toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input });
              else if (chunk.type === 'finish') {
                finishReason = chunk.finishReason.unified;
                usage = { inputTokens: chunk.usage.inputTokens.total, outputTokens: chunk.usage.outputTokens.total };
              }
            } catch (error) {
              warnOnce('record-failure', `failed to process a stream chunk for recording — ${error instanceof Error ? error.message : String(error)}`);
            }
            controller.enqueue(chunk);
          },
          flush() {
            if (!isRecording()) return;
            recordStreamResponse(model, { text, toolCalls, finishReason, usage, durationMs: Date.now() - startedAt });
          },
        }),
      );

      return { stream: observed, ...rest };
    },
  };
}

function extractGenerateResult(result: GenerateResultLike) {
  let text = '';
  const toolCalls: ToolCallInfo[] = [];
  for (const part of result.content) {
    if (part.type === 'text') text += part.text ?? '';
    else if (part.type === 'tool-call') toolCalls.push({ toolCallId: part.toolCallId!, toolName: part.toolName!, input: part.input! });
  }
  return { text, toolCalls };
}
