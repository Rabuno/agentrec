# Demo

```bash
npm install
npm run build
node dist/cli/index.js init
npm run example
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js show "$TRACE"
node dist/cli/index.js replay "$TRACE"
node dist/cli/index.js diff "$TRACE" "$TRACE"
```

Expected result:

- A trace JSON file appears under `.agentrec/runs/`.
- `show` renders the run timeline with tool calls and LLM response.
- `replay` prints recorded tool/LLM outputs.
- `diff` exits 0 for matching traces.
