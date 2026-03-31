# Harness Compatibility Matrix

Sentinel supports four AI coding assistant harnesses. Each has different capabilities based on the hooks, session management, and VS Code integration surface it exposes.

## Feature Matrix

| Feature | Claude Code | Gemini CLI | GitHub Copilot | Codex CLI |
|---------|:-----------:|:----------:|:--------------:|:---------:|
| PreToolUse blocking | Yes | Yes (BeforeTool) | Yes (Preview) | **No** |
| Post-hoc observation | Yes (PostToolUse) | Yes (AfterTool) | Yes (PostToolUse) | Yes (AfterToolUse) |
| Session detection | Yes (tab-based) | No (CLI-only) | Limited (chat panel) | No |
| Tab detection | Yes (claudeVSCodePanel) | No (terminal) | Yes (workbench.panel.chat) | No |
| Open session by ID | Yes | No | No | No |
| Transcript format | JSONL | JSON (migrating to JSONL) | JSON (VS Code internal) | JSONL (unstable) |
| Hook maturity | Stable | Stable (default on) | Preview | Experimental (feature flag) |
| Hook config format | JSON (.claude/settings.json) | JSON (settings.json) | JSON (.claude/settings.json compat) | TOML / JSON |
| Hook input documented | Yes | Well-documented | Documented | No |

## Per-Harness Details

### Claude Code

**Status:** Full support (primary harness)

Claude Code is the reference harness. All sentinel features were designed against it first.

- **Hooks:** PreToolUse with blocking, Stop event, session lifecycle.
- **Sessions:** Managed via the Claude Code VS Code extension. Sessions can be opened by ID using the `claude-vscode.editor.open` command.
- **Tab detection:** Identifies Claude Code tabs by the `claudeVSCodePanel` viewType in tab input metadata.
- **Transcripts:** JSONL files at `~/.claude/projects/<project>/sessions/`.
- **Extension ID:** `anthropic.claude-code`

**Known limitations:**
- Session ID is not exposed in tab metadata; the session correlator uses heuristics (cache, transcript activity, title matching) to map tabs to sessions.
- `canInjectMessages` is not yet supported.

### Gemini CLI

**Status:** Full support

Gemini CLI has the most mature hook system of all harnesses, with 11 events covering tool, agent, model, and lifecycle phases.

