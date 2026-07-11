import { generateText, stepCountIs, tool, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { agentrecMiddleware } from '../../src/adapters/ai.js';
import { createRecorder } from '../../src/index.js';

// A mock model stands in for a real provider (e.g. openai('gpt-4o')) so this
// example runs with no API key. Swap MockLanguageModelV4 for a real provider
// model and the rest of this file is unchanged.
const mockModel = new MockLanguageModelV4({
  doGenerate: [
    {
      content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'getWeather', input: JSON.stringify({ city: 'San Francisco' }) }],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: { inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 6, text: 6, reasoning: undefined } },
      warnings: [],
    },
    {
      content: [{ type: 'text', text: 'It is 70°F and sunny in San Francisco.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 24, noCache: 24, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } },
      warnings: [],
    },
  ],
});

async function main() {
  const question = process.argv.slice(2).join(' ') || 'What is the weather in San Francisco?';

  // The whole point: wrap the model once, no per-step recorder.record*() calls.
  const recorder = createRecorder({ metadata: { example: 'vercel-ai-sdk' } });
  recorder.startRun({ question });

  const model = wrapLanguageModel({ model: mockModel, middleware: agentrecMiddleware(recorder) });

  const result = await generateText({
    model,
    prompt: question,
    tools: {
      getWeather: tool({
        description: 'Get the current weather for a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ tempF: 70, condition: 'sunny', city }),
      }),
    },
    stopWhen: stepCountIs(5),
  });

  await recorder.finishRun({ text: result.text });

  console.log(result.text);
  console.log('\nTrace written to .agentrec/runs/');
  console.log('View it with:  npx agentrec show $(npx agentrec latest)');
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
