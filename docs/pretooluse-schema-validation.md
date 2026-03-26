# P0-7: PreToolUse Hook Input Schema — Validation Findings

> **Date**: 2026-03-25
> **Status**: Complete
> **Samples captured**: 6 tool calls (Bash, Read, Glob, Grep, Write, Edit)

## Summary

The actual PreToolUse hook input schema has been captured and validated against the assumed schema in Architecture §5. **The schema is richer than assumed** — it contains several additional fields beyond the assumed `{ session_id, tool_name, tool_input }` envelope. The core assumption is correct, but the struct needs to be expanded.

## Actual Schema (Common Envelope)

Every PreToolUse hook invocation receives a JSON object on stdin with these fields:

| Field | Type | Description | In Architecture §5? |
|---|---|---|---|
| `session_id` | `string` | UUID for the Claude Code session | ✅ Yes |
| `transcript_path` | `string` | Absolute path to the session's JSONL transcript file | ❌ **New** |
| `cwd` | `string` | Working directory of the Claude Code session | ❌ **New** |
| `permission_mode` | `string` | Permission mode (e.g., `"bypassPermissions"`, `"default"`) | ❌ **New** |
| `hook_event_name` | `string` | Always `"PreToolUse"` for this hook type | ❌ **New** |
| `tool_name` | `string` | Tool being invoked (e.g., `"Bash"`, `"Write"`) | ✅ Yes |
| `tool_input` | `object` | Tool-specific input parameters (see below) | ✅ Yes |
| `tool_use_id` | `string` | Unique ID for this specific tool invocation | ❌ **New** |

### Example (common envelope)

```json
{
  "session_id": "fc62f129-7d10-4c5f-bec1-0b472d0e43eb",
  "transcript_path": "/Users/user/.claude/projects/-Users-user-Projects-myproject/fc62f129-...jsonl",
  "cwd": "/Users/user/Projects/myproject",
  "permission_mode": "bypassPermissions",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { ... },
  "tool_use_id": "toolu_01HDBYTTFnuxmSyPArDE5A6k"
}
```

## Tool-Specific `tool_input` Schemas

### Bash

```json
{
  "command": "echo hello world",
  "description": "Echo hello world"
}
```

Fields: `command` (string, the shell command), `description` (string, human-readable description).

### Read

```json
{
  "file_path": "/absolute/path/to/file.go"
}
```

Fields: `file_path` (string, absolute path). May also contain optional `offset`, `limit`, `pages` fields (not observed in this capture but documented in tool spec).

### Glob

```json
{
  "pattern": "cmd/**/*.go"
}
```

Fields: `pattern` (string, glob pattern). May also contain optional `path` field.

### Grep

```json
{
  "pattern": "func main",
  "glob": "*.go",
  "output_mode": "content"
}
```

Fields: `pattern` (string, regex), plus various optional fields: `glob`, `path`, `type`, `output_mode`, `-A`, `-B`, `-C`, `-i`, `-n`, `head_limit`, `multiline`, etc.

### Write

```json
{
  "file_path": "/tmp/test-sentinel-write.txt",
  "content": "test content"
}
```

Fields: `file_path` (string, absolute path), `content` (string, full file content).

### Edit

```json
{
  "file_path": "/tmp/test-sentinel-write.txt",
  "old_string": "test content",
  "new_string": "edited content",
  "replace_all": false
}
```

Fields: `file_path` (string), `old_string` (string), `new_string` (string), `replace_all` (boolean).

## Comparison to Architecture §5 Assumptions

### What matched ✅

- **Core envelope**: `session_id`, `tool_name`, `tool_input` — all present and correct
- **Tool input structure**: The `tool_input` object is a flat key-value map (not nested), matching our assumption
- **Tool names**: Exact match — `Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep` (capitalized, matching the tool definitions)

### What's new (additional fields) ⚠️

These fields were **not** in the Architecture §5 assumed schema but are present:

1. **`transcript_path`** — Useful for correlating with the transcript file. The sentinel could use this to avoid discovering the transcript path separately.
2. **`cwd`** — The working directory. Useful for resolving relative paths and understanding context.
3. **`permission_mode`** — Indicates whether permissions are being enforced. Could be used to adjust sentinel behavior (e.g., be stricter when permissions are bypassed).
4. **`hook_event_name`** — Redundant for PreToolUse hooks (always `"PreToolUse"`) but confirms the hook type.
5. **`tool_use_id`** — Unique identifier for the tool call. Useful for deduplication and correlating observations back to specific tool calls.

### What's different ❌

- **Nothing fundamentally different.** The schema is a superset of our assumption. No fields were renamed, restructured, or have different types.

## Decision Checkpoint

### Schema compatibility: ✅ CONFIRMED

The assumed schema `{ session_id, tool_name, tool_input: { ... } }` is **correct as a subset**. The actual schema is a strict superset with useful additional fields.

### Impact on P0-3 (Pretrigger Command): Minimal

- The `PreToolUseInput` struct should include the additional fields (`transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_use_id`)
- Pattern matching logic is unaffected — it only uses `tool_name` and `tool_input` fields
- The additional fields can be included in observation records for richer context

### Impact on P0-6 (Pattern Loading Infrastructure): None

- Pattern field matchers target `tool_input.*` fields, which are exactly as assumed
- Tool name matching uses `tool_name`, which is as assumed
- No changes needed to the pattern YAML format

### Recommended `PreToolUseInput` struct

```go
type PreToolUseInput struct {
    SessionID      string                 `json:"session_id"`
    TranscriptPath string                 `json:"transcript_path"`
    CWD            string                 `json:"cwd"`
    PermissionMode string                 `json:"permission_mode"`
    HookEventName  string                 `json:"hook_event_name"`
    ToolName       string                 `json:"tool_name"`
    ToolInput      map[string]interface{} `json:"tool_input"`
    ToolUseID      string                 `json:"tool_use_id"`
}
```

## Raw Samples

Raw captured samples are stored in `scripts/pretooluse-samples-reference.jsonl` for reference.

## Test Reproduction

To re-run this validation:

```bash
# 1. Clear the log
rm -f /tmp/pretooluse-samples.jsonl

# 2. Ensure .claude/settings.json has the capture hook registered
# (see scripts/pretooluse-capture.sh header for the JSON)

# 3. Run a Claude Code session that exercises all tool types
CLAUDECODE= claude -p --dangerously-skip-permissions \
  "Use Bash to run 'echo hello'. Use Read to read go.mod. \
   Use Glob to find *.go in cmd/. Use Grep to search for 'func main'. \
   Use Write to create /tmp/test.txt. Use Edit to modify /tmp/test.txt."

# 4. Inspect the captured samples
cat /tmp/pretooluse-samples.jsonl | jq '._raw'
```
