import type { AgentEvent, AgentEventType, AgentTrace } from './core/types.js';

export class ReplayStore {
  private readonly replayEvents: AgentEvent[];
  private readonly llmResponses: AgentEvent[];
  private readonly toolResults: AgentEvent[];
  private cursor = 0;

  constructor(trace: AgentTrace) {
    this.replayEvents = trace.events.filter((event) => event.type === 'llm.response' || event.type === 'tool.result');
    this.llmResponses = trace.events.filter((event) => event.type === 'llm.response');
    this.toolResults = trace.events.filter((event) => event.type === 'tool.result');
  }

  /**
   * Replay the next recorded LLM/tool result in original event order.
   * Use this for deterministic replay when repeated tool names can appear.
   */
  nextEvent(expectedType?: Extract<AgentEventType, 'llm.response' | 'tool.result'>, expectedName?: string) {
    const event = this.replayEvents[this.cursor];
    if (!event) throw new Error('Replay exhausted: no recorded replay event left.');

    if (expectedType && event.type !== expectedType) {
      throw new Error(`Replay mismatch: expected ${expectedType}, got ${event.type}.`);
    }

    if (expectedName && event.name !== expectedName) {
      throw new Error(`Replay mismatch: expected ${expectedName}, got ${event.name ?? 'unnamed event'}.`);
    }

    this.cursor += 1;
    return event;
  }

  nextLlmResponse() {
    const event = this.llmResponses.shift();
    if (!event) throw new Error('Replay exhausted: no recorded LLM response left.');
    return event.data;
  }

  nextToolResult(toolName: string) {
    const index = this.toolResults.findIndex((event) => event.name === toolName);
    if (index < 0) throw new Error(`Replay exhausted: no recorded result for tool ${toolName}.`);
    return this.toolResults.splice(index, 1)[0].data;
  }
}
