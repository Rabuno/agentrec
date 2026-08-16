# agentrec

A local-first black box recorder and regression testing layer for AI agents.

## Language

**Trace**:
A portable JSON document (`agentrec.trace.v1`) recording a single execution of an AI agent, containing inputs, outputs, metadata, and a sequential timeline of events.
_Avoid_: Log, run log, history

**Baseline**:
A reference Trace representing the expected correct behavior of an agent run for a specific input scenario.
_Avoid_: Golden trace, expected output

**Redaction**:
A pipeline that automatically scrubs sensitive credentials from Traces and reports before they are written to disk.
_Avoid_: Sanitization, masking, filtering

**Playback**:
An interactive visual interface (served locally via a dev server) that renders a Trace timeline, allowing step-by-step navigation, inspection of prompts/outputs, and debugging.
_Avoid_: Report web view, trace viewer dashboard

**MCP Proxy**:
A command-line transport proxy that intercepts standard I/O (Stdio) or HTTP (SSE) JSON-RPC traffic between an MCP Client (e.g. Cursor, Claude Desktop) and an MCP Server, recording calls and responses into a Trace.
_Avoid_: MCP Agent, MCP Server wrapper

