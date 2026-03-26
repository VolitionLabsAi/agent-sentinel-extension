# Harness Extensibility Research

Research into hook/event models, session management, transcript formats, and VS Code extension APIs for three AI coding assistant harnesses: OpenAI Codex CLI, GitHub Copilot (VS Code), and Google Gemini CLI.

**Research date:** 2026-03-25

---

## OpenAI Codex CLI

### Hook/Event Model

Codex CLI introduced an **experimental hooks engine** in v0.114.0 (2026-03-11). As of v0.116.0 (2026-03-19), five hook events exist:

| Event | Version | Status | Can Block? |
|---|---|---|---|
| `SessionStart` | v0.114.0 | Experimental | No (stdout injected as context) |
| `Stop` | v0.114.0 | Experimental | No |
| `AfterAgent` | v0.99.0* | Stable | No |
| `AfterToolUse` | v0.100.0* | Stable | No |
| `UserPromptSubmit` | v0.115.0 | Experimental | Yes (first blocking hook) |

*\* Version attributions for AfterAgent (v0.99.0) and AfterToolUse (v0.100.0) could not be independently confirmed from official sources.*

**No PreToolUse/BeforeTool equivalent exists.** All tool-related hooks fire *after* execution (`AfterToolUse`), not before. The `UserPromptSubmit` hook can block prompts before they reach the model, but there is no mechanism to intercept individual tool calls before execution.

The experimental hooks engine may require a feature flag on older versions: `codex -c features.codex_hooks=true`. Note: PR #13276 removed feature gates, so this flag may no longer be needed on recent versions.

**Configuration format** (`.codex/config.toml`):
```toml
[[hooks]]
event = "AfterToolUse"
command = "echo 'Tool completed' >> /tmp/codex-log.txt"
```

Alternatively, a `hooks.json` format under `.codex/` is referenced in community discussions:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "your command here",
        "statusMessage": "display text",
        "timeout": 10
      }]
    }]
  }
}
```

The exact canonical format is unclear — both TOML and JSON configurations appear in different sources. The hooks system is actively evolving with each release.

**Data passed to hooks:** Not formally documented. `SessionStart` stdout is injected into model context. Other hooks appear to receive minimal structured data compared to Claude Code or Gemini CLI.

### Session Management

- **Storage:** `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- **Session IDs:** Auto-generated, stored inside the JSONL files
- **Resume:** `codex resume` (interactive picker), `codex resume --last`, `codex resume <SESSION_ID>`
- **Fork:** `/fork` creates independent threads sharing history up to the branch point (v0.107.0)
- **History:** Global history in `~/.codex/history.jsonl`, configurable via `[history]` section in config

### Transcript Format

**JSONL** — one JSON object per line. The `codex exec --json` output reveals the schema:

```json
{"type":"thread.started","thread_id":"019c5c94-..."}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"..."}}
{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}
```

Event types: `thread.started`, `turn.started/completed/failed`, `item.started/completed`, `error`.

