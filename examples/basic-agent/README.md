# Basic Agent Example

```bash
npm run example
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js show "$TRACE"
```
