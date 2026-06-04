import { createRecorder } from '../../src/index.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

async function mockChatCompletion(input: { model: string; messages: ChatMessage[] }) {
  await new Promise(resolve => setTimeout(resolve, 10));
  return {
    id: 'chatcmpl_mock_001',
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: 'Record the request, response, tools, and final output as a local trace.'
        },
        finish_reason: 'stop'
      }
    ],
    usage: { prompt_tokens: 31, completion_tokens: 15, total_tokens: 46 }
  };
}

async function main() {
  const recorder = createRecorder({
    metadata: {
      adapter: 'openai-wrapper',
      mode: 'dry-run',
      model: 'gpt-4.1-mini'
    }
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a concise developer assistant.' },
    { role: 'user', content: 'How should I debug an AI agent regression?' }
  ];

  recorder.startRun({ messages });
  recorder.recordLlmRequest({
    provider: 'openai-compatible',
    model: 'gpt-4.1-mini',
    messages
  });

  const response = await mockChatCompletion({ model: 'gpt-4.1-mini', messages });
  recorder.recordLlmResponse({
    id: response.id,
    model: response.model,
    content: response.choices[0]?.message.content,
    usage: response.usage
  });

  const output = { answer: response.choices[0]?.message.content };
  await recorder.finishRun(output);
  console.log(output.answer);
}

main().catch(async error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
