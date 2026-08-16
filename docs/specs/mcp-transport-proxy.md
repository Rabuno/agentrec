# Spec: MCP Transport Proxy

## Problem Statement

AI Agents communicate with local MCP (Model Context Protocol) servers to run tools, read resources, and use prompts. However, recording and debugging these MCP interactions is difficult, often requiring custom SDK integration code inside the Agent codebase. There is currently no simple, zero-code way to transparently record MCP sessions (like Stdio traffic) for tools like Claude Desktop or Cursor without modifying the agent or server code.

## Solution

Introduce a command-line transport proxy: `agentrec mcp -- <mcp-server-command>`. This command launches the target MCP server command, intercepts the Stdio (stdin/stdout) stream, parses the JSON-RPC messages exchanged between the client (e.g. Cursor, Claude Desktop) and the server, and automatically records tools/call requests/responses as Tool Calls inside a Trace. It passes the raw stdio streams through untouched to preserve transparent functionality.

## User Stories

1. As an AI developer, I want to wrap my MCP server command with `agentrec mcp`, so that I can automatically record every tool call made by Claude Desktop or Cursor during debugging.
2. As a QA engineer, I want MCP sessions to be saved as standard Trace JSON files, so that I can diff them and detect regressions in tool calling logic.
3. As a security reviewer, I want the recorded MCP Traces to respect my configured Redaction rules, so that sensitive tokens and API keys are not written to disk.
4. As an IDE user, I want the MCP Stdio Proxy to be completely transparent with zero overhead, so that my Cursor editor does not experience latency or message corruption.
5. As a CLI user, I want to use standard CLI options (like `--dir` to customize the output directory), so that I can organize my MCP Traces.

## Implementation Decisions

- **CLI Interface**: Add `mcp` command to `src/cli/index.ts` using the format `agentrec mcp -- <command-to-run-server>`.
- **Stdio Interception**: The command will spawn the target MCP server using `execa` or Node's `child_process`. It will pipe `process.stdin` to the server's `stdin` and the server's `stdout` to `process.stdout`, while intercepting the JSON streams.
- **JSON-RPC Parsing**: Read incoming chunks on both streams, splitting them by message boundaries (usually newlines in Stdio MCP transport or Content-Length headers if applicable).
- **Trace Event Mapping**:
  - Intercept client-to-server requests where `method` is `tools/call`. Record this as an `AgentRecorder.recordToolCall(name, arguments)` event.
  - Intercept server-to-client responses containing the result of that `tools/call` request. Match using the JSON-RPC `id` and record this as an `AgentRecorder.recordToolResult(name, result)` event.
  - Wrap these events inside a standard run start (`startRun`) and finish (`finishRun`).
- **Standard Storage**: Use the existing `AgentRecorder` and storage layer to persist the resulting Trace file to the `.agentrec/` directory.

## Testing Decisions

- **Seam**: We will test the external behavior of the `mcp` CLI command using `vitest` and `execa`.
- **E2E Test Pattern**:
  - Spin up a mock MCP server (a tiny script that reads JSON-RPC from stdin and writes responses to stdout).
  - Run the CLI command wrapping the mock server, pipe sample JSON-RPC messages to stdin, and verify the console output matches the mock server's output exactly (transparency).
  - Verify that a valid Trace JSON file is successfully created in the trace directory.
  - Verify that the Trace contains the expected tool calls and results.

## Out of Scope

- HTTP/SSE (Server-Sent Events) MCP transport proxying (this spec covers Stdio transport only).
- Recording custom client-to-server notifications that are not standard tool calls (e.g. log messages from the server are passed through but not parsed as tool calls).

## Further Notes

None.
