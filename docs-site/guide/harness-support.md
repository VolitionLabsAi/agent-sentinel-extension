# Harness Compatibility

Sentinel supports four AI coding assistant harnesses. Each has different capabilities based on its hooks, session management, and VS Code integration surface.

## Feature Matrix

| Feature | Claude Code | Gemini CLI | GitHub Copilot | Codex CLI |
|---------|:-----------:|:----------:|:--------------:|:---------:|
| PreToolUse blocking | Yes | Yes | Yes | **No** |
| Post-hoc observation | Yes | Yes | Yes | Yes |
| Session detection | Yes | No | Limited | No |
| Tab detection | Yes | No | Yes | No |
| Open session by ID | Yes | No | No | No |
| Transcript format | JSONL | JSON | JSON (internal) | JSONL (unstable) |
| Hook maturity | Stable | Stable | Preview | Experimental |

## Graceful Degradation

When a capability is missing, sentinel degrades gracefully:

| Missing Capability | Behavior |
|---|---|
| No PreToolUse hook | **Observation-only mode.** Tool calls are logged after execution. Observations are still generated but cannot prevent actions. |
| No tab detection | Session correlator skips tab-based correlation. Session filtering works via transcript matching. |
| No session opening | "Open Sentinel Chat" shows terminal instructions instead of opening a tab. |
| No transcript access | Historical browsing limited. Live observations via hook stdout/stderr continue. |
| Hooks experimental | Functions normally but warns that the hook system may change between versions. |

## Claude Code

**Status:** Full support (primary harness)

Claude Code is the reference harness. All sentinel features were designed against it first.

- **Hooks:** PreToolUse with blocking, Stop event, session lifecycle
- **Sessions:** Managed via the Claude Code VS Code extension; sessions can be opened by ID
- **Tab detection:** Identifies Claude Code tabs by the `claudeVSCodePanel` viewType
- **Transcripts:** JSONL at `~/.claude/projects/<project>/sessions/`
- **Extension ID:** `anthropic.claude-code`

**Known limitations:**
- Session ID is not exposed in tab metadata; the correlator uses heuristics (cache, transcript activity, title matching)
- `canInjectMessages` is not yet supported

## Gemini CLI

**Status:** Full support

Gemini CLI has the most mature hook system with 11 events covering tool, agent, model, and lifecycle phases.

- **Hooks:** BeforeTool with deny/block/modify. AfterTool, BeforeAgent, AfterAgent, BeforeModel, AfterModel, SessionStart, SessionEnd, Notification, PreCompress. All enabled by default since v0.26.0+
- **Sessions:** Stored at `~/.gemini/tmp/<project_hash>/chats/`. Resume via `gemini --resume <UUID>`
- **Transcripts:** JSON (migrating to JSONL)
- **Extension ID:** `Google.gemini-cli-vscode-ide-companion`

**Setup:**
1. Install Gemini CLI from the [official installation guide](https://github.com/google-gemini/gemini-cli)
2. Ensure `gemini` is on PATH
3. Optionally install the VS Code companion extension

**Known limitations:**
- Cannot open sessions from VS Code UI; must use terminal
- Companion extension does not expose extension API surface

## GitHub Copilot

**Status:** Full support (with Preview caveats)

Copilot uses VS Code's native agent hook system, providing the same PreToolUse blocking as Claude Code.

- **Hooks:** PreToolUse with deny/ask/allow. PostToolUse, SessionStart, UserPromptSubmit, PreCompact, SubagentStart, SubagentStop, Stop (8 events)
- **Sessions:** Managed through VS Code Chat view; stored in workspaceStorage
- **Tab detection:** `workbench.panel.chat` viewType
- **Extension ID:** `github.copilot-chat`

**Setup:**
1. Install GitHub Copilot and GitHub Copilot Chat extensions
2. Enable agent hooks: set `chat.useCustomAgentHooks` to `true` in VS Code settings (Preview feature)

**Known limitations:**
- Agent hooks are in **Preview** — format and behavior may change
- VS Code **ignores `matcher` values**; tool-specific filtering must happen inside the hook script
- Cannot open a specific session by ID

## Codex CLI

**Status:** Partial support (observation-only)

Codex CLI lacks a PreToolUse hook. Sentinel operates in observation-only mode: it monitors tool usage after the fact but cannot prevent tool calls.

- **Hooks:** AfterToolUse, UserPromptSubmit (can block prompts), SessionStart, Stop (5 events, all experimental)
- **Sessions:** At `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Resume via `codex resume <session-id>`
- **Extension ID:** `openai.chatgpt`

**Setup:**
1. Install Codex CLI: `npm install -g @openai/codex`
2. Enable hooks: `codex -c features.codex_hooks=true`
3. Optionally install the Codex VS Code extension

**Known limitations:**
- **No PreToolUse equivalent** — the key limitation. Tool calls cannot be intercepted before execution
- Hooks require a feature flag
- Hook input schema is not documented
- JSONL transcript schema is explicitly unstable

## Harness Selection

When multiple harnesses are installed:

1. **Explicit preference:** Set `sentinel.harness.default` to a specific harness
2. **Auto-detection:** If set to `auto` (default), sentinel presents a QuickPick when multiple are available
3. **Single harness:** If only one is available, it's used automatically

Configure via Command Palette: **Sentinel: Select Default Harness**
