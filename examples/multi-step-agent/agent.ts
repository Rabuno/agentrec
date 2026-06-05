/**
 * Multi-step agent example — Research assistant
 *
 * Demonstrates agentrec with a realistic multi-step agent that:
 * 1. Plans a research strategy
 * 2. Searches a knowledge base
 * 3. Searches the web (simulated)
 * 4. Synthesizes a structured answer using an LLM
 * 5. Validates the output shape
 *
 * No API keys are needed — all LLM/tool calls are simulated.
 * This pattern mirrors real-world agents that chain tool calls and LLM reasoning.
 */

import { createRecorder } from '../../src/index.js';

// --- Simulated tools ---

type SearchResult = { title: string; url: string; snippet: string };

const knowledgeBase: Record<string, SearchResult[]> = {
  'agent rec': [
    { title: 'Agent Recorder Pattern', url: 'https://example.com/agent-rec',
      snippet: 'Capture every agent step locally for replay, diff, and regression testing.' },
    { title: 'Flight Recorder for AI', url: 'https://example.com/flight-recorder',
      snippet: 'agentrec records prompts, tools, and outputs as portable JSON traces.' },
  ],
  'debugging agents': [
    { title: 'Debugging AI Agents', url: 'https://example.com/debug-agents',
      snippet: 'Use recorded traces to replay failures and diff regression outputs.' },
  ],
};

async function searchKnowledge(query: string): Promise<SearchResult[]> {
  await delay(15);
  const lower = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const [key, vals] of Object.entries(knowledgeBase)) {
    if (lower.includes(key) || key.split(' ').some(w => lower.includes(w))) {
      results.push(...vals);
    }
  }
  return results.length > 0 ? results : [
    { title: `No exact match for "${query}"`, url: '', snippet: 'Try broadening the query.' },
  ];
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  await delay(25);
  return [
    { title: `Web result: ${query}`, url: 'https://example.com/web',
      snippet: `General web information about ${query}.` },
  ];
}

// --- Simulated LLM ---

async function llmChat(systemPrompt: string, userPrompt: string): Promise<string> {
  await delay(30);
  if (systemPrompt.includes('planner')) {
    return JSON.stringify({
      search_query: 'agent rec',
      use_web_search: true,
      secondary_query: 'debugging agents',
    });
  }
  return JSON.stringify({
    answer: 'To debug AI agent regressions, use a flight recorder: record every agent run locally, then replay, diff, and regression-test traces. agentrec provides exactly this capability.',
    sources: ['Agent Recorder Pattern', 'Flight Recorder for AI', 'Debugging AI Agents'],
    confidence: 0.92,
  });
}

// --- Agent ---

async function researchAgent(question: string) {
  const recorder = createRecorder({
    metadata: {
      example: 'multi-step-agent',
      agent: 'research-assistant',
      question,
    },
  });

  recorder.startRun({ question });
  recorder.recordAgentStep('init', { message: 'Starting research agent.' });

  // Step 1: Plan research strategy
  recorder.recordAgentStep('plan', { phase: 'planning' });
  recorder.recordLlmRequest({
    model: 'mock-planner',
    system: 'You are a research planner. Output JSON: {search_query, use_web_search, secondary_query}',
    user: `Plan research for: ${question}`,
  });
  const planRaw = await llmChat('You are a research planner.', question);
  recorder.recordLlmResponse({ model: 'mock-planner', content: planRaw });
  const plan = JSON.parse(planRaw) as {
    search_query: string;
    use_web_search: boolean;
    secondary_query: string;
  };

  // Step 2: Search knowledge base
  recorder.recordAgentStep('search_kb', { query: plan.search_query });
  recorder.recordToolCall('searchKnowledge', { query: plan.search_query });
  const kbResults = await searchKnowledge(plan.search_query);
  recorder.recordToolResult('searchKnowledge', { results: kbResults });

  // Step 3: Search secondary topic
  recorder.recordAgentStep('search_secondary', { query: plan.secondary_query });
  recorder.recordToolCall('searchKnowledge', { query: plan.secondary_query });
  const kbResults2 = await searchKnowledge(plan.secondary_query);
  recorder.recordToolResult('searchKnowledge', { results: kbResults2 });

  // Step 4: Optional web search
  let webResults: SearchResult[] = [];
  if (plan.use_web_search) {
    recorder.recordAgentStep('search_web', { query: plan.search_query });
    recorder.recordToolCall('searchWeb', { query: plan.search_query });
    webResults = await searchWeb(plan.search_query);
    recorder.recordToolResult('searchWeb', { results: webResults });
  }

  // Step 5: Synthesize answer
  recorder.recordAgentStep('synthesize', { phase: 'synthesis' });
  const allSnippets = [...kbResults, ...kbResults2, ...webResults]
    .map(r => `- ${r.title}: ${r.snippet}`)
    .join('\n');
  recorder.recordLlmRequest({
    model: 'mock-synthesizer',
    system: 'You are a synthesizer. Answer the question using the sources. Output JSON: {answer, sources, confidence}',
    user: `Question: ${question}\n\nSources:\n${allSnippets}`,
  });
  const answerRaw = await llmChat('You are a synthesizer.', allSnippets);
  recorder.recordLlmResponse({ model: 'mock-synthesizer', content: answerRaw });
  const answer = JSON.parse(answerRaw) as { answer: string; sources: string[]; confidence: number };

  // Step 6: Validate output shape
  recorder.recordAgentStep('validate', {
    hasAnswer: answer.answer.length > 0,
    sourceCount: answer.sources.length,
    confidence: answer.confidence,
  });
  recorder.recordToolCall('validateAnswer', { answer });
  const validation = answer.answer.length > 0 && answer.sources.length >= 2 && answer.confidence >= 0.7
    ? { valid: true } : { valid: false, reason: 'Insufficient sources or confidence' };
  recorder.recordToolResult('validateAnswer', validation);

  const output = {
    question,
    answer: answer.answer,
    sources: answer.sources,
    confidence: answer.confidence,
    validation,
  };

  await recorder.finishRun(output);
  return output;
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---

async function main() {
  const question = process.argv.slice(2).join(' ')
    || 'How do I debug AI agent regressions?';

  console.log(`Researching: "${question}"\n`);
  const result = await researchAgent(question);

  console.log(`\nAnswer: ${result.answer}`);
  console.log(`Sources: ${result.sources.join(', ')}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Validation: ${result.validation.valid ? 'PASS' : 'FAIL'}`);
  console.log(`\nTrace written to .agentrec/runs/`);
  console.log('View it with:  npx agentrec list');
  console.log('               npx agentrec show <trace>');
  console.log('               npx agentrec report <trace>');
}

main().catch(async error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
