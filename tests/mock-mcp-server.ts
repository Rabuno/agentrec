import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    if (request.method === 'tools/call' && request.params?.name === 'calculate_sum') {
      const { a, b } = request.params.arguments || {};
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: { sum: (a || 0) + (b || 0) }
      };
      console.log(JSON.stringify(response));
    }
  } catch (err) {
    console.error('Error parsing line:', err);
  }
});
