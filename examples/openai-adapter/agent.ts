import OpenAI from 'openai';
import { wrapOpenAI } from '../../src/adapters/openai.js';
import { createRecorder } from '../../src/index.js';

// A stubbed `fetch` stands in for a real API key so this example runs with no network
// access. Swap it for a real OpenAI() client (no fetch override) and the rest of this
// file is unchanged.
function mockFetch(): Promise<Response> {
  const body = {
    id: 'chatcmpl_mock_001',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4.1-mini',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'Record the request, response, and tool calls as a local trace.' }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 31, completion_tokens: 15, total_tokens: 46 },
  };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
}

async function main() {
  const question = process.argv.slice(2).join(' ') || 'How should I debug an AI agent regression?';

  // The whole point: wrap the client once, no per-call recorder.record*() calls.
  const recorder = createRecorder({ metadata: { example: 'openai-adapter' } });
  recorder.startRun({ question });

  const client = wrapOpenAI(new OpenAI({ apiKey: 'sk-mock', fetch: mockFetch }), recorder);

  const completion = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'You are a concise developer assistant.' },
      { role: 'user', content: question },
    ],
  });

  const answer = completion.choices[0]?.message.content ?? '';
  await recorder.finishRun({ answer });

  console.log(answer);
  console.log('\nTrace written to .agentrec/runs/');
  console.log('View it with:  npx agentrec show $(npx agentrec latest)');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