- **Hooks:** BeforeTool with deny/block/modify capabilities. AfterTool, BeforeAgent, AfterAgent, BeforeModel, AfterModel, SessionStart, SessionEnd, Notification, PreCompress. All enabled by default since v0.26.0+.
- **Sessions:** Stored at `~/.gemini/tmp/<project_hash>/chats/`. UUID-based IDs. Resume via `gemini --resume <UUID>` in terminal.
- **Tab detection:** Not applicable. Gemini CLI runs in the integrated terminal, not as a webview panel.
- **Transcripts:** JSON files (migrating to JSONL per issue #15292). `transcript_path` is passed in hook input.
- **Extension ID:** `Google.gemini-cli-vscode-ide-companion` (thin companion, no public API)

**Known limitations:**
- Cannot open sessions from VS Code UI; must use terminal commands.
- Transcript format migration (JSON to JSONL) may change parsing requirements.
- Companion extension does not expose any extension API surface.

**Setup:**
1. Install Gemini CLI: follow the [official installation guide](https://github.com/google-gemini/gemini-cli).
2. Ensure `gemini` is on PATH.
3. Optionally install the VS Code companion extension for workspace context integration.

### GitHub Copilot

**Status:** Full support (with Preview caveats)

Copilot uses VS Code's native agent hook system, which provides the same PreToolUse blocking capability as Claude Code.

- **Hooks:** PreToolUse with deny/ask/allow decisions. PostToolUse, SessionStart, UserPromptSubmit, PreCompact, SubagentStart, SubagentStop, Stop. Eight events total.
- **Sessions:** Managed through VS Code's Chat view. Sessions are stored in VS Code's internal workspaceStorage, not as user-accessible files.
- **Tab detection:** Identifies Copilot chat tabs by the `workbench.panel.chat` viewType.
- **Transcripts:** JSON in VS Code's `workspaceStorage/<workspace-hash>/chatSessions/`. Format is internal and undocumented.
- **Extension ID:** `github.copilot-chat` (primary), `github.copilot` (base dependency)

**Known limitations:**
- Agent hooks are in **Preview** status -- format and behavior may change.
- VS Code **ignores `matcher` values** from hook configurations. All hooks fire on all tool invocations regardless of matcher. Tool-specific filtering must happen inside the hook script.
- Cannot open a specific session by ID; sessions are browsed through the Chat view sidebar.
- Hook configuration reads `.claude/settings.json` for cross-harness compatibility, but property naming conventions differ (Claude uses `snake_case`, VS Code uses `camelCase`).

**Setup:**
1. Install the GitHub Copilot and GitHub Copilot Chat extensions from the VS Code Marketplace.
2. Enable agent hooks: set `chat.useCustomAgentHooks` to `true` in VS Code settings (Preview feature).

### Codex CLI

**Status:** Partial support (watch-only mode)

Codex CLI is the most limited harness due to the absence of a PreToolUse/BeforeTool hook. Sentinel operates in observation-only mode: it can monitor tool usage after the fact but cannot prevent tool calls.

- **Hooks:** AfterToolUse (observation), UserPromptSubmit (can block prompts), SessionStart, Stop. Five events total. All experimental, requiring a feature flag.
- **Sessions:** Stored at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Resume via `codex resume <session-id>` in terminal.
- **Tab detection:** Not supported. The Codex VS Code extension (`openai.chatgpt`) provides a chat panel but does not expose a documented viewType for external detection.
- **Transcripts:** JSONL format, explicitly described as "an internal detail and may change." No stable export schema.
- **Extension ID:** `openai.chatgpt`

**Known limitations:**
- **No PreToolUse equivalent.** This is the key limitation. Tool calls cannot be intercepted before execution. Community demand for this feature is high (issue #2109, 521+ upvotes) but no official commitment exists.
- Hooks system is experimental and requires a feature flag: `codex -c features.codex_hooks=true`.
- Hook input schema is not documented.
- Cannot open sessions from VS Code UI.
- JSONL transcript schema is explicitly unstable.

**Setup:**
1. Install Codex CLI: `npm install -g @openai/codex`.
2. Enable hooks: `codex -c features.codex_hooks=true`.
3. Optionally install the Codex VS Code extension for IDE integration.

## Graceful Degradation

Sentinel degrades gracefully when features are not available for a given harness:

| Missing Capability | Sentinel Behavior |
|---|---|
| No PreToolUse hook | Operates in **observation-only mode**. Tool calls are logged after execution via AfterToolUse/AfterTool. CRITICAL and WARNING observations are still generated but cannot prevent the action. |
| No tab detection | Session correlator skips tab-based correlation for that harness. Session filtering still works via JSONL transcript matching. |
| No session opening | The `sentinel.openFullConversation` command (command palette only; sidebar button removed) shows terminal instructions instead of opening a VS Code tab. Error messages include the correct CLI command for manual session access. |
| No transcript access | Historical browsing is limited. Live observations via hook stdout/stderr continue to work. |
| Hooks experimental/preview | Sentinel functions normally but warns on first activation that the hook system may change between harness versions. |

## Harness Selection

When multiple harnesses are installed, sentinel determines which adapter to use:

1. **Explicit preference:** If `sentinel.harness.default` is set to a specific harness (via the `sentinel.selectHarness` command), that adapter is used.
2. **Auto-detection:** If set to `auto` (default), sentinel presents a QuickPick when multiple harnesses are available.
3. **Single harness:** If only one harness is available, it is used automatically.

Configure the default harness:
- Command Palette: `Sentinel: Select Default Harness`
- Setting: `sentinel.harness.default` (values: `auto`, `claude-code`, `copilot`, `codex`, `gemini-cli`)