**Stability warning:** Maintainers have stated the rollout JSONL is "an internal detail and may change." No stable, documented export schema exists. A proposal for `CODEX_TRACE_PATH` opt-in tracing (issue #8027) was closed as "not planned."

### VS Code Extension API

The Codex VS Code extension (`openai.chatgpt` on Marketplace) provides:
- Keyboard-bindable commands (toggle chat, add context)
- Slash commands for in-chat control
- Extension settings for models, approvals, defaults

**No public extension API for other VS Code extensions.** No documented commands, events, or APIs that external extensions can call programmatically. Sessions sync between CLI and IDE via shared auth, but no inter-extension communication surface is exposed.

### Feasibility Assessment: Partial Support (trending toward Full)

**Justification:**
- **Hooks:** No PreToolUse equivalent — cannot intercept tool calls before execution. Only `AfterToolUse` and `UserPromptSubmit` provide blocking/observation. The hooks system is experimental and expanding rapidly (3 new events in 2 weeks). Feature gates may have been removed in recent versions (PR #13276).
- **Sessions:** Well-structured JSONL with session IDs and resume. Accessible on disk.
- **Transcripts:** JSONL format is parseable but explicitly unstable/undocumented.
- **VS Code API:** No extension surface.

**Blocking unknowns:**
- Will a `BeforeToolUse`/`PreToolUse` event be added? Community demand is high (issue #2109, the general "Event Hooks" feature request, has 521 upvotes — PreToolUse is one of the most requested specific events within it). No official commitment.
- Hooks JSON input schema — what data is passed to hook commands? Not documented.
- JSONL transcript schema stability — will it break between versions?

---

## GitHub Copilot (VS Code)

### Hook/Event Model

VS Code introduced **agent hooks** (Preview) that apply to both Copilot and Claude Code agent sessions within VS Code. Eight lifecycle events are supported:

| Event | Can Block? | Notes |
|---|---|---|
| `SessionStart` | No | Injects context via `additionalContext` |
| `UserPromptSubmit` | Yes | Can block prompts |
| `PreToolUse` | **Yes** | `permissionDecision: deny/ask/allow` |
| `PostToolUse` | Yes | `decision: block` stops further processing |
| `PreCompact` | No | Before context compaction |
| `SubagentStart` | No | When a subagent spawns |
| `SubagentStop` | No | When a subagent completes |
| `Stop` | No | Session ends |

**PreToolUse is fully supported** with deny/ask/allow decisions following a priority hierarchy: deny > ask > allow. This is the richest hook surface of the three harnesses.

**Configuration locations:**
- Workspace: `.github/hooks/*.json` or `.claude/settings.json`
- User: `~/.copilot/hooks`
- Agent-scoped: `.agent.md` frontmatter (Preview, requires `chat.useCustomAgentHooks`)

**Data passed to hooks** (stdin JSON):
```json
{
  "timestamp": "ISO 8601",
  "cwd": "/workspace/path",
  "sessionId": "...",
  "hookEventName": "PreToolUse",
  "transcript_path": "...",
  "tool_name": "...",
  "tool_input": { ... },
  "tool_use_id": "..."
}
```

**Claude Code compatibility:** VS Code reads `.claude/settings.json` hook configs, converting between naming conventions. Key differences:
- Property naming: Claude uses `snake_case`, VS Code uses `camelCase`
- Tool names differ between platforms
- **VS Code ignores `matcher` values** — hooks run on all tool invocations regardless of matcher

**Exit code protocol:** 0 = success, 2 = blocking error (same as Claude Code).

### Session Management

- Sessions are managed through the VS Code Chat view, grouped by time period
- Sessions carry conversation history through agent handoffs
- Session logs show agent progress, token usage, session count, and length
- **No persistent file-based session storage** in the Claude Code sense — sessions live in VS Code's internal state

### Transcript Format

Chat history is stored in VS Code's `workspaceStorage` directory:
- Path: `~/<vscode-data>/User/workspaceStorage/<workspace-hash>/chatSessions/*.json`
- Format: JSON files per session
- Export/Import: `Chat: Export Session...` and `Chat: Import Session...` commands

The format is **not formally documented** as a public API. It's an internal VS Code storage mechanism.

**Key limitation:** GitHub Copilot historically did not persist chat history between VS Code restarts, though this has improved with agent mode sessions in 2026.

### VS Code Extension API

Copilot exposes the **richest extension API** of the three harnesses through VS Code's built-in APIs:

1. **Language Model Tools API** (`vscode.lm`) — Register domain-specific tools that Copilot's agent mode can invoke automatically. Full access to VS Code extension APIs.

2. **Chat Participant API** (`vscode.chat`) — Create specialized chat assistants invoked via `@mention`. Control the entire interaction flow.

3. **Language Model API** — Direct programmatic access to AI models for custom features (code actions, hover providers, custom views).

4. **MCP Tools** — Integrate external services via Model Context Protocol (runs outside VS Code, no extension API access).

Other extensions can register tools, create chat participants, and access the language model — but there is **no API to observe or intercept Copilot's own tool calls**. The hook system runs shell commands, not extension code.

### Feasibility Assessment: Full Support (with caveats)

**Justification:**
- **Hooks:** PreToolUse with deny capability — full interception of tool calls before execution. Eight lifecycle events cover the complete session lifecycle.
- **Sessions:** Managed in VS Code UI with export/import. Session IDs available in hook input.
- **Transcripts:** JSON in workspaceStorage, accessible but undocumented format.
- **VS Code API:** Rich extension surface for tools and chat participants, but hooks are shell-command-only (no in-process extension hooks).

**Caveats:**
- Agent hooks are **Preview** — format and behavior may change
- VS Code ignores `matcher` values, so tool-specific filtering must happen in the hook script
- Hook configuration compatibility with Claude Code is approximate, not exact
- Transcript format in workspaceStorage is internal to VS Code

**Blocking unknowns:**
- Will agent hooks graduate from Preview? Timeline unknown.
- Will VS Code add extension-API-level hook registration (not just shell commands)?
- Stability of the hook input JSON schema across VS Code versions.

---

## Google Gemini CLI

### Hook/Event Model

Gemini CLI has the **most mature and well-documented hooks system** of the three harnesses, enabled by default since v0.26.0+. Eleven hook events across four categories:

**Tool Hooks:**
| Event | Can Block? |
|---|---|
| `BeforeTool` | **Yes** — `"deny"/"block"` in decision field |
| `AfterTool` | Yes — can block further processing |

**Agent Hooks:**
| Event | Can Block? |
|---|---|
| `BeforeAgent` | Yes |
| `AfterAgent` | Yes — forces retry |

**Model Hooks:**
| Event | Can Block? |
|---|---|
| `BeforeModel` | Yes |
| `BeforeToolSelection` | Yes |
| `AfterModel` | Yes |

**Lifecycle Hooks:**
| Event | Can Block? |
|---|---|
| `SessionStart` | No (advisory) |
| `SessionEnd` | No (advisory) |
| `Notification` | No |
| `PreCompress` | No |

**BeforeTool is fully supported** with multiple blocking mechanisms:
- `decision: "deny"` in JSON output prevents execution
- Exit code 2 = system-level block (stderr used as rejection reason)
- `hookSpecificOutput` can rewrite tool arguments (note: this "Rewrite" capability is mentioned in the overview but the specific mechanism via hookSpecificOutput is not fully documented)
- `continue: false` terminates the agent loop entirely

**Data passed to hooks** (stdin JSON — well-documented):
```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "BeforeTool",
  "timestamp": "ISO 8601",
  "tool_name": "...",
  "tool_input": { ... },
  "tool_response": "..." // AfterTool only
}
```

Event-specific fields are documented for all 11 events.

**Configuration** (`settings.json`):
```json
{
  "hooks": {
    "BeforeTool": [{
      "matcher": "regex_pattern",
      "sequential": true,
      "hooks": [{
        "type": "command",
        "command": "shell_command",
        "name": "friendly_name",
        "timeout": 60000
      }]
    }]
  }
}
```

The configuration format closely mirrors Claude Code's hooks schema (matcher groups with nested hook arrays), making cross-harness hook compatibility feasible.

### Session Management

- **Storage:** `~/.gemini/tmp/<project_hash>/chats/` (project-specific via directory hash)
- **Session IDs:** UUID format (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`), also displayed as short IDs and index numbers
- **Resume:** `gemini --resume` (latest), `gemini --resume <index>`, `gemini --resume <UUID>`, or `/resume` slash command with interactive browser
- **Environment:** `GEMINI_SESSION_ID` available to hooks
- **Retention:** 30-day default, configurable in settings.json
- **List/Delete:** `--list-sessions`, `--delete-session` CLI flags

### Transcript Format

**Currently JSON** — monolithic `session-*.json` files that store the entire conversation. Each write triggers a full file rewrite.

**Migration to JSONL proposed** (issue #15292) with three record types:
1. `{ type: "session_metadata", sessionId, projectHash, startTime }` — written once
2. `{ type: "user" | "gemini", id, ... }` — appended per message
3. `{ type: "message_update", id, ... }` — granular updates

Data persisted per session includes: prompts, model responses, tool execution inputs/outputs, token usage statistics, and reasoning summaries.

**Format stability:** The current JSON format is treated as internal. The hook input includes `transcript_path` which provides the path to the current session file — this is the most reliable access mechanism.

**Structured output mode:** `gemini --output-format json` produces a single JSON object with response text, performance stats, and error details — useful for programmatic consumption but separate from session transcripts.

### VS Code Extension API

The Gemini CLI Companion extension (`Google.gemini-cli-vscode-ide-companion`) provides:

**Commands:**
- `Gemini CLI: Run` — starts a new session in integrated terminal
- `Gemini CLI: Accept Diff` — accepts changes in diff editor
- `Gemini CLI: Close Diff Editor` — rejects changes

**Communication:** Via environment variables (`GEMINI_CLI_IDE_WORKSPACE_PATH`, `GEMINI_CLI_IDE_SERVER_PORT`, `GEMINI_CLI_IDE_PID`). The extension provides workspace context (10 recent files, cursor position, selected text up to 16KB) to the CLI.

**No public extension API** for other VS Code extensions. The companion extension is a thin bridge between VS Code workspace state and the CLI process — it does not expose commands, events, or APIs for programmatic interaction.

### Feasibility Assessment: Full Support

**Justification:**
- **Hooks:** BeforeTool with deny/block/modify capabilities. 11 events covering the complete lifecycle. Well-documented input/output schema. Enabled by default.
- **Sessions:** UUID-based, project-scoped, with resume and listing. `GEMINI_SESSION_ID` environment variable available to hooks.
- **Transcripts:** JSON files at known paths. `transcript_path` passed to hooks. Format is readable, though internal.
- **Extension system:** Rich extension architecture (hooks, MCP, commands, skills, policies) — though this is CLI-side extensibility, not VS Code extension API.

**Blocking unknowns:**
- Transcript format migration (JSON → JSONL) timeline and backward compatibility
- Whether `transcript_path` in hook input will remain stable across versions
- VS Code companion extension remains thin — no API surface for other extensions

---

## Comparison Table

| Capability | Codex CLI | GitHub Copilot (VS Code) | Gemini CLI |
|---|---|---|---|
| **PreToolUse/BeforeTool** | Not available | Yes (Preview) | Yes (stable) |
| **Can block tool calls** | No (only prompts) | Yes (deny/ask/allow) | Yes (deny/block/modify) |
| **Hook event count** | 5 | 8 | 11 |
| **Hook maturity** | Experimental (feature flag) | Preview | Stable (default on) |
| **Hook config format** | TOML / JSON (unclear) | JSON (Claude-compatible) | JSON (Claude-like schema) |
| **Hook input schema** | Undocumented | Documented | Well-documented |
| **Session IDs** | Auto-generated | VS Code internal | UUID |
| **Session storage** | `~/.codex/sessions/` JSONL | VS Code workspaceStorage JSON | `~/.gemini/tmp/<hash>/chats/` JSON |
| **Transcript format** | JSONL (unstable) | JSON (internal) | JSON (migrating to JSONL) |
| **Transcript documented** | No | No | Partially |
| **VS Code extension API** | None | Rich (Tools, Chat, LM APIs) | None (thin companion) |
| **Extension/plugin system** | MCP + slash commands | MCP + Tools + Participants | Full extension system |
| **Overall feasibility** | **Partial Support** | **Full Support** (caveats) | **Full Support** |

## Recommended Implementation Order

### 1. Gemini CLI (First)

**Rationale:** Most mature hook system with BeforeTool, well-documented schemas, stable by default, and a configuration format that closely mirrors Claude Code's. The extension system allows bundling hooks directly. `transcript_path` in hook input provides direct session file access. Lowest integration risk.

**Approach:** Sentinel hooks can be packaged as a Gemini CLI extension (hooks + MCP server) for single-command install. The BeforeTool hook provides the same interception capability as Claude Code's PreToolUse.

### 2. GitHub Copilot / VS Code (Second)

**Rationale:** Full PreToolUse support with the same exit-code protocol as Claude Code. The hook system reads `.claude/settings.json` directly, meaning existing Claude Code hook configurations work with minimal adaptation. However, the Preview status and matcher-ignoring behavior are concerns.

**Approach:** Leverage VS Code's hook system with Claude-compatible configuration. The rich VS Code extension API (Language Model Tools, Chat Participants) could enable deeper integration beyond hooks — e.g., a sentinel chat participant that provides interactive access to observations.

**Risk:** Preview status means breaking changes are possible. Matcher filtering must be reimplemented in the hook script since VS Code ignores matchers.

### 3. Codex CLI (Third — Watch and Wait)

**Rationale:** No PreToolUse equivalent makes real-time tool interception impossible today. `AfterToolUse` allows post-hoc observation but not prevention. The hooks system is experimental and rapidly evolving — a PreToolUse event is likely given community demand, but no timeline exists.

**Approach:** Start with watch-only mode using `AfterToolUse` for observation and `UserPromptSubmit` for prompt-level gating. Monitor the changelog for PreToolUse addition. JSONL transcripts at `~/.codex/sessions/` enable offline analysis.

**Risk:** Investing in an unstable hook format that may change significantly. No documented hook input schema.

## Identified Gaps Requiring Upstream Feature Requests

### Codex CLI
1. **PreToolUse/BeforeToolUse event** — Critical for sentinel. Issue #2109 (general "Event Hooks" request, 521 upvotes) exists with high community demand — PreToolUse is one of the most requested specific events — but no official commitment. Consider filing a focused feature request referencing the sentinel use case.
2. **Documented hook input schema** — What JSON is passed to hook commands? Currently undocumented.
3. **Stable transcript schema** — The rollout JSONL is explicitly internal. A stable export format would enable reliable offline analysis.

### GitHub Copilot (VS Code)
1. **Matcher support** — VS Code ignores matcher values from hook configs. This forces all filtering logic into the hook script, increasing overhead and complexity.
2. **Extension-API-level hooks** — Current hooks are shell-command-only. An in-process extension API for hook registration would enable tighter VS Code integration.
3. **Agent hooks graduation from Preview** — Timeline for stable release is unknown.

### Gemini CLI
1. **Transcript format stability** — The JSON → JSONL migration (issue #15292) will change the format. Need to track this and support both formats during transition.
2. **VS Code companion extension API** — The companion extension exposes no API surface. A richer API would enable VS Code-native sentinel UI rather than terminal-only.
