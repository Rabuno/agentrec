import { createRecorder } from '../../src/index.js';
async function fakeSearchTool(query:string){ return { title:'Agent debugging guide', url:'https://example.com/agent-debugging', snippet:`Best practice for ${query}: record, replay, and regression-test every run.` }; }
async function fakeLlm(prompt:string){ return `Answer based on recorded context: ${prompt.slice(0,80)}`; }
const question=process.argv.slice(2).join(' ')||'How do I debug an AI agent?';
const recorder=createRecorder({metadata:{example:'basic-agent'}});
recorder.startRun({question}); recorder.recordAgentStep('plan',{action:'search_then_answer'}); recorder.recordToolCall('search',{query:question}); const search=await fakeSearchTool(question); recorder.recordToolResult('search',search); const prompt=`Question: ${question}
Search result: ${search.snippet}`; recorder.recordLlmRequest({model:'fake-llm',prompt}); const answer=await fakeLlm(prompt); recorder.recordLlmResponse({model:'fake-llm',text:answer}); await recorder.finishRun({answer}); console.log(answer);
