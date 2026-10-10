# MCP Transport Proxy Example

This example demonstrates zero-code flight recording for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers using `agentrec mcp`.

## How it works

The MCP proxy acts as a transparent command-line bridge between an MCP client (such as Claude Desktop or Cursor) and an MCP server:

```
[Claude Desktop / Cursor]  <-- Stdio (JSON-RPC) -->  [agentrec mcp]  <-- Stdio (JSON-RPC) -->  [Your MCP Server]
                                                            │
                                                            ▼ (transparent tap)
                                                     .agentrec/runs/
```

- Intercepts incoming `tools/call` JSON-RPC requests from the client and records them as `tool.call` events.
- Intercepts matching JSON-RPC responses from the server and records them as `tool.result` events.
- Passes all standard I/O streams through untouched with zero performance overhead.
- Requires **zero SDK code** inside your agent or server.

## Running this example

Run the end-to-end example with:

```bash
npm run example:mcp
```

Or run directly with `tsx`:

```bash
tsx examples/mcp-proxy/agent.ts
```

Then inspect the recorded trace:

```bash
TRACE=$(npx agentrec latest)
npx agentrec show "$TRACE"
npx agentrec report "$TRACE"
```

## Configuring in Claude Desktop

Add `agentrec mcp` to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["@rabuno/agentrec", "mcp", "--", "node", "/path/to/server.js"]
    }
  }
}
```

Now every tool invoked by Claude Desktop during your conversations is automatically flight-recorded into `.agentrec/runs/`!

## Configuring in Cursor

Add `agentrec mcp` to your Cursor MCP settings (`mcp.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["@rabuno/agentrec", "mcp", "--", "python", "-m", "my_mcp_server"]
    }
  }
}
```
