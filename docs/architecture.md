# Agent Sentinel Extension — Architecture Design

> **Status**: Draft
> **Date**: 2026-03-25
> **Companion to**: [Vision & Product Requirements](vision-and-requirements.md)
> **References**: [Tiered Evaluation Model](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/tiered-evaluation-model.md) · [Daemon Model Analysis](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/daemon-model-analysis.md)

---

## Table of Contents

- [1. System Architecture Overview](#1-system-architecture-overview)
- [2. Observation Persistence](#2-observation-persistence)
- [3. Session Correlation](#3-session-correlation)
- [4. File Watcher Architecture](#4-file-watcher-architecture)
- [5. PreToolUse Hook Integration (Tier 0 Inline Prevention)](#5-pretooluse-hook-integration-tier-0-inline-prevention)
- [6. Doctor Command Design](#6-doctor-command-design)
- [7. Extension Component Architecture](#7-extension-component-architecture)
  - [Dynamic Eval Lifecycle](#dynamic-eval-lifecycle)
  - [CLI Integration Patterns](#cli-integration-patterns)
- [8. Harness Adapter Interface](#8-harness-adapter-interface)
  - [Three-Tier Harness Configuration Model](#three-tier-harness-configuration-model)
- [9. Extension API Surface](#9-extension-api-surface)
- [10. Cross-IDE Protocol](#10-cross-ide-protocol)
- [11. Data Flow Diagrams](#11-data-flow-diagrams)
- [Phase 0 Prerequisites Summary](#phase-0-prerequisites-summary)
- [Risk Register](#risk-register)

---

## 1. System Architecture Overview

### Decision

The system is a **core Go CLI binary** (existing `sentinel` command) extended with observation persistence and a `doctor` subcommand, paired with a **thin VS Code TypeScript client** that reads sentinel's on-disk data structures via file watchers. The extension never invokes the sentinel evaluation pipeline directly — it observes its output and invokes CLI commands for lifecycle management.

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension (TypeScript)                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Extension Host Process                               │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────────┐│  │
│  │  │ File     │ │ Session  │ │ Harness Adapter Layer  ││  │
│  │  │ Watchers │ │ Correlator│ │ (Claude Code default)  ││  │
│  │  └────┬─────┘ └────┬─────┘ └────────────┬───────────┘│  │
│  │       │             │                    │            │  │
│  │  ┌────▼─────────────▼────────────────────▼──────────┐│  │
│  │  │  State Manager (in-memory model of disk state)   ││  │
│  │  └────┬──────────────────────────────────┬──────────┘│  │
│  │       │                                  │           │  │
│  │  ┌────▼──────────┐  ┌───────────────────▼─────────┐ │  │
│  │  │ UI Components │  │ Extension API (for volition) │ │  │
│  │  │ - Status Bar  │  │ - Events                     │ │  │
│  │  │ - Sidebar     │  │ - Accessors                  │ │  │
│  │  │ - Webviews    │  │ - Actions                    │ │  │
│  │  └───────────────┘  └─────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────┘
               Reads files       │  Spawns CLI commands
               (FileSystemWatcher)│  (sentinel start/stop/doctor)
                                 │
┌────────────────────────────────▼────────────────────────────┐
│  Filesystem (.volition/sentinel/)                           │
│  ┌──────────────────┐  ┌──────────────────────────────────┐│
│  │ sentinel-state   │  │ sentinel-observations.jsonl (NEW)││
│  │ .json            │  │                                  ││
│  └──────────────────┘  └──────────────────────────────────┘│
│  ┌──────────────────┐  ┌──────────────────────────────────┐│
│  │ sentinel.config  │  │ sentinel-trigger.log             ││
│  │ .json            │  │                                  ││
│  └──────────────────┘  └──────────────────────────────────┘│
│  ┌──────────────────┐  ┌──────────────────────────────────┐│
│  │ patterns/        │  │ evals/                           ││
│  │ (Tier 0 YAML)    │  │ (LLM eval rules)                ││
│  └──────────────────┘  └──────────────────────────────────┘│
└────────────────────────────────┬────────────────────────────┘
               Written by        │
                                 │
┌────────────────────────────────▼────────────────────────────┐
│  Sentinel Core (Go binary)                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ trigger.go — Stop hook hot path                     │    │
│  │  ├─ Reads transcript delta                          │    │
│  │  ├─ Runs evaluations (Tier 1/2)                     │    │
│  │  ├─ Parses observations                             │    │
│  │  ├─ ★ Appends to sentinel-observations.jsonl (NEW)  │    │
│  │  ├─ Injects to JSONL transcript (inject.go)         │    │
│  │  └─ Outputs decision:block to stdout                │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ PreToolUse handler (NEW) — Tier 0 fast path         │    │
│  │  ├─ Reads tool call from stdin                      │    │
│  │  ├─ Runs Tier 0 pattern matching (<10ms)            │    │
│  │  ├─ ★ Appends to sentinel-observations.jsonl        │    │
│  │  └─ Outputs decision:block or nothing               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ doctor subcommand (NEW)                             │    │
│  │  └─ Health checks → JSON or human output            │    │
│  └─────────────────────────────────────────────────────┘    │
│  Spawns: claude CLI (Tier 2), local LLM (Tier 1)           │
└─────────────────────────────────────────────────────────────┘

Hook Registration (.claude/settings.json):
  hooks.Stop[]     → sentinel trigger     (existing)
  hooks.PreToolUse[] → sentinel pretrigger (NEW, Phase 0)
```

### Integration Points with Existing Code

| Existing File | Change Required | Phase |
|---|---|---|
| `pkg/sentinel/trigger.go` | Add observation persistence write after `ParseObservation` | 0 |
| `pkg/sentinel/hook.go` | Add `RegisterPreToolUseHook` function alongside `RegisterHook` | 0 |
| `pkg/sentinel/types.go` | Add `PersistentObservation` struct with full schema | 0 |
| `cmd/sentinel/main.go` | Add `doctor` and `pretrigger` subcommands | 0 |
| `pkg/sentinel/config.go` | Add `patterns` configuration fields for Tier 0 | 0 |

### Alternatives Considered

1. **Daemon/service architecture**: The extension communicates with a long-running sentinel daemon via IPC. Rejected because the per-trigger model is simpler, already working, and the daemon adds complexity without solving the core problem (see [daemon-model-analysis.md](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/daemon-model-analysis.md)). The file-watching approach achieves the same real-time display without IPC protocol design.

2. **Extension drives evaluation directly**: The TypeScript extension spawns sentinel evaluations. Rejected because this duplicates the trigger logic, creates two code paths to maintain, and violates the "core Go binary + thin client" principle (Vision §9.1).

3. **HTTP API on the sentinel process**: Sentinel exposes a local HTTP endpoint for the extension. Rejected for Phase 1–3 (same reasons as daemon model). Revisited in Phase 4+ as part of the cross-IDE protocol (Section 10).

---

## 2. Observation Persistence

### Decision

Observations are persisted as **append-only JSONL** (one JSON object per line) to `.volition/sentinel/sentinel-observations.jsonl`. This is a **new file** written by the Go trigger process. The extension tail-follows this file for real-time display.

### File Format: JSONL

JSONL is chosen over alternatives:

| Format | Parse Speed | Append Safety | Debuggability | Streaming Read |
|---|---|---|---|---|
| **JSONL** | Native `JSON.parse` per line | Atomic line append | `cat` / `jq` / any editor | Tail-follow trivial |
| JSON array | Requires full parse or streaming parser | Must rewrite closing `]` | Good | Requires streaming parser |
| SQLite | Fastest for queries | WAL mode needed | Requires tooling | Polling or change hooks |
| Binary (protobuf) | Fastest | Append-safe | Requires tooling | Custom reader |

JSONL wins on the combination of append safety (each line is an independent atomic write), streaming read (the extension reads new lines as they appear), and debuggability (developers can inspect the file directly). The performance difference vs. binary formats is irrelevant at the expected write rate (~1 observation per 5–30 seconds).

### File Location

**Single file**: `.volition/sentinel/sentinel-observations.jsonl`

Per-session files were considered but rejected:
- The extension needs a single watch target to detect all observations, regardless of which session produced them. Watching N per-session files requires N watchers.
- Session cleanup is handled by the `session_id` field — a cleanup command can prune observations for sessions that no longer exist.
- A single file simplifies the "All Sessions" dashboard view (Vision §3.1).

### Schema

Each line is a JSON object with the following fields:

```json
{
  "timestamp": "2026-03-25T14:30:00Z",
  "session_id": "abc-123-def",
  "sentinel_name": "SEC",
  "sentinel_label": "Security",
  "severity": "WARNING",
  "eval_id": "SEC-014",
  "one_liner": "Agent is modifying database schema outside stated scope",
  "analysis": "The agent was asked to add a login page but has made 3 ALTER TABLE statements...",
  "turn_number": 12,
  "duration_ms": 8500,
  "tier": "tier_2",
  "visibility": "auto",
  "dynamic_eval_created": false,
  "hook_type": "stop",
  "version": 1
}
```

| Field | Type | Description |
|---|---|---|
| `timestamp` | string (ISO 8601) | When the observation was produced |
| `session_id` | string | The primary (monitored) session ID |
| `sentinel_name` | string | Sentinel domain name (e.g., `SEC`, `GEN`). Domain is derived from this field — they are always identical in the current model, so a separate `domain` field would be redundant. If sentinel names and eval domains diverge in the future, a `domain` field can be added then. |
| `sentinel_label` | string | Human-readable sentinel label |
| `severity` | string | `CRITICAL`, `WARNING`, `INFO` |
| `eval_id` | string | The eval rule ID that fired |
| `one_liner` | string | Short summary |
| `analysis` | string | Detailed analysis text |
| `turn_number` | int | Turn count at time of observation |
| `duration_ms` | int64 | Evaluation duration in milliseconds |
| `tier` | string | `tier_0`, `tier_1`, `tier_2` — standardized to match the conceptual tier numbering used across the architecture. `tier_0` = deterministic patterns, `tier_1` = local LLM, `tier_2` = cloud LLM. |
| `visibility` | string | Effective visibility at time of observation |
| `dynamic_eval_created` | bool | Whether this observation led to a LOCAL eval |
| `hook_type` | string | `stop` or `pretooluse` |
| `version` | int | Schema version (for forward compatibility) |

### Rotation and Cleanup

- **Per-invocation**: No rotation. The file grows for the lifetime of the project.
- **Cleanup trigger**: `sentinel stop --all` prunes observations for sessions being stopped. `PruneStaleSessions` (state.go) is extended to also prune observation lines for stale sessions.
- **Size bound**: At ~500 bytes per observation and ~100 observations per session, a 10-session day produces ~500KB. A month of heavy use produces ~15MB. This is acceptable without automatic rotation.
- **Future**: If files grow beyond 50MB, add `sentinel observations prune --before <date>` command.

### Write Pattern

Append-only with atomic line writes. The Go side opens the file with `O_APPEND|O_WRONLY|O_CREATE`, marshals one JSON line, and writes it as a single `write()` syscall. On POSIX systems, `O_APPEND` guarantees that the seek-to-end and write are performed as an atomic filesystem-level operation, preventing interleaving from concurrent appenders. Our observation lines are ~300–500 bytes — well within the range where a single `write()` call completes without partial writes on any modern filesystem (ext4, APFS, NTFS all handle this correctly). No file locking needed.

```go
// In trigger.go, after ParseObservation succeeds:
func AppendObservation(projectRoot string, obs *PersistentObservation) error {
    path := filepath.Join(projectRoot, SentinelDir, "sentinel-observations.jsonl")
    f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
    if err != nil {
        return err
    }
    defer f.Close()
    data, err := json.Marshal(obs)
    if err != nil {
        return err
    }
    _, err = f.Write(append(data, '\n'))
    return err
}
```

### Read Pattern

- **Real-time**: The extension watches the file with `FileSystemWatcher`. On change, it reads from a byte offset (the last known position) to EOF, parsing each new line. This is effectively `tail -f`.
- **Truncation detection**: Before reading from the stored offset, the extension checks the current file size via `fs.stat`. If the file size is less than the stored byte offset, the file has been truncated (e.g., by `sentinel observations prune` or manual deletion). In this case, the offset is reset to 0 and the entire file is re-read. This prevents the extension from silently missing observations after a truncation event.
- **History**: On activation, the extension reads the full file, parses all lines, and filters by active sessions. Observations are loaded into a bounded in-memory cache (most recent 1000 per session; older observations served from disk on demand).

### Integration Point in trigger.go

The write happens **inside the multi-sentinel results processing loop**, after observation parsing and before the `decision:block` output. This ensures each observation is persisted as it is parsed, and the extension sees observations before the agent receives the block response.

```go
// In trigger.go's results processing loop (iterates over all sentinel results):
for i, r := range results {
    m := metas[i]

    // ... existing error/skip handling ...

    if r.Error != nil || r.ExitCode != 0 {
        // ★ NEW: persist system-generated observations (e.g., timeouts)
        var te *TimeoutError
        if errors.As(r.Error, &te) {
            timeoutObs := &PersistentObservation{
                Timestamp:    nowISO(),
                SessionID:    hookInput.SessionID,
                SentinelName: m.Name,
                SentinelLabel: m.Label,
                Severity:     SeverityWarning,
                EvalID:       "SYSTEM-TIMEOUT",
                OneLiner:     "Evaluation timed out",
                Analysis:     "The sentinel evaluation exceeded the watchdog timeout.",
                TurnNumber:   m.State.TurnCount,
                DurationMs:   m.State.LastDurationMs,
                Tier:         "tier_2", // or tier_1 depending on which timed out
                HookType:     "stop",
            }
            AppendObservation(projectRoot, timeoutObs) // non-fatal if fails
        }
        continue
    }

    // ... existing extraction processing ...

    obs := ParseObservation(stripped, m.Name, m.Label)
    if obs != nil {
        // ★ NEW: persist each sentinel's observation inside the loop
        AppendObservation(projectRoot, toPersistentObservation(obs, hookInput, m))
        observations = append(observations, obs)
    }
}

// ... existing InjectObservationToJSONL (runs after loop, uses collected observations) ...
// ... existing decision:block output ...
```

Key points:
- **Inside the loop, not after**: Each sentinel's observation is persisted as it is processed, not batched.
- **System observations**: Timeout and error observations (with `EvalID: SYSTEM-TIMEOUT`) are also persisted so the extension can show degraded health.
- **Non-fatal**: `AppendObservation` errors are logged but never block the trigger pipeline.

### Relationship to JSONL Injection (inject.go)

Observation persistence and JSONL transcript injection are **complementary**, not replacements:

| Mechanism | Purpose | Consumer |
|---|---|---|
| `sentinel-observations.jsonl` (NEW) | Structured observation store for extension display | Extension file watcher |
| `InjectObservationToJSONL` (inject.go) | Makes observations visible in Claude Code's chat UI | Claude Code JSONL renderer |
| `decision:block` stdout | Injects observation into agent's context | Claude Code hook system |

The JSONL injection (inject.go) is a proof-of-concept for VS Code visibility that predates the extension. Once the extension is installed, it becomes the primary display surface, but the injection remains useful as a fallback for users without the extension and for making observations visible in Claude Code's native transcript view.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent writes from parallel sentinels | `O_APPEND` guarantees atomic appends for small writes on POSIX. Each sentinel's observation is a single write. |
| File grows unboundedly | Size projections show ~15MB/month for heavy use. Add pruning command as escape hatch. |
| Extension reads partial line during write | Read lines only up to the last `\n`. Incomplete trailing data is buffered for the next read. |

---

## 3. Session Correlation

### Decision

**Hybrid approach with transcript file activity as the primary signal and graceful fallback.**

Session correlation maps a focused VS Code Claude Code tab to a sentinel session ID. This is needed for the "Active Session" view mode (Vision §3.1) where the observation feed auto-filters to the focused session.

### Primary Signal: Transcript File Activity

The sentinel state file (`sentinel-state.json`) contains a `transcript_path` for each session. This path points to `~/.claude/projects/<encoded-path>/<session-id>.jsonl`. The session ID is embedded in the filename.

When a Claude Code session is active (the user is interacting with it), its transcript file is being written to. The extension monitors modification timestamps on all transcript files referenced in `sentinel-state.json`. The most recently modified transcript file identifies the active session.

```
sentinel-state.json
  └─ sessions["abc-123"].transcript_path = "~/.claude/projects/-Users-ben-myapp/abc-123.jsonl"
  └─ sessions["def-456"].transcript_path = "~/.claude/projects/-Users-ben-myapp/def-456.jsonl"

Tab focused → file watcher detects abc-123.jsonl modified → active session = "abc-123"
```

**Why this works**: Claude Code writes to the transcript JSONL on every turn. When a user switches tabs and interacts with a different session, that session's transcript immediately becomes the most recently written. There is a natural 1:1 correlation between "user is typing in this tab" and "this transcript file is being written to."

**Latency**: The correlation updates on the next transcript write after tab switch. If the user switches tabs but doesn't interact, the correlation stays on the previous session until the next write. This is acceptable — the user hasn't generated new observations in the new tab yet, so there's nothing to filter.

### Secondary Signal: Extension-Opened Session Cache

When the extension opens a Claude Code session via `claude-vscode.editor.open(sessionId)` (e.g., clicking an observation to navigate to its session), the extension caches the `{tabId → sessionId}` mapping. This provides instant correlation for sessions the extension itself opened, without waiting for transcript activity.

### Tertiary Signal: Title Matching (Low Confidence)

The extension reads session titles from transcript files using the same logic as `GetSessionTitle` in state.go (scanning for `custom-title` JSONL records). Tab labels in VS Code show the session title. When transcript activity hasn't identified the active session, the extension attempts title-based matching with a confidence score:
- Exact match → high confidence
- Prefix match (tab label is truncated) → medium confidence
- No match → "Unknown Session" displayed

### Correlation Flow

```
Tab focus changed
    │
    ├─ Check extension-opened cache → if hit, done (instant)
    │
    ├─ Check recent transcript writes → if one file was written
    │  within last 5s, high confidence correlation
    │
    ├─ Title match against known sessions → medium confidence
    │
    └─ No correlation → display "All Sessions" or "Unknown Session"
```

### Fallback Behavior

When correlation fails:
- The status bar shows aggregate health across all sessions (not per-session)
- The Observations view shows all observations with session labels
- The user can manually pin a session (Vision §3.1 "Pinned Session" mode)
- A subtle "Session: Unknown" indicator appears, not an error

### Implementation

```typescript
class SessionCorrelator {
  // Cache from extension-initiated session opens
  private tabSessionCache: Map<string, string> = new Map();

  // Last known transcript write times, keyed by session ID
  private transcriptActivity: Map<string, number> = new Map();

  // Sentinel state (refreshed from file watcher)
  private sentinelState: SentinelState | null = null;

  correlateActiveSession(): string | null {
    // 1. Check tab cache
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab && this.tabSessionCache.has(tabKey(activeTab))) {
      return this.tabSessionCache.get(tabKey(activeTab))!;
    }

    // 2. Check transcript activity (most recent write within 5s)
    const now = Date.now();
    let bestSession: string | null = null;
    let bestTime = 0;
    for (const [sessionId, lastWrite] of this.transcriptActivity) {
      if (lastWrite > bestTime && (now - lastWrite) < 5000) {
        bestSession = sessionId;
        bestTime = lastWrite;
      }
    }
    if (bestSession) return bestSession;

    // 3. Title matching (low confidence, logged but used)
    return this.attemptTitleMatch(activeTab);
  }
}
```

### Sidebar Panel Limitation

The sidebar Claude Code panel is NOT detected by `tabGroups` (Vision §3.2). This is a known VS Code API limitation. When the user interacts via the sidebar, correlation relies entirely on transcript file activity. This works because the sidebar session's transcript is still being written to.

### Alternatives Considered

1. **Lock files (`.claude/ide/*.lock`)**: Investigated but rejected. Lock file contents and lifecycle are undocumented Claude Code internals. Depending on them creates a fragile coupling to implementation details that could change without notice.

2. **Tab label parsing only**: Rejected as unreliable. Labels are truncated, can be stale, and multiple sessions can share similar names.

3. **Claude Code extension API**: No public API exists for querying the active session ID. If Anthropic adds one, it would become the preferred approach, replacing the transcript activity heuristic entirely.

4. **Process tree inspection**: Matching Claude Code subprocesses to sessions. Rejected as platform-specific, fragile, and a privacy concern.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Transcript activity lags behind tab switch | Acceptable — observation feed only needs to filter once new observations arrive. Display "All Sessions" during ambiguous window. |
| Multiple sessions active simultaneously | Transcript activity naturally tracks the most recent interaction. If truly simultaneous, "All Sessions" mode is the correct view anyway. |
| Claude Code changes transcript file location | `transcript_path` is read from `sentinel-state.json`, which is populated at session start time. As long as sentinel correctly records the path, the extension follows. |

---

## 4. File Watcher Architecture

### Decision

Use `vscode.workspace.createFileSystemWatcher` for all file monitoring. One watcher per monitored file path pattern, with debounced event processing and a unified state update pipeline.

### Files to Watch

| File | Watch Pattern | Update Frequency | Purpose |
|---|---|---|---|
| `sentinel-state.json` | Single glob per workspace | Every trigger (~5-30s) | Session list, sentinel health, turn counts |
| `sentinel-observations.jsonl` | Single glob per workspace | On observation (~5-30s, bursty) | Real-time observation display |
| `sentinel.config.json` | Single glob per workspace | Rare (manual edits) | Configuration changes, eval rules |
| `~/.claude/projects/*/*.jsonl` | Glob for transcript activity | Every turn (~5-30s) | Session correlation (modification times only, no content read) |

### Watcher Implementation

`vscode.workspace.createFileSystemWatcher` is chosen over alternatives:

| Approach | Pros | Cons |
|---|---|---|
| **`vscode.workspace.createFileSystemWatcher`** | Native VS Code API, OS-level events (inotify/FSEvents/ReadDirectoryChanges), zero dependencies, respects VS Code's file watching infrastructure | Glob patterns only, no recursive content watching |
| `chokidar` | Rich API, battle-tested | Adds ~2MB dependency, duplicates VS Code's built-in capability, extra memory |
| `fs.watch` / `fs.watchFile` | Node.js native | Platform inconsistencies, polling fallback on some systems, must manage lifecycle manually |

The VS Code API provides exactly what we need: OS-level file change notifications with zero CPU cost during idle, integrated with the extension lifecycle (watchers are disposed on deactivation).

### Debouncing and Coalescing

Sentinel triggers can write multiple files in quick succession: first `sentinel-state.json` (cursor update), then `sentinel-observations.jsonl` (observation), then `sentinel-state.json` again (final state). The extension must coalesce these into a single state update.

```typescript
class FileWatcherManager {
  private stateDebouncer = new Debouncer(150); // ms
  private observationDebouncer = new Debouncer(50); // ms — tighter for real-time feel

  setupWatchers(workspaceRoot: string) {
    const sentinelDir = path.join(workspaceRoot, '.volition', 'sentinel');

    // State file watcher
    const stateWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(sentinelDir, 'sentinel-state.json')
    );
    stateWatcher.onDidChange(() => {
      this.stateDebouncer.run(() => this.onStateChanged());
    });

    // Observations file watcher
    const obsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(sentinelDir, 'sentinel-observations.jsonl')
    );
    obsWatcher.onDidChange(() => {
      this.observationDebouncer.run(() => this.onObservationsChanged());
    });

    // Config file watcher
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(sentinelDir, 'sentinel.config.json')
    );
    configWatcher.onDidChange(() => this.onConfigChanged());
  }
}
```

### Performance Within 50MB Memory Budget

With 10+ active sessions:
- **File watchers**: Each `FileSystemWatcher` is a lightweight handle to an OS-level watcher. 10–15 watchers consume negligible memory (<1MB total).
- **Observation cache**: Bounded to 1000 most recent observations per session in memory. At ~1KB per parsed observation, 10 sessions × 1000 observations = ~10MB. Older observations read from disk on demand.
- **State cache**: One parsed `sentinel-state.json` per workspace. Negligible (~10KB per workspace even with many sessions).
- **Transcript stats**: Only `fs.stat` calls for modification times — no content reading. ~100 bytes per tracked file.
- **Total estimated baseline**: ~15MB for 10 active sessions, well within the 50MB budget.

### Event Flow

```
File change event (OS-level)
    │
    ▼
FileSystemWatcher callback
    │
    ▼
Debouncer (50-150ms window)
    │
    ▼
File read + parse (async)
    │
    ├─ State file → update SessionManager
    ├─ Observations file → read new lines from offset → parse → add to ObservationStore
    └─ Config file → update ConfigManager
    │
    ▼
State Manager emits change events
    │
    ├─ → Status bar updates
    ├─ → Sidebar tree refresh
    ├─ → Webview postMessage (if open)
    └─ → Extension API event emitters (for volition-extension)
```

### Error Handling

| Error | Handling |
|---|---|
| File doesn't exist yet | Watcher still registers (watches for creation). Extension shows "Not Initialized" state. |
| Corrupt JSON in state file | Log warning, keep previous cached state, show degraded indicator. |
| Corrupt JSONL line in observations | Skip the line, log warning, continue reading. One bad line doesn't invalidate the file. |
| Permission denied | Show error in status bar. `sentinel doctor` can diagnose. |
| File deleted mid-session | Watcher fires `onDidDelete`. Extension transitions to "Not Initialized" state. |

### Multi-Workspace Support

VS Code multi-root workspaces can have independent sentinel configurations. The extension creates a separate `FileWatcherManager` instance per workspace folder. Each workspace folder has its own:
- State file, config file, observations file
- Session list and observation cache
- Health state

The sidebar merges all workspace folders into a unified view with workspace labels. The status bar shows the worst health state across all workspaces (e.g., if one workspace is ERROR, the status bar shows red).

```typescript
class WorkspaceManager {
  private perWorkspace: Map<string, FileWatcherManager> = new Map();

  onWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent) {
    for (const added of event.added) {
      this.perWorkspace.set(added.uri.fsPath, new FileWatcherManager(added));
    }
    for (const removed of event.removed) {
      this.perWorkspace.get(removed.uri.fsPath)?.dispose();
      this.perWorkspace.delete(removed.uri.fsPath);
    }
  }
}
```

### Alternatives Considered

1. **Polling on a timer**: Read files every N seconds. Rejected because OS-level file watchers are zero-CPU during idle and provide faster notification than any reasonable polling interval.

2. **Single watcher with glob `**/*` on `.volition/sentinel/`**: Fewer watcher instances but receives events for log files and other irrelevant changes. Rejected in favor of targeted watchers per file.

---

## 5. PreToolUse Hook Integration (Tier 0 Inline Prevention)

### Decision

Tier 0 deterministic patterns run on a **new `PreToolUse` hook** registered alongside the existing `Stop` hook. The Go binary receives the tool call on stdin, runs pattern matching in-process, and returns `decision:block` for matches or exits silently for passes. The extension displays Tier 0 blocks with the same observation card UI as other observations.

### Hook Registration

`sentinel init` and `sentinel start` register **both hooks** in `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "sentinel trigger", "timeout": 120 }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "sentinel pretrigger", "timeout": 1 }]
      }
    ]
  }
}
```

**Implementation**: Add `RegisterPreToolUseHook` to `hook.go`, following the same pattern as `RegisterHook`. The timeout is set to 1 second (1000ms) as a safety bound — actual evaluation completes in <10ms.

### Input Format

Claude Code sends JSON to `PreToolUse` hooks on stdin:

```json
{
  "session_id": "abc-123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /",
    "description": "Clean up temp files"
  }
}
```

The exact schema depends on Claude Code's hook specification. The `pretrigger` command reads this, extracts the tool name and input, and passes them to the pattern matching engine.

### Pattern Matching Engine

**Regex-based** with structured pattern definitions in YAML (consistent with the tiered evaluation model's Tier 0 design).

```yaml
# .volition/sentinel/patterns/default.yaml
patterns:
  - id: SEC-T0-001
    name: dangerous-recursive-delete
    severity: critical
    tool_match: ["Bash", "Execute"]  # which tools to check
    input_patterns:
      - field: "command"
        regex: 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s'
      - field: "command"
        regex: 'rm\s+-rf\s+/'
    message: "Recursive file deletion detected"

  - id: SEC-T0-005
    name: credential-in-code
    severity: critical
    tool_match: ["Write", "Edit"]
    input_patterns:
      - field: "content"
        regex: '(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*["\x27][A-Za-z0-9+/=]{20,}'
    message: "Potential credential detected in code"
```

**Pattern compilation**: Patterns are compiled to `regexp.Regexp` objects once at process start (or cached across invocations if we add a pattern cache file). Compiled regex matching against typical tool inputs completes in <1ms.

**Pattern loading**: Patterns are loaded from `.volition/sentinel/patterns/` directory. A `default.yaml` ships with the binary (embedded via `//go:embed`). Additional pattern files can be added to the directory.

### Response Format

- **Block**: `{"decision": "block", "reason": "🔴 SENTINEL [SEC] Recursive file deletion detected -- *SEC-T0-001* (Tier 0)\n..."}`
- **Allow**: Exit with code 0, no stdout output. Claude Code interprets no output as "allow."

### Performance Budget: <10ms

| Phase | Budget | Approach |
|---|---|---|
| JSON decode stdin | ~0.1ms | Standard `json.Decoder` |
| Tool name match | ~0.01ms | Map lookup |
| Regex evaluation (50 patterns) | ~1-5ms | Pre-compiled regexes, short-circuit on first match |
| JSON encode stdout (if blocking) | ~0.1ms | Standard `json.Encoder` |
| **Total** | **~1-6ms** | Well within 10ms budget |

No process spawning, no network calls, no file I/O beyond initial pattern load. The sentinel binary is invoked by Claude Code and runs in-process.

### Configuration

Patterns are configured per-sentinel in `sentinel.config.json` (extending the existing schema):

```json
{
  "sentinels": [
    {
      "name": "SEC",
      "enabled": true,
      "patterns": {
        "enabled": true,
        "sets": ["default", "owasp-agentic"],
        "custom_dir": ".volition/sentinel/patterns/"
      }
    }
  ]
}
```

### Relationship to Eval YAML Format

Tier 0 patterns use a **separate but structurally similar** YAML format. The rationale:
- Eval rules contain LLM prompts, examples, and rationale paragraphs. Patterns contain regex expressions and field matchers.
- Mixing them in the same file would create confusion about which rules run on which tier.
- The `id` namespace is shared: `SEC-T0-xxx` for Tier 0 patterns, `SEC-xxx` for LLM eval rules. This enables cross-tier deduplication (tiered evaluation model §Tier Composition).

### Extension's Role

The extension displays Tier 0 blocks identically to other observations, with a `(Tier 0)` provenance badge. Additional features:
- **Pattern hit counts**: Read from observation history — count observations where `tier == "tier_0"` grouped by `eval_id`.
- **Enable/disable toggles**: The extension writes to `sentinel.config.json` to toggle pattern sets. The sentinel reads config on each invocation, so changes take effect immediately.
- **Blocked tool call display**: When a PreToolUse observation appears, the extension shows what tool was blocked and why, with a distinctive "PREVENTED" badge (vs. "OBSERVED" for Stop hook observations).

### Files to Modify in agent-sentinel

| File | Change |
|---|---|
| `cmd/sentinel/main.go` | Add `pretriggerCmd()` subcommand |
| `pkg/sentinel/hook.go` | Add `RegisterPreToolUseHook` and `RemovePreToolUseHook` (mirroring the existing `RegisterHook`/`RemoveHook` pair). `RemovePreToolUseHook` is called by `sentinel stop` to clean up both hooks. |
| `pkg/sentinel/types.go` | Add `PreToolUseInput` struct, `PatternConfig` struct |
| `pkg/sentinel/patterns.go` (NEW) | Pattern loading, compilation, matching engine |
| `pkg/sentinel/pretrigger.go` (NEW) | PreToolUse handler (analogous to trigger.go) |

### Alternatives Considered

1. **AST-based pattern matching**: Parse code/commands into ASTs and match structurally. Rejected for Phase 0 — regex covers the critical patterns (dangerous commands, credentials) and meets the <10ms budget. AST-based matching can be added later for patterns that require structural understanding.

2. **Tier 0 patterns in the Stop hook**: Run patterns in `trigger.go` alongside LLM evaluation. Rejected because this misses the key value: PreToolUse fires *before* tool execution. Running patterns in the Stop hook means the dangerous action has already happened.

3. **Extension-side pattern matching**: The TypeScript extension runs patterns against tool calls. Rejected because the extension doesn't receive tool call events — only Claude Code's hook system does.

---

## 6. Doctor Command Design

### Decision

`sentinel doctor` is a new CLI subcommand that performs health checks and outputs structured results. The extension calls `sentinel doctor --format json` to power the Repo Health Assessment (Vision §2.6).

### Checks Performed

Checks are organized into four categories:

#### Prerequisites
| Check | Pass Condition | Severity |
|---|---|---|
| `binary_on_path` | `sentinel` resolves via `$PATH` | ERROR |
| `claude_cli_available` | `claude` resolves via `$PATH` | WARNING (only needed for Tier 2) |
| `config_dir_exists` | `.volition/sentinel/` exists | ERROR |
| `claude_dir_exists` | `.claude/` exists | ERROR |

#### Configuration
| Check | Pass Condition | Severity |
|---|---|---|
| `config_file_valid` | `sentinel.config.json` parses without error | ERROR |
| `config_sentinels_defined` | At least one sentinel configured | WARNING |
| `config_sentinels_enabled` | At least one sentinel has `enabled: true` | WARNING |
| `eval_files_exist` | All referenced eval sets resolve to files | ERROR |
| `eval_files_parse` | All eval YAML files parse without error | ERROR |
| `pattern_files_valid` | All pattern YAML files parse without error | WARNING |

#### Hook Integrity
| Check | Pass Condition | Severity |
|---|---|---|
| `stop_hook_registered` | `.claude/settings.json` contains Stop hook for sentinel | ERROR |
| `pretooluse_hook_registered` | `.claude/settings.json` contains PreToolUse hook | WARNING |
| `hook_command_resolves` | Hook command path is executable | ERROR |
| `hook_timeout_reasonable` | Timeout ≥ max configured sentinel timeout | WARNING |

#### Runtime Health
| Check | Pass Condition | Severity |
|---|---|---|
| `state_file_exists` | `sentinel-state.json` exists | INFO (not running is ok) |
| `state_file_valid` | State file parses without error | ERROR |
| `sessions_alive` | At least one session has `last_checked_at` within 5 minutes | INFO |
| `no_excessive_failures` | No sentinel has `consecutive_failures` ≥ 3 | WARNING |
| `no_excessive_timeouts` | No sentinel has `timeout_count` > 50% of `total_evaluations` | WARNING |
| `observations_file_writable` | Can write to `sentinel-observations.jsonl` | ERROR |

### Output Format

**JSON** (with `--format json`):

```json
{
  "healthy": false,
  "summary": "2 errors, 1 warning, 15 passed",
  "checks": [
    {
      "name": "config_file_valid",
      "category": "configuration",
      "status": "pass",
      "message": "sentinel.config.json is valid"
    },
    {
      "name": "stop_hook_registered",
      "category": "hooks",
      "status": "error",
      "message": "Stop hook not found in .claude/settings.json",
      "fix": "Run: sentinel init"
    }
  ]
}
```

**Human-readable** (default):

```
Sentinel Doctor
═══════════════

Prerequisites
  ✓ sentinel binary on PATH
  ✓ claude CLI available
  ✓ .volition/sentinel/ directory exists

Configuration
  ✓ sentinel.config.json valid
  ✗ eval file not found: evals/security-v2.yaml
    Fix: Check evalSet paths in sentinel.config.json

Hooks
  ✗ Stop hook not registered
    Fix: Run `sentinel init`
  ⚠ PreToolUse hook not registered
    Fix: Run `sentinel init` (requires sentinel v0.X+)

Runtime
  ✓ State file valid
  ✓ 2 active sessions
  ⚠ SEC sentinel has 3 consecutive failures
    Fix: Check model availability and API access

Summary: 1 error, 2 warnings, 8 passed
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | All checks pass (healthy) |
| 1 | Warnings present but no errors |
| 2 | Errors present |

### Extension Integration

The extension calls `sentinel doctor --format json --project-dir <path>` on:
1. Activation (initial health assessment)
2. Config file change (re-check after user edits)
3. User request (command palette: "Sentinel: Run Health Check")
4. Periodic background check (every 5 minutes while idle)

The extension maps doctor output to the health states defined in Vision §2.6:

| Doctor Result | Health State | Status Bar Color |
|---|---|---|
| No config dir | Not Initialized | Grey |
| All pass, no sessions | Initialized / Idle | Blue |
| All pass, sessions alive | Running | Green |
| Warnings present | Degraded | Amber |
| Errors present | Error | Red |

### Files to Modify

| File | Change |
|---|---|
| `cmd/sentinel/main.go` | Add `doctorCmd()` subcommand |
| `pkg/sentinel/doctor.go` (NEW) | Check implementations, `DoctorResult` type |
| `pkg/sentinel/types.go` | Add `DoctorCheck`, `DoctorResult` types |

### Alternatives Considered

1. **Health checks in the extension only**: The extension runs its own checks by reading files directly. Rejected because CLI users also need diagnostics, and duplicating check logic across Go and TypeScript creates inconsistency.

2. **Health endpoint on a daemon**: A running daemon exposes `/health`. Rejected — requires a daemon, which we don't have (see daemon model analysis).

---

## 7. Extension Component Architecture

### Decision

The extension uses a **layered component model** with clear separation between data management (file watchers, state), business logic (correlation, health assessment), and presentation (status bar, sidebar, webviews).

### Component Tree

```
extension.ts (activate/deactivate)
  │
  ├─ WorkspaceManager
  │   └─ per workspace folder:
  │       ├─ FileWatcherManager (watches sentinel files)
  │       ├─ StateManager (parses + caches sentinel-state.json)
  │       ├─ ObservationStore (parses + caches observations JSONL)
  │       ├─ ConfigManager (parses + caches sentinel.config.json)
  │       └─ HealthAssessor (runs doctor, maps to health state)
  │
  ├─ SessionCorrelator (maps tabs to sessions, cross-workspace)
  │
  ├─ HarnessAdapterRegistry
  │   └─ ClaudeCodeAdapter (default)
  │
  ├─ UI Components
  │   ├─ StatusBarManager (status bar item lifecycle)
  │   ├─ SidebarProvider (WebviewViewProvider for activity bar)
  │   │   ├─ LiveFeedView
  │   │   ├─ SessionHealthView
  │   │   └─ EvalRulesView
  │   ├─ ObservationCardPanel (WebviewPanel for editor-area cards)
  │   └─ WalkthroughProvider (VS Code Walkthrough API)
  │
  ├─ CommandRegistry (VS Code command handlers)
  │
  └─ ExtensionAPI (public API for volition-extension)
```

### State Management

State flows **unidirectionally** from file watchers through managers to UI:

```
File system → FileWatcherManager → StateManager/ObservationStore → EventBus → UI Components
                                                                            → Extension API
```

The `EventBus` is a typed `vscode.EventEmitter` registry:

```typescript
interface SentinelEvents {
  onStateChanged: vscode.Event<SentinelState>;
  onObservationReceived: vscode.Event<PersistentObservation>;
  onConfigChanged: vscode.Event<SentinelConfig>;
  onHealthChanged: vscode.Event<HealthState>;
  onActiveSessionChanged: vscode.Event<string | null>;
}
```

UI components subscribe to events and update reactively. No component polls or directly reads files.

### Lifecycle

**Activation**: Triggered by `workspaceContains:**/.volition/sentinel/sentinel.config.json` or `onStartupFinished` (deferred). Activation sequence:

1. Register commands (synchronous, fast)
2. Create status bar item (synchronous, fast)
3. **Return** — activation complete in <50ms
4. *Deferred* (via `setTimeout(0)`):
   - Initialize WorkspaceManager per workspace folder
   - Set up file watchers
   - Read initial state from disk
   - Run initial `sentinel doctor` for health assessment
   - Register sidebar webview providers

**Deactivation**: All file watchers disposed, cached state cleared, webview panels closed. Managed via `context.subscriptions` for automatic cleanup.

**Workspace Change**: `vscode.workspace.onDidChangeWorkspaceFolders` triggers WorkspaceManager to add/remove per-folder instances.

### Dual-Registration Pattern

The sidebar and editor tab views share rendering logic but have different lifecycle:

```typescript
// Sidebar: registered as WebviewViewProvider (persistent, one instance)
class SidebarProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.renderer = new ObservationRenderer(webviewView.webview);
    // Subscribe to events, render initial state
  }
}

// Editor tab: created as WebviewPanel (transient, user-opened)
class ObservationCardPanel {
  static create(observation: PersistentObservation) {
    const panel = vscode.window.createWebviewPanel(...);
    const renderer = new ObservationRenderer(panel.webview);
    renderer.renderSingle(observation);
  }
}

// Shared rendering logic
class ObservationRenderer {
  constructor(private webview: vscode.Webview) {}

  renderFeed(observations: PersistentObservation[]) { /* shared HTML/CSS */ }
  renderSingle(observation: PersistentObservation) { /* shared HTML/CSS */ }
}
```

### Command Registration

| Command ID | Handler | User-Facing |
|---|---|---|
| `sentinel.start` | Spawn `sentinel start` | Yes (command palette) |
| `sentinel.stop` | Spawn `sentinel stop --all` | Yes |
| `sentinel.restart` | Spawn `sentinel restart` | Yes |
| `sentinel.status` | Spawn `sentinel status --format json` | Yes |
| `sentinel.doctor` | Spawn `sentinel doctor --format json` | Yes |
| `sentinel.show` | Spawn `sentinel show` | Yes |
| `sentinel.hide` | Spawn `sentinel hide` | Yes |
| `sentinel.auto` | Spawn `sentinel auto` | Yes |
| `sentinel.openSentinelChat` | `claude-vscode.editor.open(sessionId)` | Yes |
| `sentinel.createEval` | Open eval creation webview | Yes |
| `sentinel.setViewMode` | Open view mode picker | Yes |
| `sentinel.focusSession` | Set pinned session | Internal |
| `sentinel.navigateToSession` | `claude-vscode.editor.open(sessionId)` | Internal |

### Configuration (settings.json contributions)

```json
{
  "sentinel.autoStart": {
    "type": "boolean",
    "default": false,
    "description": "Automatically start sentinel when a workspace with sentinel config is opened"
  },
  "sentinel.statusBar.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Show sentinel status in the status bar"
  },
  "sentinel.observations.maxInMemory": {
    "type": "number",
    "default": 1000,
    "description": "Maximum observations to keep in memory per session"
  },
  "sentinel.viewMode": {
    "type": "string",
    "enum": ["all", "active", "pinned"],
    "default": "active",
    "description": "Default view mode for the observation feed"
  },
  "sentinel.doctor.backgroundInterval": {
    "type": "number",
    "default": 300,
    "description": "Seconds between background health checks (0 to disable)"
  }
}
```

### Dynamic Eval Lifecycle

Sentinels can create LOCAL evals dynamically during evaluation — rules extracted from the sentinel's own analysis of the session (stored in `SentinelState.Extractions.LocalEvals`). The extension must detect these, celebrate them, allow inspection/tuning, and support promotion to permanent eval rules.

**Detection**: On each `sentinel-state.json` update, the `StateManager` diffs the `Extractions.LocalEvals` array for each sentinel against its cached version. New entries (matched by `id` + `created_at`) trigger an `onDynamicEvalCreated` event.

```typescript
class StateManager {
  private previousLocalEvals: Map<string, Set<string>> = new Map(); // sentinel → Set<evalId>

  private detectNewLocalEvals(state: SentinelState, sessionId: string) {
    for (const [name, sentinel] of Object.entries(state.sessions[sessionId].sentinels)) {
      const prev = this.previousLocalEvals.get(name) ?? new Set();
      const current = new Set(sentinel.extractions.local_evals.map(e => e.id));

      for (const eval of sentinel.extractions.local_evals) {
        if (!prev.has(eval.id)) {
          this.eventBus.fireDynamicEvalCreated({
            sessionId,
            sentinelName: name,
            eval,
          });
        }
      }
      this.previousLocalEvals.set(name, current);
    }
  }
}
```

**Celebration notification**: When a dynamic eval is detected, the extension shows an informational notification:

> "Sentinel created a new eval rule: *SEC-LOCAL-001* — Detects unauthorized admin account creation"
> [Inspect] [Dismiss]

The "Inspect" button opens the eval in the sidebar's EvalRulesView, scrolled to the new rule. This is a celebration moment — the sentinel learned something from the session.

**Inspection and tuning UI**: The sidebar EvalRulesView shows dynamic evals in a "Session Evals" section, visually distinguished from permanent evals (e.g., with a sparkle icon or "dynamic" badge). Each dynamic eval card shows:
- ID, severity, rule text, rationale, creation timestamp
- Which session and sentinel created it
- An "Edit" button that opens the rule in a YAML editor webview for tuning

**Promotion to permanent**: The "Promote" action copies a dynamic eval from the in-memory state to a YAML file in `.volition/sentinel/evals/<domain>/`:

```typescript
async function promoteLocalEval(eval: LocalEval, sentinelName: string): Promise<void> {
  const yamlContent = formatEvalAsYAML(eval); // Convert LocalEval fields to eval YAML format
  const domain = sentinelName.toLowerCase();
  const dir = path.join(workspaceRoot, '.volition', 'sentinel', 'evals', domain);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${eval.id}.yaml`);
  await fs.writeFile(filePath, yamlContent);
  vscode.window.showInformationMessage(`Eval ${eval.id} promoted to permanent rule.`);
}
```

Once promoted, the eval persists across sessions — the sentinel loads it from the evals directory on next start. The dynamic eval remains in state until the session ends (no duplicate evaluation since the sentinel's valid_eval_ids already include it).

### CLI Integration Patterns

All extension interactions with the sentinel binary follow a standardized pattern. This ensures consistent error handling, timeout management, and user-facing messaging.

**Always use `--format json`**: Every CLI invocation includes `--format json` to receive structured output. The extension never parses human-readable output.

```typescript
interface CLIResult<T> {
  exitCode: number;
  stdout: T | null;       // Parsed JSON from stdout
  stderr: string | null;  // Raw stderr (error messages)
}

class SentinelCLI {
  private binaryPath: string;

  async execute<T>(args: string[], options?: { timeout?: number }): Promise<CLIResult<T>> {
    const timeout = options?.timeout ?? 30_000; // 30s default
    const proc = cp.spawn(this.binaryPath, [...args, '--format', 'json'], {
      cwd: this.projectRoot,
      timeout,
    });
    // ... collect stdout/stderr, parse JSON ...
  }
}
```

**Structured error response parsing**: When the CLI exits non-zero, stderr contains structured JSON error objects (as implemented by `WriteErrorJSON` in the Go code). The extension parses these to extract user-facing messages:

```typescript
interface CLIError {
  error: string;       // Error category
  message: string;     // Human-readable description
  suggestion: string;  // Actionable fix instruction
  exit_code: number;   // Semantic exit code
}

function handleCLIError(result: CLIResult<unknown>): string {
  if (result.stderr) {
    try {
      const err: CLIError = JSON.parse(result.stderr);
      return `${err.message}. ${err.suggestion}`;
    } catch {
      return result.stderr; // Fallback to raw stderr
    }
  }
  return 'Unknown error';
}
```

**Exit code mapping**: The sentinel binary uses semantic exit codes (defined in the Go code). The extension maps these to user-facing actions:

| Exit Code | Meaning | Extension Response |
|---|---|---|
| 0 | Success | Process output normally |
| 1 | General error | Show error notification with suggestion |
| 2 | Configuration error | Show error + "Open sentinel.config.json" action |
| 3 | IO/permission error | Show error + "Run Sentinel Doctor" action |
| 4 | Precondition failure | Show error + "Run Sentinel Init" action |

**Timeout handling for long-running commands**: `sentinel start` can take up to 2 minutes (creates sentinel sessions via the Claude CLI). The extension shows a progress indicator and uses a generous timeout:

| Command | Default Timeout | Progress UI |
|---|---|---|
| `sentinel doctor` | 10s | None (fast) |
| `sentinel status` | 10s | None (fast) |
| `sentinel start` | 120s | Progress notification with cancel |
| `sentinel stop` | 30s | Progress notification |
| `sentinel restart` | 150s | Progress notification with cancel |
| `sentinel show/hide/auto` | 10s | None (fast) |

### Alternatives Considered

1. **Redux-style global state store**: A single store with actions and reducers. Rejected as over-engineered for the data flow pattern (file → cache → events → UI). VS Code's `EventEmitter` pattern is idiomatic and sufficient.

2. **Direct file reads from UI components**: Each UI component reads files when it needs data. Rejected because this creates multiple concurrent readers, duplicate parsing, and no debouncing.

---

## 8. Harness Adapter Interface

### Decision

A **TypeScript interface** defines the contract each harness adapter must implement. The `ClaudeCodeAdapter` is the default and only Phase 1 implementation. Additional adapters (Codex, Copilot, Gemini CLI) are added in Phase 4.

### Interface Definition

```typescript
interface HarnessAdapter {
  /** Unique identifier for this harness */
  readonly id: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Whether this harness is currently available (installed, detected) */
  isAvailable(): Promise<boolean>;

  /** Detect active sessions for this harness */
  detectSessions(): Promise<HarnessSession[]>;

  /** Open a session in this harness's editor */
  openSession(sessionId: string): Promise<void>;

  /** Open the sentinel's conversation in this harness */
  openSentinelChat(sentinelSessionId: string): Promise<void>;

  /** Get the hook types this harness supports */
  supportedHooks(): HookType[];

  /** Register sentinel hooks for this harness */
  registerHooks(projectRoot: string): Promise<void>;

  /** Remove sentinel hooks for this harness */
  removeHooks(projectRoot: string): Promise<void>;

  /** Get transcript file paths for session correlation */
  getTranscriptPaths(projectRoot: string): Promise<Map<string, string>>;
}

interface HarnessSession {
  sessionId: string;
  title?: string;
  startedAt?: string;
  transcriptPath?: string;
}

type HookType = 'PreToolUse' | 'Stop' | 'PostToolUse';
```

### Claude Code Adapter Implementation

```typescript
class ClaudeCodeAdapter implements HarnessAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';

  async isAvailable(): Promise<boolean> {
    // Check if claude-vscode extension is installed
    return vscode.extensions.getExtension('anthropic.claude-code') !== undefined;
  }

  async detectSessions(): Promise<HarnessSession[]> {
    // Read from sentinel-state.json
    // Each session entry has transcript_path containing session ID
  }

  async openSession(sessionId: string): Promise<void> {
    await vscode.commands.executeCommand('claude-vscode.editor.open', sessionId);
  }

  async openSentinelChat(sentinelSessionId: string): Promise<void> {
    await vscode.commands.executeCommand('claude-vscode.editor.open', sentinelSessionId);
  }

  supportedHooks(): HookType[] {
    return ['PreToolUse', 'Stop'];
  }

  async registerHooks(projectRoot: string): Promise<void> {
    // Delegates to: sentinel init --project-dir <path>
  }

  async getTranscriptPaths(projectRoot: string): Promise<Map<string, string>> {
    // Read sentinel-state.json, return session_id → transcript_path map
  }
}
```

### Adapter Registration and Discovery

```typescript
class HarnessAdapterRegistry {
  private adapters: Map<string, HarnessAdapter> = new Map();
  private activeAdapter: HarnessAdapter | null = null;

  register(adapter: HarnessAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  async detectActiveAdapter(): Promise<HarnessAdapter | null> {
    for (const adapter of this.adapters.values()) {
      if (await adapter.isAvailable()) {
        this.activeAdapter = adapter;
        return adapter;
      }
    }
    return null;
  }

  getAdapter(id: string): HarnessAdapter | undefined {
    return this.adapters.get(id);
  }
}
```

At activation, the extension registers all known adapters and detects which is active:

```typescript
const registry = new HarnessAdapterRegistry();
registry.register(new ClaudeCodeAdapter());
// Phase 4: registry.register(new CodexAdapter());
// Phase 4: registry.register(new CopilotAdapter());
const activeAdapter = await registry.detectActiveAdapter();
```

### Cross-Harness Considerations

| Capability | Claude Code | Codex (TBD) | Copilot (TBD) |
|---|---|---|---|
| PreToolUse hook | Yes | Unknown | Unknown |
| Stop hook | Yes | Unknown | Unknown |
| Session open command | `claude-vscode.editor.open` | TBD | TBD |
| Transcript JSONL | `~/.claude/projects/` | TBD | TBD |
| Sidechain sessions | Yes (isSidechain marker) | TBD | TBD |

For harnesses without hook support, the adapter may fall back to file-watching the transcript for changes (polling-based evaluation trigger). This is documented in the daemon model analysis as a "file-watch fallback" pattern.

### Three-Tier Harness Configuration Model

Sentinel configuration supports three tiers of specificity, allowing per-harness overrides and bulk overrides without duplicating the entire config.

**Tier 1 — Base Configuration**: The standard `sentinel.config.json` fields. Applies to all harnesses by default.

**Tier 2 — Harness Overrides**: A `harness_overrides` map in `sentinel.config.json` that provides per-harness configuration. Any field present in a harness override replaces the corresponding base field for that harness only.

**Tier 3 — Bulk Override**: A `bulk_override` section in `sentinel.config.json` for fleet/enterprise use. Overrides everything — base and harness-specific. Used by IT policy management to enforce mandatory settings.

**Resolution order**: Tier 3 > Tier 2 > Tier 1 (highest tier wins).

```json
{
  "version": "1.0",
  "defaults": {
    "model": "claude-sonnet-4-5",
    "visibility": "auto"
  },
  "sentinels": [
    {
      "name": "SEC",
      "enabled": true,
      "model": "claude-sonnet-4-5",
      "timeout": 120
    }
  ],

  "harness_overrides": {
    "claude-code": {
      "sentinels": [
        {
          "name": "SEC",
          "timeout": 90
        }
      ]
    },
    "codex": {
      "defaults": {
        "visibility": "visible"
      }
    }
  },

  "bulk_override": {
    "sentinels": [
      {
        "name": "SEC",
        "enabled": true
      }
    ]
  }
}
```

**How the sentinel binary resolves the chain**: In `config.go`, after parsing the base config, apply harness-specific overrides (matched by the `SENTINEL_HARNESS` environment variable or `--harness` flag), then apply bulk overrides. The merge is field-level: only fields explicitly present in higher tiers override lower tiers. Absent fields are inherited from the tier below.

```go
func ResolveConfig(cfg *Config, harness string) *Config {
    resolved := deepCopy(cfg)
    // Tier 2: apply harness-specific overrides
    if override, ok := cfg.HarnessOverrides[harness]; ok {
        mergeConfig(resolved, override)
    }
    // Tier 3: apply bulk overrides (highest priority)
    if cfg.BulkOverride != nil {
        mergeConfig(resolved, cfg.BulkOverride)
    }
    return resolved
}
```

**Extension UI**: The extension settings view shows the resolved configuration with provenance indicators. Each field displays which tier it came from:
- "model: claude-sonnet-4-5 *(base)*"
- "timeout: 90 *(claude-code override)*"
- "enabled: true *(bulk override — locked)*"

Fields set by bulk override are shown as locked (non-editable through the extension UI), with a note explaining that they are managed by organizational policy.

**Alternatives Considered**:
1. **Separate config files per harness**: `.volition/sentinel/sentinel.config.claude-code.json`. Rejected because it fragments configuration and makes it hard to see the full picture.
2. **Environment variable overrides only**: Use `SENTINEL_*` env vars for harness-specific settings. Rejected because it doesn't compose well for complex configs with nested sentinel arrays.

### Alternatives Considered

1. **No adapter layer in Phase 1**: Hard-code Claude Code specifics everywhere and refactor later. Rejected because the adapter interface is cheap to implement now and prevents deep coupling that's expensive to refactor later.

2. **Plugin-based adapter loading**: Adapters as separate npm packages loaded dynamically. Rejected as over-engineered for Phase 1. The adapter interface is sufficient; dynamic loading can be added if the adapter count grows.

---

## 9. Extension API Surface

### Decision

The OSS extension exports a **typed API** via VS Code's `extension.exports` mechanism, versioned with a single integer version number. The commercial `volition-extension` consumes this API via `extensionDependencies`.

### API Versioning Strategy

```typescript
// API version is a single integer, incremented on breaking changes
const API_VERSION = 1;

interface SentinelExtensionAPI {
  readonly version: number;

  // --- Events ---
  readonly onObservationReceived: vscode.Event<PersistentObservation>;
  readonly onSessionStarted: vscode.Event<SessionInfo>;
  readonly onSessionStopped: vscode.Event<string>; // session ID
  readonly onHealthChanged: vscode.Event<HealthState>;
  readonly onEvalCreated: vscode.Event<EvalInfo>;
  readonly onActiveSessionChanged: vscode.Event<string | null>;

  // --- Data Accessors ---
  getObservations(filter?: ObservationFilter): PersistentObservation[];
  getSessions(): SessionInfo[];
  getHealthState(workspaceFolder?: vscode.WorkspaceFolder): HealthState;
  getActiveEvals(): EvalInfo[];
  getActiveSession(): string | null;
  getConfig(workspaceFolder?: vscode.WorkspaceFolder): SentinelConfig | null;

  // --- Actions ---
  startSentinel(options?: StartOptions): Promise<void>;
  stopSentinel(options?: StopOptions): Promise<void>;
  createEval(definition: EvalDefinition): Promise<void>;
  setVisibility(mode: 'auto' | 'visible' | 'transparent', sessionId?: string): Promise<void>;
  runDoctor(workspaceFolder?: vscode.WorkspaceFolder): Promise<DoctorResult>;

  // --- Extension Points ---
  registerSidebarSection(section: SidebarSection): vscode.Disposable;
  registerCommand(id: string, handler: (...args: any[]) => any): vscode.Disposable;
  registerHarnessAdapter(adapter: HarnessAdapter): vscode.Disposable;
}
```

### Consumer Pattern

```typescript
// In volition-extension:
const sentinelExt = vscode.extensions.getExtension('volition.agent-sentinel');
if (!sentinelExt) {
  vscode.window.showErrorMessage('agent-sentinel extension required');
  return;
}

const api: SentinelExtensionAPI = sentinelExt.exports;
if (api.version < 1) {
  vscode.window.showErrorMessage('agent-sentinel extension update required');
  return;
}

// Subscribe to observations for fleet aggregation
api.onObservationReceived(obs => {
  fleetDashboard.ingest(obs);
});

// Add enterprise sidebar section
api.registerSidebarSection({
  id: 'fleet-dashboard',
  title: 'Fleet Dashboard',
  webviewProvider: new FleetDashboardProvider()
});
```

### Stability Guarantees

| Category | Stability | Rule |
|---|---|---|
| Event emitters (`on*`) | **Stable** | Additive only; events are never removed or renamed |
| Data accessors (`get*`) | **Stable** | Return types may gain optional fields; never remove fields |
| Actions | **Stable** | Parameters may gain optional fields; never change existing parameters |
| Extension points (`register*`) | **Experimental** | May change between major versions |
| Internal types | **Private** | Not exported; may change freely |

Breaking changes increment the `version` number. Consumers check `api.version >= N` before using features introduced in version N.

### Alternatives Considered

1. **No API in Phase 1**: Add the API only when volition-extension needs it (Phase 5). Rejected because designing the API now forces clean internal architecture. The API is essentially a typed façade over the internal event system, which we need anyway.

2. **JSON-RPC between extensions**: Extensions communicate via a protocol instead of direct API. Rejected as unnecessary complexity — VS Code's `extension.exports` is the standard mechanism and provides type safety.

3. **Shared npm package**: Both extensions import a shared types/logic package. Acceptable for shared types (and likely used for `PersistentObservation` etc.), but the runtime API must be VS Code's extension export mechanism.

---

## 10. Cross-IDE Protocol

> **Implementation timeline**: Phase 4+. Designed now to ensure the architecture doesn't preclude it.

### Decision

**JSON-RPC 2.0 over stdio** as the protocol between the core Go service and IDE clients. This is the LSP-proven pattern — well understood, broadly supported, and platform-agnostic.

### Protocol Choice Evaluation

| Protocol | Latency | Complexity | Cross-Platform | Bidirectional | Ecosystem |
|---|---|---|---|---|---|
| **JSON-RPC over stdio** | Low (pipe) | Low | Excellent | Yes (notifications) | LSP, DAP, many editors |
| HTTP REST | Medium (TCP) | Medium | Good | Needs SSE/WebSocket for push | Universal |
| gRPC | Low | High | Good (needs runtime) | Yes (streaming) | Enterprise, not IDE-native |
| Custom binary | Lowest | Highest | Needs per-platform impl | Yes | None |

**JSON-RPC over stdio wins** because:
- LSP has proven this works for IDE ↔ language service communication at scale
- Every IDE has JSON-RPC client libraries (VS Code, JetBrains, Neovim all support LSP)
- stdio avoids port allocation, firewall issues, and platform-specific socket paths
- Bidirectional: the service sends JSON-RPC notifications for events; the client sends requests for commands

### Message Types

```typescript
// --- Service → Client (Notifications) ---
interface ObservationNotification {
  method: 'sentinel/observation';
  params: PersistentObservation;
}

interface StateChangedNotification {
  method: 'sentinel/stateChanged';
  params: { sessions: SessionInfo[] };
}

interface HealthChangedNotification {
  method: 'sentinel/healthChanged';
  params: HealthState;
}

// --- Client → Service (Requests) ---
interface StartRequest {
  method: 'sentinel/start';
  params: { sessionId?: string; sentinels?: string[] };
}

interface StopRequest {
  method: 'sentinel/stop';
  params: { sessionId?: string; all?: boolean };
}

interface DoctorRequest {
  method: 'sentinel/doctor';
  params: {};
}

interface SetVisibilityRequest {
  method: 'sentinel/setVisibility';
  params: { mode: string; sessionId?: string };
}
```

### Connection Lifecycle

1. IDE client starts the sentinel service: `sentinel serve --stdio`
2. Service writes JSON-RPC messages to stdout, reads from stdin
3. Client sends `initialize` request with client capabilities
4. Service responds with server capabilities (supported hooks, available tiers, etc.)
5. Service pushes events as notifications
6. Client sends commands as requests
7. On IDE shutdown, client sends `shutdown` request, then `exit` notification

### Current Architecture Compatibility

The current file-watching approach (Phase 1–3) and the JSON-RPC protocol (Phase 4+) are **complementary, not conflicting**:

- Phase 1–3: Extension reads files directly, spawns CLI commands
- Phase 4+: Extension connects to `sentinel serve --stdio` for real-time events AND can still fall back to file watching if the service isn't running

The observation JSONL file remains the durable store regardless of whether a client is connected. The JSON-RPC protocol becomes an optimization for lower-latency event delivery and command execution.

### Alternatives Considered

1. **HTTP with WebSocket**: Familiar for web developers, but requires port allocation and doesn't match IDE conventions. LSP's stdio model is more appropriate.

2. **Named pipes / Unix domain sockets**: Lower level than JSON-RPC, requires custom protocol design. JSON-RPC gives us framing, error handling, and request/response correlation for free.

3. **File watching forever**: Never add a protocol; always use file watching. Rejected because JetBrains and Neovim clients benefit from a standardized protocol, and file watching has inherently higher latency than pipe-based notification.

---

## 11. Data Flow Diagrams

### Observation Lifecycle

```
Claude Code Session (agent doing work)
    │
    │ Agent completes a turn
    ▼
Claude Code Stop Hook fires
    │
    │ Pipes JSON to stdin: { session_id, transcript_path, stop_hook_active }
    ▼
sentinel trigger (Go binary)
    │
    ├─ Read sentinel-state.json (get session state, cursors)
    ├─ Read transcript JSONL from cursor (get delta)
    ├─ Run evaluations (Tier 1 local LLM / Tier 2 cloud LLM)
    │   (Tier 0 does NOT run here — it runs on PreToolUse only)
    │
    │ Evaluation produces observation
    ▼
ParseObservation()
    │
    ├─ ★ AppendObservation() → sentinel-observations.jsonl (NEW)
    │       │
    │       │ File change event (OS kernel → inotify/FSEvents)
    │       ▼
    │   Extension FileSystemWatcher fires
    │       │
    │       ▼
    │   ObservationStore reads new lines from offset
    │       │
    │       ▼
    │   EventBus emits onObservationReceived
    │       │
    │       ├─ StatusBar updates (severity color)
    │       ├─ Sidebar LiveFeed appends card
    │       ├─ Notification (if CRITICAL)
    │       └─ Extension API event (for volition)
    │
    ├─ InjectObservationToJSONL() → session transcript (existing)
    │       └─ Observation visible in Claude Code's chat UI
    │
    └─ Output decision:block to stdout → Claude Code receives observation
            └─ Agent relays observation to user (XML relay path, slower)
```

### PreToolUse Flow (Tier 0 Inline Prevention)

```
Claude Code Agent
    │
    │ Agent wants to execute: Bash("rm -rf /")
    ▼
Claude Code PreToolUse Hook fires
    │
    │ Pipes JSON to stdin: { session_id, tool_name: "Bash", tool_input: { command: "rm -rf /" } }
    ▼
sentinel pretrigger (Go binary)
    │
    ├─ Load compiled patterns (cached regex objects)
    ├─ Match tool_name against pattern tool_match filters
    ├─ Run matching regexes against tool_input fields
    │
    │ Pattern SEC-T0-001 matches!
    ▼
    ├─ ★ AppendObservation() → sentinel-observations.jsonl
    │       │
    │       │ (same extension flow as above)
    │       ▼
    │   Extension shows "PREVENTED" badge on observation card
    │
    └─ Output: { "decision": "block", "reason": "🔴 SENTINEL [SEC] Recursive file deletion blocked -- SEC-T0-001 (Tier 0)" }
            │
            ▼
    Claude Code BLOCKS the tool call (rm -rf / never executes)
            │
            ▼
    Agent receives block reason, informs user

Total time: <10ms (pattern matching only, no LLM)
```

### Session Correlation Flow

```
User clicks a Claude Code tab in VS Code
    │
    ▼
vscode.window.tabGroups.onDidChangeTabs fires
    │
    ▼
SessionCorrelator.correlateActiveSession()
    │
    ├─ Check 1: Extension-opened session cache
    │   └─ Hit? → session ID known instantly
    │
    ├─ Check 2: Transcript file activity
    │   ├─ Read sentinel-state.json → get all session transcript paths
    │   ├─ fs.stat each transcript path → get modification times
    │   └─ Most recently modified within 5s? → high confidence session ID
    │
    ├─ Check 3: Title matching
    │   ├─ Get active tab label
    │   ├─ Compare against known session titles
    │   └─ Match? → medium confidence session ID
    │
    └─ No correlation → return null
    │
    ▼
EventBus emits onActiveSessionChanged(sessionId)
    │
    ├─ ObservationStore filters to session
    ├─ Sidebar LiveFeed re-renders
    ├─ StatusBar shows session-specific health
    └─ SessionHealthView updates charts
```

### Eval Creation Flow

```
User clicks "New Eval" in sidebar
    │
    ▼
Extension opens eval creation webview
    │
    │ User types: "The agent keeps forgetting we decided to use PostgreSQL, not SQLite"
    ▼
Extension sends description to configured LLM
    │ (Via harness adapter → claude CLI or local endpoint)
    ▼
LLM generates YAML eval rule
    │
    ▼
Extension renders preview in webview
    │
    │ User reviews, optionally edits YAML
    │ User clicks "Save"
    ▼
Extension writes YAML to .volition/sentinel/evals/<domain>/<id>.yaml
    │
    │ (sentinel reads eval files on next trigger — zero restart needed)
    ▼
ConfigManager detects eval file change
    │
    ▼
EvalRulesView refreshes to show new rule
    │
    ▼
Next sentinel trigger loads and applies the new eval
```

---

## Phase 0 Prerequisites Summary

These changes to the `agent-sentinel` Go codebase must be completed before extension development begins:

| # | Change | Files | Effort | Blocking |
|---|---|---|---|---|
| P0-1 | **Observation persistence** — `AppendObservation` function, `PersistentObservation` type | `types.go`, `trigger.go`, new `observation.go` | Medium | Phase 1 (extension needs observations to display) |
| P0-2 | **PreToolUse hook registration** — `RegisterPreToolUseHook` in hook.go | `hook.go`, `types.go` | Small | Phase 1 (init must register both hooks) |
| P0-3 | **Pretrigger command** — `sentinel pretrigger` subcommand | `main.go`, new `pretrigger.go`, new `patterns.go` | Medium | Phase 1 (Tier 0 inline prevention) |
| P0-4 | **Doctor command** — `sentinel doctor` subcommand | `main.go`, new `doctor.go`, `types.go` | Medium | Phase 1 (health assessment) |
| P0-5 | **Observation JSONL cleanup** — extend `PruneStaleSessions` to prune observations | `state.go` | Small | Phase 1 (prevents unbounded growth) |
| P0-6 | **Pattern loading infrastructure** — YAML pattern parser, regex compiler, embedded default patterns | new `patterns.go` | Medium | Phase 1 (Tier 0 patterns) |
| P0-7 | **Validate PreToolUse hook input schema** — Build a minimal PreToolUse hook that logs the raw JSON stdin to a file. Run it against real Claude Code sessions to capture the actual input schema (field names, nesting, which fields are present for which tools). Compare against the assumed schema in §5. Adjust `PreToolUseInput` struct and pattern field matchers before building the full pattern engine. | None (test script only) | Small | P0-3, P0-6 (building on assumptions that must be validated) |

**Recommended order**: P0-1 → P0-4 → P0-2 → **P0-7** → P0-6 → P0-3 → P0-5

P0-1 (observation persistence) is the single most important prerequisite — without it, the extension has nothing to display in real-time. P0-7 (PreToolUse schema validation) must precede P0-6 and P0-3 to avoid building the pattern engine against an assumed input schema that may be wrong.

---

## Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-1 | Claude Code changes hook input format | PreToolUse handler breaks | Low | Version the input parser; gracefully degrade on unknown format |
| R-2 | File watcher events delayed on some OS | Observations appear late | Low | OS-level watchers are fast; add polling fallback with 1s interval |
| R-3 | `sentinel-observations.jsonl` corruption | Extension shows stale/wrong data | Low | Each line is independent; skip corrupt lines and continue |
| R-4 | Session correlation fails frequently | Users see wrong session's data | Medium | Default to "All Sessions" view; make correlation failure graceful, not broken |
| R-5 | Memory budget exceeded with many sessions | Extension slow/crashes | Medium | Bounded caches, lazy loading, profiling in CI |
| R-6 | Claude Code removes `editor.open` command | Sentinel chat, observation navigation break | Low | Feature-detect the command at activation; disable features gracefully |
| R-7 | Tier 0 regex patterns cause false positives | Users disable patterns, trust erodes | Medium | Conservative default patterns; easy per-pattern disable; hit count visibility |
| R-8 | Multi-workspace observation file conflicts | Wrong observations shown | Low | Per-workspace ObservationStore instances; observations keyed by workspace |
| R-9 | Large observation files slow extension activation | Slow startup | Low | Stream-parse from end of file; only load recent observations on activation |
| R-10 | PreToolUse timeout (1s) exceeded on slow machines | Tool calls delayed | Low | Pattern matching is <10ms; 1s timeout is 100x safety margin |

---

*This document defines the technical architecture for implementing the [Vision & Product Requirements](vision-and-requirements.md). It is the authoritative reference for how the extension will be built. Implementation details, code, and timelines are tracked separately.*
