import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { latestTracePath, readTrace } from '../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'server.ts');
const cliPath = join(__dirname, '../../src/cli/index.ts');

async function main() {
  console.log('1. Starting agentrec MCP proxy wrapping mock MCP server...');

  const proxy = execa(
    'node',
    [
      '--import',
      'tsx',
      cliPath,
      'mcp',
      '--',
      'node',
      '--import',
      'tsx',
      serverPath,
    ],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
    }
  );

  // Set up response listener to read JSON-RPC responses from stdout
  const responses: any[] = [];
  let buffer = '';
  proxy.stdout!.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        responses.push(JSON.parse(line.trim()));
      } catch {
        // ignore non-json log lines
      }
    }
  });

  console.log('2. Client sends tools/call request: calculator(12, 30, add)');
  proxy.stdin!.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: {
        name: 'calculator',
        arguments: { a: 12, b: 30, operation: 'add' },
      },
    }) + '\n'
  );

  console.log('3. Client sends tools/call request: get_weather("Tokyo")');
  proxy.stdin!.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'call-2',
      method: 'tools/call',
      params: {
        name: 'get_weather',
        arguments: { location: 'Tokyo' },
      },
    }) + '\n'
  );

  // Wait for responses to arrive
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const check = () => {
      if (responses.length >= 2 || Date.now() - start > 5000) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });

  console.log(`4. Received ${responses.length} transparent responses from MCP server:`);
  for (const resp of responses) {
    console.log(`   - id ${resp.id}:`, JSON.stringify(resp.result ?? resp.error));
  }

  // Gracefully close client stdin so server and proxy exit
  console.log('5. Closing client stdin to finish MCP session...');
  proxy.stdin!.end();
  await proxy;

  // Read recorded trace
  const tracePath = await latestTracePath();
  const trace = await readTrace(tracePath);

  console.log('\n--- Recorded MCP Trace ---');
  console.log(`Run ID: ${trace.runId}`);
  console.log(`Status: ${trace.status}`);
  console.log(`Events recorded: ${trace.events.length}`);
  for (const event of trace.events) {
    console.log(`  - [${event.type}] ${event.name ?? ''}: ${JSON.stringify(event.data ?? {})}`);
  }
  console.log(`\nTrace saved to: ${tracePath}`);
}

main().catch((err) => {
  console.error('Error running MCP proxy example:', err);
  process.exitCode = 1;
});
