# Troubleshooting

Common issues and their solutions.

## Extension Not Activating

**Symptoms:** No Sentinel sidebar, no status bar indicator, commands not available.

**Causes and fixes:**

1. **No sentinel config in workspace.** The extension activates when it finds `.volition/sentinel/sentinel.config.json`. Run `vl sentinel init` in your project root.

2. **VS Code version too old.** Sentinel requires VS Code 1.85+. Check your version via **Help > About**.

3. **Extension disabled.** Open Extensions sidebar, find Agent Sentinel, and verify it's enabled for this workspace.

**Verify:** Open the Output panel (`Ctrl+Shift+U`) and select "Agent Sentinel" from the dropdown. You should see "Agent Sentinel activated" on startup.

## No Observations Appearing

**Symptoms:** Extension is active but the live feed is empty.

**Causes and fixes:**

1. **Sentinel CLI not running.** The CLI must be invoked via hooks when your AI agent acts. Verify hooks are registered:
   - Claude Code: check `.claude/settings.json` for `hooks.Stop` and `hooks.PreToolUse` entries
   - Gemini CLI: check `settings.json` for BeforeTool/AfterTool hooks
   - Copilot: verify `chat.useCustomAgentHooks` is `true`

2. **CLI not installed or not on PATH.** Run `vl sentinel doctor` in a terminal to check connectivity.

3. **Observations file not being written.** Check that `.volition/sentinel/sentinel-observations.jsonl` exists and is being updated. Run an agent action and verify the file grows.

4. **File watcher not picking up changes.** Restart the extension: Command Palette > **Developer: Reload Window**.

**Diagnostic shortcut:** Run **Sentinel: Run Health Check** from the Command Palette for a comprehensive assessment.

## Status Bar Not Showing

**Symptoms:** Extension is active but no sentinel indicator in the status bar.

**Fixes:**

1. **Setting disabled.** Check that `sentinel.statusBar.enabled` is `true` in VS Code settings.

2. **Visibility cycled off.** Run **Sentinel: Cycle Status Bar Visibility** from the Command Palette to cycle through display modes.

## Health Check Failing

**Symptoms:** `Sentinel: Run Health Check` reports errors.

Common health check failures:

| Check | Failure Meaning | Fix |
|-------|----------------|-----|
| CLI connectivity | Cannot find or execute the sentinel binary | Ensure `vl` is installed and on PATH |
| Config validation | `sentinel.config.json` has errors | Run `vl sentinel init` to regenerate, or fix the JSON manually |
| Eval loading | YAML eval files have syntax errors | Open the eval file in VS Code — validation errors appear on save |
| Observation pipeline | Observations aren't flowing from CLI to extension | Verify hooks are registered and the CLI runs on agent actions |

## Hooks Not Firing

**Symptoms:** Agent is working but sentinel doesn't detect any tool usage.

**Per-harness checks:**

### Claude Code
- Verify `.claude/settings.json` exists in your project root
- Check that `hooks.Stop` contains a sentinel trigger entry
- Check that `hooks.PreToolUse` contains a sentinel pretrigger entry

### Gemini CLI
- Verify `settings.json` contains BeforeTool/AfterTool hooks
- Ensure Gemini CLI version is 0.26.0+ (hooks enabled by default)

### GitHub Copilot
- Verify `chat.useCustomAgentHooks` is `true` in VS Code settings
- Note: Copilot hooks are in Preview and must be explicitly enabled

### Codex CLI
- Verify the feature flag is set: `codex -c features.codex_hooks=true`
- Note: Codex has no PreToolUse hook — only post-hoc observation works

## High Memory Usage

**Symptoms:** VS Code using more memory than expected.

**Fix:** Reduce `sentinel.observations.maxInMemory` (default: 1000). For long sessions with many observations, a lower value like 500 keeps memory bounded.

## Multiple Harnesses Detected

**Symptoms:** QuickPick appears every time asking which harness to use.

**Fix:** Set `sentinel.harness.default` to your preferred harness (e.g., `"claude-code"`) in VS Code settings. The QuickPick only appears when set to `"auto"` and multiple harnesses are installed.

## Getting Help

If none of the above resolves your issue:

1. Run **Sentinel: Run Health Check** and note the output
2. Check the Output panel ("Agent Sentinel" channel) for error messages
3. [Open an issue](https://github.com/VolitionLabsAi/agent-sentinel-extension/issues) with the health check output and error messages
