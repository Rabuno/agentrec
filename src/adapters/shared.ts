import type { AgentRecorder } from '../core/recorder.js';

export type ToolCallInfo = { toolCallId: string; toolName: string; input: string };

export function createRecordingHelpers(recorder: AgentRecorder) {
  const warned = new Set<string>();

  function warnOnce(key: string, message: string) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[agentrec] ${message}`);
  }

  function isRecording(): boolean {
    try {
      return recorder.currentTrace().status === 'running';
    } catch {
      return false;
    }
  }

  function safeRecord(fn: () => void) {
    try {
      fn();
    } catch (error) {
      warnOnce('record-failure', `failed to record a trace event — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function recordStreamResponse(
    model: { provider: string; modelId?: string; model?: string } | string | undefined,
    data: { text: string; toolCalls: ToolCallInfo[]; finishReason?: string; usage?: { inputTokens?: number; outputTokens?: number }; durationMs: number },
  ) {
    safeRecord(() => {
      const provider = typeof model === 'object' && model ? model.provider : 'openai';
      const modelId = typeof model === 'object' && model ? model.modelId : undefined;
      const modelName = typeof model === 'object' && model ? model.model : (typeof model === 'string' ? model : undefined);

      recorder.recordLlmResponse({
        provider,
        modelId,
        model: modelName,
        text: data.text,
        finishReason: data.finishReason,
        usage: data.usage,
        durationMs: data.durationMs,
      });
      for (const call of data.toolCalls) {
        recorder.recordToolCall(call.toolName, { toolCallId: call.toolCallId, input: call.input });
      }
    });
  }

  return {
    warnOnce,
    isRecording,
    safeRecord,
    recordStreamResponse,
  };
}
