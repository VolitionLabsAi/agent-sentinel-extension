# Agent Sentinel Extension — Phase Plan

> **Status**: In Progress
> **Date**: 2026-03-25
> **Companion to**: [Vision & Product Requirements](vision-and-requirements.md) · [Architecture Design](architecture.md)

**Current Status** (2026-03-25):
| Phase | Status |
|-------|--------|
| Phase 0: Sentinel Foundation | Complete |
| Phase 1: Extension Scaffold + Core Experience | Complete (+ QC pass) |
| Phase 2: Rich Dashboard + Eval Management | Complete |
| Phase 3: Sentinel Interaction | Complete |
| Phase 4: Cross-Harness Support | Complete (+ QC pass) |
| Phase 5: Extension API + Commercial Foundation | Deferred |
| Phase 6: Polish, Marketplace, Community | **In progress** |

---

## Table of Contents

- [Dependency Graph](#dependency-graph)
- [Phase 0: Sentinel Foundation](#phase-0-sentinel-foundation)
- [Phase 1: Extension Scaffold + Core Experience](#phase-1-extension-scaffold--core-experience)
- [Phase 2: Rich Dashboard + Eval Management](#phase-2-rich-dashboard--eval-management)
- [Phase 3: Sentinel Interaction](#phase-3-sentinel-interaction)
- [Phase 4: Cross-Harness Support](#phase-4-cross-harness-support)
- [Phase 5: Extension API + Commercial Foundation](#phase-5-extension-api--commercial-foundation)
- [Phase 6: Polish, Marketplace, Community](#phase-6-polish-marketplace-community)
- [Future Work (Deferred)](#future-work-deferred)

---

## Dependency Graph

```
Phase 0: Sentinel Foundation (Go)
  │
  │  P0-1 Observation persistence ──────────────────────────────────────┐
  │  P0-4 Doctor command ───────────────────────────────────────────────┤
  │  P0-2 PreToolUse hook registration ─────────────────────────┐      │
  │  P0-7 Validate PreToolUse input schema ──┐                  │      │
  │  P0-6 Pattern loading infrastructure ────┤                  │      │
  │  P0-3 Pretrigger command ────────────────┘                  │      │
  │  P0-8 Default Tier 0 patterns ──────────────────────────────┘      │
  │  P0-5 Observation JSONL cleanup ───────────────────────────────────┤
  │                                                                    │
  ▼                                                                    ▼
Phase 1: Extension Scaffold + Core Experience (TypeScript)
  │  P1-01 Repository + project setup
  │  P1-02 Docs migration
  │  P1-03 Status bar heartbeat
  │  P1-04 File watcher system
  │  P1-05 Observation store
  │  P1-06 Activity bar + Live Feed
  │  P1-07 Session correlation
  │  P1-08 Multi-session view modes
  │  P1-09 Guided setup walkthrough
  │  P1-10 Health assessment / doctor integration
  │  P1-11 Dual-publish setup
  │  P1-12 Extension icon + branding
  │  P1-13 Marketplace README
  │  P1-14 Clickable observation navigation
  │
  ▼
Phase 2: Rich Dashboard ────────► Phase 3: Sentinel Interaction
  │  (webviews, eval mgmt)            (chat, eval creation, steering)
  │                                        │
  ▼                                        ▼
Phase 4: Cross-Harness Support ◄───────────┘
  │  (adapters for Codex, Copilot, Gemini)
  │
  ▼
Phase 5: Extension API + Commercial Foundation
  │  (API surface, volition-extension scaffold)
  │
  ▼
Phase 6: Polish, Marketplace, Community
   (docs site, community evals, marketplace optimization)
```

**Key**: Phases 2 and 3 can be developed in parallel. Phase 4 depends on both. Phase 5 is deferred; Phase 6 is being executed next.

---

## Phase 0: Sentinel Foundation

**Goal**: Make agent-sentinel produce the data the extension needs — observations on disk, inline prevention, and health diagnostics.

**Prerequisites**: None. This is the first phase.

**Expertise required**: Go

**Parallelization**: P0-1 and P0-4 are independent and can be developed in parallel. P0-2 is independent of P0-1/P0-4. P0-7 → P0-6 → P0-3 → P0-8 are sequential. P0-5 can be done anytime after P0-1.

**Recommended execution order**: P0-1 ∥ P0-4 → P0-2 → P0-7 → P0-6 → P0-3 → P0-8 → P0-5

---

### P0-1: Observation Persistence

**Description**: Add an append-only JSONL observation file (`sentinel-observations.jsonl`) that the extension will tail-follow for real-time display. Each observation written by the trigger pipeline is persisted as a structured JSON line immediately after parsing — before the `decision:block` response reaches the agent.

**Acceptance Criteria**:
- `AppendObservation()` function writes a single JSON line with atomic `O_APPEND` semantics
- `PersistentObservation` struct contains all fields from Architecture §2 schema: `timestamp`, `session_id`, `sentinel_name`, `sentinel_label`, `severity`, `eval_id`, `one_liner`, `analysis`, `turn_number`, `duration_ms`, `tier`, `visibility`, `dynamic_eval_created`, `hook_type`, `version`
- Observations are written **inside** the multi-sentinel results loop (per Architecture §2, "inside the loop, not after")
- System observations (timeouts with `EvalID: SYSTEM-TIMEOUT`) are also persisted
- `AppendObservation` errors are logged but never block the trigger pipeline
- File is created at `.volition/sentinel/sentinel-observations.jsonl`
- Unit tests verify: JSON roundtrip, concurrent append safety, partial-line handling
- Integration test: run `sentinel trigger` and verify JSONL file contains valid observation

**Key Files**:
- `pkg/sentinel/types.go` — add `PersistentObservation` struct
- `pkg/sentinel/observation.go` (NEW) — `AppendObservation`, `toPersistentObservation`
- `pkg/sentinel/trigger.go` — add write calls inside results loop

**Dependencies**: None

---

### P0-2: PreToolUse Hook Registration

**Description**: Add `RegisterPreToolUseHook` and `RemovePreToolUseHook` to `hook.go`, mirroring the existing `RegisterHook`/`RemoveHook` pair. The `sentinel init` and `sentinel start` commands register both Stop and PreToolUse hooks in `.claude/settings.json`. The PreToolUse hook timeout is 1 second.

**Acceptance Criteria**:
- `RegisterPreToolUseHook` writes a `PreToolUse` entry to `.claude/settings.json` with `command: "sentinel pretrigger"` and `timeout: 1`
- `RemovePreToolUseHook` removes the PreToolUse entry on `sentinel stop`
- `sentinel init` registers both Stop and PreToolUse hooks
- `sentinel start` registers both hooks (if not already present)
- Existing Stop hook registration unchanged
- Unit tests verify hook JSON structure in settings file
- Integration test: `sentinel init` → verify `.claude/settings.json` has both hooks

**Key Files**:
- `pkg/sentinel/hook.go` — add `RegisterPreToolUseHook`, `RemovePreToolUseHook`
- `pkg/sentinel/types.go` — add PreToolUse-related hook types
- `cmd/sentinel/main.go` — update `init` and `start` commands

**Dependencies**: None

---

### P0-3: Pretrigger Command

**Description**: Add `sentinel pretrigger` subcommand — the handler for PreToolUse hooks. Reads tool call JSON from stdin, runs Tier 0 pattern matching, outputs `decision:block` for matches or exits silently for passes. Appends observations to the JSONL file for both blocks and notable matches.

**Acceptance Criteria**:
- `sentinel pretrigger` reads JSON from stdin matching the validated PreToolUse input schema (from P0-7)
- Loads compiled patterns from `.volition/sentinel/patterns/` directory
- Runs regex pattern matching against tool input fields in <10ms
- On match: outputs `{"decision": "block", "reason": "..."}` to stdout AND appends observation to JSONL with `hook_type: "pretooluse"` and `tier: "tier_0"`
- On no match: exits with code 0, no stdout output
- Total execution time <10ms for 50 compiled patterns (benchmarked)
- Unit tests verify: pattern matching, JSON output format, observation persistence
- Integration test: pipe dangerous command JSON to stdin → verify block and JSONL entry

**Key Files**:
- `cmd/sentinel/main.go` — add `pretriggerCmd()` subcommand
- `pkg/sentinel/pretrigger.go` (NEW) — PreToolUse handler
- `pkg/sentinel/patterns.go` (from P0-6) — pattern engine

**Dependencies**: P0-1 (observation persistence), P0-7 (validated input schema), P0-6 (pattern loading)

---

### P0-4: Doctor Command

**Description**: Add `sentinel doctor` subcommand that performs health checks across four categories (prerequisites, configuration, hook integrity, runtime health) and outputs structured results. Supports `--format json` for extension consumption and human-readable default output.

**Acceptance Criteria**:
- Implements all checks from Architecture §6: `binary_on_path`, `claude_cli_available`, `config_dir_exists`, `claude_dir_exists`, `config_file_valid`, `config_sentinels_defined`, `config_sentinels_enabled`, `eval_files_exist`, `eval_files_parse`, `pattern_files_valid`, `stop_hook_registered`, `pretooluse_hook_registered`, `hook_command_resolves`, `hook_timeout_reasonable`, `state_file_exists`, `state_file_valid`, `sessions_alive`, `no_excessive_failures`, `no_excessive_timeouts`, `observations_file_writable`
- Each check reports: `name`, `category`, `status` (pass/warning/error), `message`, optional `fix`
- `--format json` outputs `DoctorResult` JSON matching Architecture §6 schema
- Default output is human-readable with ✓/✗/⚠ indicators
- Exit codes: 0 (healthy), 1 (warnings), 2 (errors)
- `--project-dir <path>` flag for extension to specify workspace
- Unit tests for each individual check
- Integration test: run in a configured project → verify JSON output parses

**Key Files**:
- `cmd/sentinel/main.go` — add `doctorCmd()` subcommand
- `pkg/sentinel/doctor.go` (NEW) — check implementations, `RunDoctor`
- `pkg/sentinel/types.go` — add `DoctorCheck`, `DoctorResult` types

**Dependencies**: None (can run in parallel with P0-1)

---

### P0-5: Observation JSONL Cleanup

**Description**: Extend the existing `PruneStaleSessions` in `state.go` to also prune observation lines for sessions being cleaned up. When `sentinel stop --all` or stale session pruning runs, observation lines belonging to those sessions are removed from the JSONL file.

**Acceptance Criteria**:
- `PruneStaleSessions` reads `sentinel-observations.jsonl`, filters out lines matching pruned session IDs, and rewrites the file
- `sentinel stop --all` triggers observation pruning for all stopped sessions
- Pruning is atomic: write to temp file, then rename (no partial file states)
- If JSONL file doesn't exist, pruning is a no-op (not an error)
- Unit test: create JSONL with multiple sessions → prune one → verify remaining
- File size test: verify pruning reduces file size correctly

**Key Files**:
- `pkg/sentinel/state.go` — extend `PruneStaleSessions`
- `pkg/sentinel/observation.go` — add `PruneObservations(sessionIDs []string)`

**Dependencies**: P0-1 (observation persistence must exist to prune)

---

### P0-6: Pattern Loading Infrastructure

**Description**: Build the YAML pattern parser, regex compiler, and in-process matching engine for Tier 0 patterns. Patterns define regex rules against tool input fields, filtered by tool name. Default patterns are embedded in the binary via `//go:embed`.

**Acceptance Criteria**:
- `PatternSet` struct parsed from YAML matching Architecture §5 schema: `id`, `name`, `severity`, `tool_match`, `input_patterns` (with `field` and `regex`), `message`
- Patterns compiled to `regexp.Regexp` objects at load time
- `LoadPatterns(dir string)` loads all `.yaml` files from a directory
- `MatchPatterns(toolName string, toolInput map[string]interface{}, patterns []CompiledPattern) []PatternMatch` runs matching
- Matching short-circuits on first match per pattern (not per regex within a pattern)
- Embedded `default.yaml` via `//go:embed` for zero-config operation
- Benchmark: 50 compiled patterns against typical tool input completes in <5ms
- Unit tests: YAML parsing, regex compilation, matching logic, tool name filtering

**Key Files**:
- `pkg/sentinel/patterns.go` (NEW) — `PatternSet`, `CompiledPattern`, `LoadPatterns`, `MatchPatterns`
- `pkg/sentinel/patterns/default.yaml` (NEW, embedded) — default pattern set
- `pkg/sentinel/config.go` — add `PatternConfig` fields

**Dependencies**: P0-7 (must know the actual input schema to write correct field matchers)

---

### P0-7: Validate PreToolUse Hook Input Schema

**Description**: Build a minimal PreToolUse hook that logs raw JSON stdin to a file. Run it against real Claude Code sessions to capture the actual input schema. Compare against the assumed schema in Architecture §5 and adjust `PreToolUseInput` struct before building the full pattern engine.

**Acceptance Criteria**:
- A test hook script/binary that reads stdin and writes raw JSON to a timestamped log file
- Hook registered in a test project's `.claude/settings.json` as a PreToolUse hook
- Captured samples for at least these tool types: `Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep`
- Documented schema: field names, nesting structure, which fields exist for which tools
- `PreToolUseInput` struct updated to match actual schema (if different from Architecture §5 assumption)
- Findings documented in a brief markdown file or inline code comments
- Decision: confirm or revise the assumed schema `{ session_id, tool_name, tool_input: { ... } }`

**Key Files**:
- `scripts/validate-pretooluse-schema.sh` (NEW, temporary test script)
- `pkg/sentinel/types.go` — update `PreToolUseInput` based on findings

**Dependencies**: P0-2 (need hook registration to set up the test hook)

---

### P0-8: Default Tier 0 Patterns

**Description**: Author the default pattern set that ships embedded in the binary. These patterns cover the highest-value Tier 0 detections: dangerous shell commands, credential patterns in code, and common injection vectors.

**Acceptance Criteria**:
- `default.yaml` contains patterns for at least:
  - **Dangerous commands**: `rm -rf /`, `rm -rf ~`, `chmod 777`, `mkfs`, `dd if=/dev/zero`, `:(){ :|:& };:`
  - **Credential patterns**: API keys, secrets, passwords, tokens hardcoded in file writes (Write/Edit tools)
  - **Injection vectors**: `curl ... | bash`, `eval $(...)`, downloading and executing remote scripts
  - **Data exfiltration**: `curl` or `wget` posting file contents to external URLs
- Each pattern has: unique `SEC-T0-xxx` ID, severity (critical/warning), descriptive message
- False positive rate validated against 100+ benign tool calls (no false positives on common operations like `npm install`, `git commit`, file reads)
- Pattern IDs follow the namespace convention from Architecture §5 (`SEC-T0-001` through `SEC-T0-xxx`)
- Regex patterns are tested against both positive matches and negative cases

**Key Files**:
- `pkg/sentinel/patterns/default.yaml` (NEW, embedded)
- `pkg/sentinel/patterns_test.go` (NEW) — positive/negative match tests for each pattern

**Dependencies**: P0-6 (pattern loading infrastructure), P0-7 (validated input schema for correct field names)

---

### Phase 0 Gate

Phase 0 is complete when ALL of the following are true:

1. `sentinel trigger` appends observations to `sentinel-observations.jsonl` with the full schema
2. `sentinel pretrigger` blocks dangerous tool calls in <10ms and persists observations
3. `sentinel doctor --format json` returns structured health check results
4. `sentinel init` registers both Stop and PreToolUse hooks
5. Default Tier 0 patterns detect dangerous commands, credentials, and injection vectors
6. Observation cleanup runs on `sentinel stop --all`
7. All new code has unit tests with >80% coverage
8. All changes pass existing CI pipeline

**Deliverables**:
- Updated `agent-sentinel` binary with `pretrigger`, `doctor` subcommands
- `sentinel-observations.jsonl` file format (versioned schema)
- `default.yaml` pattern set (embedded)
- PreToolUse input schema documentation

---

## Phase 1: Extension Scaffold + Core Experience

**Goal**: The "install and say wow" moment — a working VS Code extension that shows real-time observations from sentinel, with status bar heartbeat, live feed, and guided setup.

**Prerequisites**: Phase 0 complete (P0-1 observation persistence is the hard dependency; P0-4 doctor command needed for health assessment)

**Expertise required**: TypeScript, VS Code Extension API, esbuild, CSS

**Parallelization**: P1-01 must be first. P1-02 can happen anytime. P1-03, P1-04, P1-05 can be developed in parallel after P1-01. P1-06 depends on P1-04 + P1-05. P1-07 depends on P1-04. P1-08 depends on P1-06 + P1-07. P1-14 depends on P1-06 + P1-07. P1-09 through P1-13 can be parallelized after core functionality works.

**Recommended execution order**: P1-01 → (P1-03 ∥ P1-04 ∥ P1-05) → P1-06 → P1-07 → (P1-08 ∥ P1-14) → (P1-09 ∥ P1-10 ∥ P1-11 ∥ P1-12 ∥ P1-13) → P1-02

---

### P1-01: Extension Project Setup

**Description**: Create the `agent-sentinel-extension` repository with a complete TypeScript project scaffold: `package.json` with VS Code extension manifest, TypeScript configuration, esbuild bundler, ESLint, Prettier, CI pipeline (GitHub Actions), and a minimal `extension.ts` that activates and logs.

**Acceptance Criteria**:
- Repository created with Apache 2.0 license
- `package.json` with:
  - `publisher: "volition"`
  - `engines.vscode: "^1.85.0"` (or current minimum)
  - `activationEvents: ["workspaceContains:**/.volition/sentinel/sentinel.config.json", "onStartupFinished"]`
  - `contributes.commands`, `contributes.viewsContainers`, `contributes.views` stubs
  - `contributes.configuration` with settings from Architecture §7 (`sentinel.autoStart`, `sentinel.statusBar.enabled`, `sentinel.observations.maxInMemory`, `sentinel.viewMode`, `sentinel.doctor.backgroundInterval`)
- `tsconfig.json` with strict mode, ES2022 target
- `esbuild.mjs` build script producing a single bundled `extension.js`
- `.github/workflows/ci.yml` — lint, type-check, test, build on push/PR
- `extension.ts` with `activate()` that logs "Agent Sentinel activated" and returns empty API stub
- `npm run build` produces a working `.vsix` that installs in VS Code
- `npm run test` runs (even if no tests yet, the runner works)
- CI pipeline includes activation time and memory usage measurement (fail on >200ms activation / >50MB memory)

**Key Files**:
- `package.json`, `tsconfig.json`, `esbuild.mjs`, `.eslintrc.json`
- `src/extension.ts`
- `.github/workflows/ci.yml`

**Dependencies**: None (first task)

---

### P1-02: Planning Docs Migration

**Description**: Migrate planning documents from `agent-sentinel/docs/extension/` to the new `agent-sentinel-extension` repository. Update cross-references. Leave a forwarding note in the original location.

**Acceptance Criteria**:
- `vision-and-requirements.md`, `architecture.md`, `phase-plan.md` copied to new repo's `docs/` directory
- Internal cross-references updated to reflect new paths
- `agent-sentinel/docs/extension/` contains a `README.md` noting the docs have moved, with link to new location
- No broken links within the migrated documents

**Key Files**:
- `docs/vision-and-requirements.md`, `docs/architecture.md`, `docs/phase-plan.md` (in new repo)

**Dependencies**: P1-01 (repository must exist)

---

### P1-03: Status Bar Heartbeat

**Description**: Implement the persistent status bar item that shows sentinel health state with color-coding. Click to cycle visibility modes (`auto → show → hide`). The status bar is the "always on" surface — even users who never open the panel know sentinel is watching.

**Acceptance Criteria**:
- Status bar item created on activation with priority placement (left side)
- Color states match Vision §2.6: Grey (Not Initialized), Blue (Idle), Green (Running), Amber (Degraded), Red (Error)
- Displays text like "$(shield) Sentinel" with appropriate icon
- Shows last evaluation time when available
- Click cycles visibility: `auto → show → hide`, updates text to indicate current mode
- Subscribes to `onHealthChanged` events from the EventBus (or placeholder until EventBus exists)
- Tooltip shows expanded info: health state, active session count, last observation severity
- Respects `sentinel.statusBar.enabled` setting
- Works correctly when no sentinel config exists (shows Grey/Not Initialized)
- **Sparkline deferred**: The status bar does NOT include a sparkline in Phase 1. Sparkline rendering is deferred to P2-1 (Session Health Webview), where the chart rendering infrastructure is built. Adding sparklines to the status bar before that infrastructure exists would mean building one-off chart code that is immediately replaced. P2-1 can retroactively add a sparkline to the status bar tooltip using the shared chart module.

**Key Files**:
- `src/ui/status-bar.ts` (NEW) — `StatusBarManager` class
- `src/extension.ts` — register status bar on activation

**Dependencies**: P1-01 (project setup)

---

### P1-04: File Watcher System

**Description**: Implement the `FileWatcherManager` and `WorkspaceManager` that monitor sentinel's on-disk data structures. Uses `vscode.workspace.createFileSystemWatcher` for OS-level file change notifications with debounced event processing, per Architecture §4.

**Acceptance Criteria**:
- `FileWatcherManager` creates watchers for:
  - `sentinel-state.json` (150ms debounce)
  - `sentinel-observations.jsonl` (50ms debounce)
  - `sentinel.config.json` (no debounce, rare changes)
- `WorkspaceManager` creates per-workspace-folder `FileWatcherManager` instances
- Handles workspace folder add/remove via `onDidChangeWorkspaceFolders`
- Debouncer implementation coalesces rapid events into single callbacks
- File watchers registered in `context.subscriptions` for automatic cleanup
- Error handling per Architecture §4: missing files (watch for creation), corrupt JSON (log + keep cache), permission denied (status bar error)
- All watchers disposed on deactivation
- Unit tests for debouncer logic
- Integration test: write to a watched file → verify callback fires
- Multi-workspace: extension correctly manages separate `FileWatcherManager` instances and independent observation feeds for a multi-root workspace with two workspace folders

**Key Files**:
- `src/watchers/file-watcher-manager.ts` (NEW)
- `src/watchers/workspace-manager.ts` (NEW)
- `src/utils/debouncer.ts` (NEW)

**Dependencies**: P1-01 (project setup)

---

### P1-05: Observation Store

**Description**: Implement `ObservationStore` — the in-memory cache populated from `sentinel-observations.jsonl`. Supports tail-following (reading from byte offset), truncation detection, bounded caching (1000 per session), and event emission on new observations.

**Acceptance Criteria**:
- Reads entire JSONL file on activation, parsing each line into `PersistentObservation` objects
- On file change (from watcher): reads new lines from last known byte offset to EOF
- Truncation detection: if file size < stored offset, reset to 0 and re-read entirely
- Bounded cache: keeps most recent 1000 observations per session in memory (configurable via `sentinel.observations.maxInMemory`)
- Skips malformed JSON lines (logs warning, continues)
- Emits `onObservationReceived` event for each new valid observation
- `getObservations(filter?)` returns observations filtered by session ID, severity, time range
- Memory test: 10 sessions × 1000 observations stays under 15MB
- Unit tests: JSONL parsing, offset tracking, truncation reset, cache eviction

**Key Files**:
- `src/stores/observation-store.ts` (NEW)
- `src/types/observation.ts` (NEW) — `PersistentObservation` TypeScript interface matching Go struct

**Dependencies**: P1-01 (project setup)

---

### P1-06: Activity Bar Panel with Live Feed View

**Description**: Register a sentinel icon in the VS Code activity bar. Implement the Live Feed tree view that streams observations in real-time, severity-colored, with eval ID, one-liner summary, and expandable analysis.

**Acceptance Criteria**:
- Activity bar icon registered via `contributes.viewsContainers.activitybar` in `package.json`
- Live Feed view registered as a `TreeDataProvider`
- Tree items display: severity icon (color-coded), eval ID, one-liner, timestamp
- Expanding a tree item reveals: full analysis text, sentinel name, tier, duration
- New observations appear at the top of the feed automatically (via `onObservationReceived` event → `refresh()`)
- Severity coloring: red for CRITICAL, amber for WARNING, blue for INFO
- "PREVENTED" badge on `hook_type: "pretooluse"` observations (vs. "OBSERVED" for stop)
- Empty state: friendly message when no observations exist ("No observations yet — sentinel is watching")
- Accessibility: severity communicated via icon + label (not color alone), keyboard navigable
- Respects VS Code high-contrast themes

**Key Files**:
- `src/ui/sidebar/live-feed-provider.ts` (NEW)
- `src/ui/sidebar/observation-tree-item.ts` (NEW)
- `package.json` — `contributes.viewsContainers`, `contributes.views`
- `media/icons/` — severity icons (SVG)

**Dependencies**: P1-04 (file watchers), P1-05 (observation store)

---

### P1-07: Session Correlation

**Description**: Implement `SessionCorrelator` using the hybrid approach from Architecture §3. Maps focused VS Code Claude Code tabs to sentinel session IDs using three signals: extension-opened cache (instant), transcript file activity (high confidence), title matching (fallback).

**Acceptance Criteria**:
- `SessionCorrelator` class with `correlateActiveSession(): string | null`
- Signal 1 — Tab cache: when extension opens a session via `claude-vscode.editor.open`, caches `{tabKey → sessionId}` for instant lookup
- Signal 2 — Transcript activity: monitors modification timestamps on transcript files from `sentinel-state.json`. Most recently modified within 5 seconds = high confidence
- Signal 3 — Title matching: reads session titles from transcript files, compares to active tab label. Exact match = medium confidence, prefix match = low confidence
- Emits `onActiveSessionChanged` event when correlation changes
- Graceful fallback: returns `null` when no correlation found (UI shows "All Sessions")
- Tab detection via `tabGroups.onDidChangeTabs` + `viewType.includes('claudeVSCodePanel')`
- Sidebar panel limitation documented (not detected by `tabGroups`)
- Unit tests for each signal path and fallback logic

**Key Files**:
- `src/correlation/session-correlator.ts` (NEW)
- `src/stores/state-manager.ts` (NEW) — parses `sentinel-state.json`, tracks session list

**Dependencies**: P1-04 (file watchers for transcript monitoring)

---

### P1-08: Multi-Session View Modes

**Description**: Implement the three view modes from Vision §3.1: All Sessions, Active Session (auto-filtered to focused tab), and Pinned Session. Add mode switching UI in the sidebar.

**Acceptance Criteria**:
- **All Sessions**: Live Feed shows all observations across all sessions, with session ID label on each item
- **Active Session** (default): Live Feed auto-filters to whichever Claude Code tab is focused, using `SessionCorrelator`
- **Pinned Session**: User manually pins a session; feed stays filtered regardless of tab focus
- Mode selector in sidebar header (dropdown or toggle buttons)
- Mode persisted via `sentinel.viewMode` setting
- Pin command (`sentinel.focusSession`) available from command palette and context menu on observations
- Session indicator in status bar updates based on mode ("All" / session name / "Pinned: session name")
- Smooth transitions: switching modes doesn't lose scroll position or flash

**Key Files**:
- `src/ui/sidebar/live-feed-provider.ts` — add filtering by view mode
- `src/ui/status-bar.ts` — session indicator updates
- `package.json` — add `sentinel.focusSession` command

**Dependencies**: P1-06 (Live Feed), P1-07 (Session Correlator)

---

### P1-09: Guided Setup Walkthrough

**Description**: Build first-time user onboarding using VS Code's Walkthrough API. Covers what sentinel does, how to read observations, and how to customize rules. Uses `onContext:` completion events tied to file existence checks.

**Acceptance Criteria**:
- Walkthrough registered in `package.json` via `contributes.walkthroughs`
- Steps:
  1. "What is Agent Sentinel?" — explanation + link to docs
  2. "Configure your workspace" — checks for `.volition/sentinel/sentinel.config.json` existence
  3. "See your first observation" — checks for observation JSONL file with content
  4. "Explore the Live Feed" — opens the activity bar panel
  5. "Customize your rules" — links to eval authoring docs
- Each step uses `onContext:` completion event (e.g., `sentinel.configPresent`, `sentinel.firstObservation`)
- Extension sets context keys: `setContext('sentinel.configPresent', true)` when config detected
- Walkthrough auto-opens on first install (one-time via global state flag)
- Content is concise, actionable, not marketing-heavy

**Key Files**:
- `package.json` — `contributes.walkthroughs`
- `src/ui/walkthrough.ts` (NEW) — context key management

**Dependencies**: P1-01 (project setup), P1-04 (file watchers to detect config existence)

---

### P1-10: Health Assessment / Doctor Integration

**Description**: Integrate `sentinel doctor --format json` into the extension for repo health assessment. Map doctor results to the five health states from Vision §2.6. Run on activation, config change, user request, and periodic background check.

**Acceptance Criteria**:
- `HealthAssessor` class spawns `sentinel doctor --format json --project-dir <path>`
- Maps doctor output to health states: Not Initialized (no config dir), Idle (all pass, no sessions), Running (all pass, sessions alive), Degraded (warnings), Error (errors)
- Triggers: activation, config file change, command palette ("Sentinel: Run Health Check"), periodic (every `sentinel.doctor.backgroundInterval` seconds)
- Results pushed to EventBus as `onHealthChanged`
- Status bar color updates from health state changes
- `SentinelCLI` wrapper class per Architecture §7: uses `--format json`, parses structured error responses, maps exit codes to user actions
- Handles binary not found gracefully (shows "Not Initialized" + "Install sentinel" suggestion)
- Timeout handling: 10s for doctor command
- Command palette action with output channel for detailed results

**Key Files**:
- `src/health/health-assessor.ts` (NEW)
- `src/cli/sentinel-cli.ts` (NEW) — `SentinelCLI` wrapper class
- `src/extension.ts` — wire health assessor to activation lifecycle

**Dependencies**: P1-01 (project setup), P1-03 (status bar for health display), P1-04 (config watcher for re-check trigger). Requires Phase 0 P0-4 (doctor command in Go binary).

---

### P1-11: Dual-Publish Setup

**Description**: Configure the build pipeline to produce `.vsix` packages for both VS Code Marketplace (Microsoft) and Open VSX Registry, covering VS Code, Cursor, Windsurf, VSCodium, and Theia. Set up CI publishing.

**Acceptance Criteria**:
- `vsce package` produces a valid `.vsix`
- `ovsx publish` configured in CI for Open VSX
- GitHub Actions workflow: on tag push (`v*`), build `.vsix`, publish to both marketplaces
- Extension ID: `volition.agent-sentinel`
- Version managed via `package.json` version field
- CI verifies the `.vsix` installs cleanly in VS Code (smoke test)
- Pre-release channel configured for beta testing

**Key Files**:
- `.github/workflows/publish.yml` (NEW)
- `package.json` — publisher, version, marketplace metadata

**Dependencies**: P1-01 (project setup)

---

### P1-12: Extension Icon and Branding

**Description**: Create the extension icon for the VS Code marketplace and activity bar. Establish basic visual branding (colors, icon style) consistent with the sentinel concept.

**Acceptance Criteria**:
- Extension icon: 128x128 PNG for marketplace, SVG for activity bar
- Icon clearly communicates "monitoring" or "sentinel" concept
- Works on light and dark backgrounds
- Activity bar icon follows VS Code icon guidelines (monochrome, 24x24)
- Severity icons (CRITICAL/WARNING/INFO) designed as consistent set
- All icons included in `media/icons/` directory
- Icons render correctly in high-contrast mode

**Key Files**:
- `media/icon.png` — marketplace icon
- `media/icons/` — activity bar icon, severity icons (SVG)
- `package.json` — `icon` field

**Dependencies**: P1-01 (project setup)

---

### P1-13: Marketplace README

**Description**: Write the README that appears on the VS Code Marketplace page. This is the primary discovery surface — it must convey value in the first 3 seconds.

**Acceptance Criteria**:
- Hero section: one-sentence value proposition, hero screenshot/GIF showing live observation
- Feature list with screenshots: status bar, live feed, inline prevention, health assessment
- Quick start: 3-step install guide (install extension → configure sentinel → see observations)
- Requirements section: lists `agent-sentinel` CLI as prerequisite
- Configuration reference: table of all `sentinel.*` settings
- Links to: full documentation, architecture overview, contributing guide
- No marketing fluff — developer-to-developer tone
- Badges: marketplace version, installs, license, CI status

**Key Files**:
- `README.md`
- `media/screenshots/` — marketplace screenshots

**Dependencies**: P1-06 (Live Feed must exist to screenshot), P1-03 (status bar must exist to screenshot)

---

### P1-14: Clickable Observation Navigation

**Description**: Make every observation in the Live Feed clickable. Clicking navigates to the Claude Code session where the observation was raised, using `claude-vscode.editor.open(sessionId)`. Ref: Vision §3.3.

**Acceptance Criteria**:
- Clicking an observation tree item in Live Feed opens the corresponding Claude Code session
- Uses `vscode.commands.executeCommand('claude-vscode.editor.open', sessionId)`
- Session ID sourced from the observation's `session_id` field
- Feature-detected at activation: if `claude-vscode.editor.open` command doesn't exist, clicking shows a message instead of failing
- `SessionCorrelator` tab cache updated when navigation opens a new tab
- Works correctly across multi-session scenarios

**Key Files**:
- `src/ui/sidebar/live-feed-provider.ts` — click handler
- `src/correlation/session-correlator.ts` — update tab cache on navigation

**Dependencies**: P1-06 (Live Feed), P1-07 (SessionCorrelator)

---

### Phase 1 Gate

Phase 1 is complete when ALL of the following are true:

1. Extension installs from `.vsix` in VS Code, Cursor, and VSCodium
2. Status bar shows correct health state with color-coding
3. Live Feed displays real-time observations as they are written to JSONL
4. Session correlation correctly identifies the focused Claude Code session
5. Three view modes (All/Active/Pinned) work correctly
6. Walkthrough completes from start to finish on a clean install
7. `sentinel doctor` integration shows health state in status bar
8. Extension activates in <200ms (measured and enforced in CI)
9. Memory usage <50MB with 10 simulated sessions (measured and enforced in CI)
10. Published to VS Code Marketplace and Open VSX
11. Clicking an observation in the Live Feed navigates to the correct Claude Code session
12. All interactive UI elements are keyboard-navigable and severity is never communicated by color alone
13. End-to-end test: sentinel trigger writes observation → extension displays it in Live Feed within 500ms
14. Extension correctly manages separate observation feeds for a multi-root workspace with two workspace folders

**Deliverables**:
- `agent-sentinel-extension` repository on GitHub
- Published extension on VS Code Marketplace and Open VSX
- Extension with: status bar, live feed, session correlation, walkthrough, health assessment, clickable observation navigation
- Planning docs migrated to new repo

---

## Phase 2: Rich Dashboard + Eval Management

**Goal**: Deep observability — charts, trends, and eval rule management that make sentinel intelligence visible and actionable.

**Prerequisites**: Phase 1 complete (core extension with live feed and observation store)

**Expertise required**: TypeScript, VS Code Webview API, CSS/HTML (charting), SVG

**Parallelization**: P2-1, P2-2, and P2-5 can be developed in parallel. P2-3 and P2-4 depend on P2-2. P2-6 depends on P2-1.

---

### P2-1: Session Health Webview

**Description**: Implement the Session Health view in the activity bar panel as a webview with charts: evaluation count, failure rate, timing trends, severity distribution, and observation timeline. Ref: Vision §2.2.2.

**Acceptance Criteria**:
- Webview registered as a view in the activity bar panel
- Displays: evaluation count, failure rate percentage, dynamic rules created count
- Sparklines for evaluation latency trends (last 20 evaluations)
- Severity distribution donut chart (CRITICAL/WARNING/INFO counts)
- Observation timeline mapped to conversation turns
- Data sourced from `ObservationStore` and `StateManager`
- Auto-updates when new observations arrive (via `postMessage`)
- Charts render within 100ms (performance budget from Vision §13)
- Respects VS Code theme colors (`--vscode-*` CSS variables)
- Respects `prefers-reduced-motion` (static charts instead of animated)
- WCAG 2.1 AA compliant (contrast, keyboard nav, screen reader labels)

**Key Files**:
- `src/ui/sidebar/session-health-provider.ts` (NEW)
- `src/ui/webview/session-health/` (NEW) — HTML/CSS/JS for webview
- `src/ui/charts/` (NEW) — lightweight chart rendering (sparklines, donut)

**Dependencies**: P1-05 (ObservationStore), P1-07 (SessionCorrelator for per-session data)

---

### P2-2: Eval Rules Tree View

**Description**: Implement the Eval Rules view showing every active rule across all domains (GEN, SEC, LOCAL) with enable/disable toggles, hit counts, and inspection. Ref: Vision §2.2.3.

**Acceptance Criteria**:
- Tree view registered in the activity bar panel
- Groups rules by domain: GEN, SEC, LOCAL (session-scoped)
- Each rule shows: eval ID, severity, enabled/disabled status, hit count (computed from observations), last-triggered timestamp
- Enable/disable toggle writes to `sentinel.config.json` (sentinel reads config on each invocation)
- Expanding a rule shows: full rule definition, rationale text
- Hit counts computed by counting observations where `eval_id` matches
- Refreshes on config change and new observation events
- Empty state for domains with no rules

**Key Files**:
- `src/ui/sidebar/eval-rules-provider.ts` (NEW)
- `src/stores/config-manager.ts` (NEW) — parses `sentinel.config.json`, provides eval metadata

**Dependencies**: P1-04 (file watchers for config), P1-05 (ObservationStore for hit counts)

---

### P2-3: Dynamic Eval Display

**Description**: Detect and celebrate sentinel-created LOCAL evals. Show them with visual distinction in the Eval Rules view, with creation rationale and "learned this session" highlight. Ref: Vision §7, Architecture §7 Dynamic Eval Lifecycle.

**Acceptance Criteria**:
- `StateManager` diffs `Extractions.LocalEvals` on each state update to detect new dynamic evals
- Celebration notification when a new LOCAL eval is created: informational message with eval ID, description, and [Inspect] button
- LOCAL evals shown in Eval Rules view with sparkle icon / "dynamic" badge
- Each shows: ID, severity, rule text, rationale, creation timestamp, originating session + sentinel
- [Inspect] button scrolls to the rule in the Eval Rules view
- "Edit" button opens rule in a YAML editor webview (read-only preview for Phase 2; full editing in Phase 3)

**Key Files**:
- `src/stores/state-manager.ts` — add LOCAL eval diff detection
- `src/ui/sidebar/eval-rules-provider.ts` — dynamic eval rendering

**Dependencies**: P2-2 (Eval Rules view must exist)

---

### P2-4: Dynamic Eval Promotion Workflow

**Description**: Implement the one-click promotion of LOCAL evals to permanent rules. Copies a dynamic eval from in-memory state to a YAML file in `.volition/sentinel/evals/<domain>/`. Ref: Vision §7, Architecture §7.

**Acceptance Criteria**:
- "Promote" action on each LOCAL eval in the Eval Rules view
- Promotion writes YAML file to `.volition/sentinel/evals/<domain>/<eval-id>.yaml`
- YAML format matches the existing eval rule schema
- Confirmation dialog before promotion ("This will make SEC-LOCAL-001 a permanent rule")
- Success notification with file path
- Eval Rules view refreshes to show the promoted rule under the permanent domain section
- Promoted eval ID is de-duplicated (sentinel's `valid_eval_ids` already includes it)

**Key Files**:
- `src/ui/sidebar/eval-rules-provider.ts` — promote action
- `src/evals/eval-promotion.ts` (NEW) — `promoteLocalEval` logic

**Dependencies**: P2-3 (dynamic eval display must exist)

---

### P2-5: Observation Cards Webview

**Description**: Render CRITICAL and WARNING observations as rich webview cards in the editor area. Cards include severity badge, eval ID, analysis body, timestamp, and sentinel provenance. Ref: Vision §2.3.

**Acceptance Criteria**:
- `ObservationCardPanel` creates a `WebviewPanel` in the editor area
- Card layout: severity badge (color-coded), eval ID as headline, one-liner, analysis body, timestamp, sentinel name
- "PREVENTED" vs "OBSERVED" badge for `hook_type: "pretooluse"` vs `stop`
- Tier provenance: "(Tier 0)", "(Tier 1)", "(Tier 2)" badge
- Shared `ObservationRenderer` class used by both sidebar and editor cards (Architecture §7 dual-registration)
- Cards feel like a serious security tool output — professional styling
- WCAG 2.1 AA: color contrast, keyboard navigable, screen reader support
- Uses `--vscode-*` CSS variables for theme compatibility

**Key Files**:
- `src/ui/webview/observation-card-panel.ts` (NEW)
- `src/ui/webview/observation-renderer.ts` (NEW) — shared rendering logic
- `src/ui/webview/observation-card/` (NEW) — HTML/CSS

**Dependencies**: P1-05 (ObservationStore)

---

### P2-6: Historical Observation Browsing

**Description**: Support scrolling back through session history in the Live Feed. Implement lazy loading from disk for observations beyond the in-memory cache boundary.

**Acceptance Criteria**:
- Live Feed shows most recent observations first (newest at top)
- Scrolling down loads older observations automatically (infinite scroll pattern)
- Beyond the in-memory cache (1000 per session), observations are read from disk on demand
- Loading indicator while reading from disk
- "Beginning of session" message when all observations are loaded
- Performance: scrolling remains smooth with 1000+ observations (virtualized rendering if needed)

**Key Files**:
- `src/stores/observation-store.ts` — add lazy loading from disk
- `src/ui/sidebar/live-feed-provider.ts` — infinite scroll support

**Dependencies**: P1-05 (ObservationStore), P1-06 (Live Feed)

---

### Phase 2 Gate

Phase 2 is complete when ALL of the following are true:

1. Session Health webview shows charts and metrics for the active session
2. Eval Rules view displays all rules with hit counts and enable/disable toggles
3. Dynamic LOCAL evals are detected, celebrated, and displayed distinctly
4. LOCAL eval promotion writes correct YAML and refreshes the view
5. Observation cards render CRITICAL/WARNING observations as rich webviews
6. Historical browsing works for sessions with 1000+ observations
7. Webview components pass automated contrast check (WCAG 2.1 AA 4.5:1) and keyboard navigation test
8. Webview charts render within 100ms (measured)

**Deliverables**:
- Session Health webview with charts
- Eval Rules management panel
- Dynamic eval celebration + promotion workflow
- Observation card webview

---

## Phase 3: Sentinel Interaction

**Goal**: The sentinel becomes conversable — users can steer it, teach it, and create evals through natural language interaction.

**Prerequisites**: Phase 1 complete. Phase 2's eval display features (P2-2, P2-3) are recommended but not strictly required.

**Expertise required**: TypeScript, VS Code Webview API

**Parallelization**: P3-1 is independent. P3-2 and P3-3 can be developed in parallel. P3-4 depends on P3-1. P3-5 depends on P3-4.

---

### P3-1: "Open Sentinel Chat" Command

**Description**: Implement the command that opens the sentinel's sidechain session as an editor tab. Reads the sentinel session ID from `sentinel-state.json` and invokes `claude-vscode.editor.open`. Ref: Vision §2.4, Architecture §7.

**Acceptance Criteria**:
- Command `sentinel.openSentinelChat` registered in command palette
- Reads sentinel session ID from `sentinel-state.json` (sidechain session)
- Invokes `vscode.commands.executeCommand('claude-vscode.editor.open', sentinelSessionId)`
- If multiple sentinels (GEN, SEC), shows quick pick to choose which sentinel's chat to open
- Handles missing sentinel session gracefully (message: "No active sentinel session")
- Feature-detected: disabled if Claude Code extension not installed
- Button in activity bar panel header for quick access

**Key Files**:
- `src/commands/open-sentinel-chat.ts` (NEW)
- `src/stores/state-manager.ts` — expose sentinel session IDs
- `package.json` — register command

**Dependencies**: P1-07 (StateManager for session IDs). Uses Claude Code adapter via HarnessAdapterRegistry.

---

### P3-2: Rapid Eval Creation Workflow

**Description**: Implement the natural language → YAML eval creation flow. User describes behavior, LLM generates a YAML eval rule, user reviews and saves. Ref: Vision §6.

**Acceptance Criteria**:
- "New Eval" button in sidebar (Eval Rules view header) and command palette
- Input panel: text area for natural language description
- Extension sends description to LLM via the harness adapter (Claude Code CLI or configured endpoint)
- Generated YAML displayed in a preview webview with syntax highlighting
- User can edit the YAML before saving
- "Save" writes to `.volition/sentinel/evals/<domain>/<generated-id>.yaml`
- Sentinel picks up the new eval on next trigger (zero restart)
- Cancel/discard option
- Error handling: LLM unavailable → clear message with suggestion
- Generated eval includes auto-populated fields: `id`, `severity`, `domain`, `created_at`

**Key Files**:
- `src/evals/eval-creator.ts` (NEW) — LLM interaction, YAML generation
- `src/ui/webview/eval-creation/` (NEW) — webview for creation flow
- `src/cli/sentinel-cli.ts` — LLM invocation via harness

**Dependencies**: P1-10 (SentinelCLI wrapper)

---

### P3-3: Eval Preview and Editing Panel

**Description**: Full YAML editor webview for inspecting and editing eval rules. Supports both existing permanent evals and dynamic LOCAL evals. Includes syntax highlighting, validation, and save.

**Acceptance Criteria**:
- Opens from Eval Rules view "Edit" action or from eval creation flow
- YAML syntax highlighting in the webview
- Validation against eval schema (highlights errors inline)
- Save writes to the eval file on disk
- For LOCAL evals: editing modifies the in-memory state (changes take effect on next trigger)
- Read-only mode for built-in eval rules (with "Duplicate" action to create editable copy)
- Keyboard shortcut: Cmd/Ctrl+S to save

**Key Files**:
- `src/ui/webview/eval-editor/` (NEW) — YAML editor webview
- `src/evals/eval-validator.ts` (NEW) — schema validation

**Dependencies**: P2-2 (Eval Rules view for launch point)

---

### P3-4: Sentinel Conversation Panel

**Description**: Build a dedicated **dashboard wrapper webview** for sentinel interaction. This is NOT a replacement for the Claude Code chat tab opened by P3-1 — it is a context-rich wrapper that sits in the sidebar and provides monitoring state alongside a link to the full sidechain conversation. P3-1 opens the raw sidechain chat; P3-4 wraps that with observability context. In Phase 4+, this panel also serves as the unified conversation entry point when the user's harness doesn't support `editor.open`-style session navigation.

**Acceptance Criteria**:
- Sidebar webview panel shows: current sentinel status, active sessions, recent observations summary
- "Open Full Conversation" button that invokes P3-1's `sentinel.openSentinelChat` command to open the sidechain in an editor tab
- Quick input area for short steering messages (delegated to sidechain via harness adapter; responses viewed in the full chat tab)
- Context section: shows what the sentinel is currently monitoring (active evals, recent observations, last observation timestamp)
- Does NOT embed or duplicate the full chat experience — it is a dashboard + quick-action surface
- If harness adapter lacks `openSession()` support (Phase 4 non-Claude-Code harnesses), the panel displays a message explaining the limitation and offers the quick input as the primary interaction mode

**Key Files**:
- `src/ui/webview/sentinel-panel/` (NEW)
- `src/commands/sentinel-chat.ts` (NEW)

**Dependencies**: P3-1 (sentinel chat opening)

---

### P3-5: Mid-Session Sentinel Steering

**Description**: Enable users to steer the sentinel during an active session with natural language instructions like "watch for X" or "ignore Y for this session." Ref: Vision §2.4.

**Acceptance Criteria**:
- Quick input box: "Tell Sentinel..." accessible from command palette and sidebar
- Common actions as quick picks: "Watch for...", "Ignore...", "Create eval for..."
- Messages injected into the sentinel's sidechain session via harness adapter
- Sentinel responds by adjusting monitoring focus or creating dynamic evals
- Feedback: notification confirming the sentinel received the instruction
- History of steering instructions visible in the sentinel conversation panel

**Key Files**:
- `src/commands/steer-sentinel.ts` (NEW)
- `src/ui/webview/sentinel-panel/` — steering UI integration

**Dependencies**: P3-4 (sentinel conversation panel)

---

### Phase 3 Gate

Phase 3 is complete when ALL of the following are true:

1. Users can open the sentinel's sidechain chat from the extension
2. Natural language eval creation produces valid YAML eval rules
3. Eval editing panel supports viewing, editing, and saving rules
4. Sentinel conversation panel provides focused interaction experience
5. Mid-session steering sends instructions and sentinel responds

**Deliverables**:
- Sentinel chat integration
- Rapid eval creation workflow
- Eval editor webview
- Sentinel conversation panel
- Mid-session steering commands

---

## Phase 4: Cross-Harness Support

**Goal**: Sentinel works with Codex, Copilot, and Gemini CLI — not just Claude Code.

**Prerequisites**: Phase 1 complete. Phase 3 recommended (sentinel conversation must work with harness switching).

**Expertise required**: TypeScript, familiarity with each harness's extension/CLI API

**Parallelization**: P4-1 and P4-2 are sequential (interface then refactor). P4-R must complete before P4-3/P4-4/P4-5 (research informs implementation). P4-3, P4-4, P4-5 can be developed in parallel after P4-2 + P4-R. P4-6 depends on at least two adapters existing. P4-7 and P4-8 depend on all adapters.

---

### P4-R: Harness Extensibility Research

**Description**: Research spike to evaluate the extensibility model of each target harness before committing to adapter implementations. This is a time-boxed investigation (1–2 weeks) that produces a feasibility report, not code.

**Acceptance Criteria**:
- For each target harness (Codex, Copilot, Gemini CLI), document:
  - **Hook/event model**: Does the harness support PreToolUse/Stop hooks or equivalent? What events can extensions/plugins subscribe to?
  - **Session management**: How are sessions identified, started, stopped? Is there a session state file or API?
  - **Transcript format**: Where are conversation transcripts stored? What is the file format? Is it stable/documented?
  - **Available extension APIs**: What commands, events, or APIs does the harness expose to other VS Code extensions? Is there a public extension API?
  - **Feasibility assessment**: Rate each harness as Full Support (hooks + sessions + transcripts), Partial Support (some features possible), or Watch Only (can detect but not interact). Note blocking unknowns.
- Findings compiled into `docs/harness-research.md` with per-harness sections
- Recommendations for which adapters to build first (based on feasibility and user demand)
- Identified gaps that may require upstream feature requests to harness maintainers

**Key Files**:
- `docs/harness-research.md` (NEW) — research findings

**Dependencies**: P4-2 (Claude Code adapter extraction validates what a "full" adapter looks like)

---

### P4-1: Harness Adapter Interface Finalization

**Description**: Finalize the `HarnessAdapter` TypeScript interface from Architecture §8. Add any methods discovered necessary during Phase 1–3 development. Define the `HarnessAdapterRegistry` registration and discovery pattern.

**Acceptance Criteria**:
- `HarnessAdapter` interface matches Architecture §8 with any Phase 1–3 learnings incorporated
- `HarnessAdapterRegistry` class with `register`, `detectActiveAdapter`, `getAdapter` methods
- Interface documented with JSDoc for each method
- Type definitions exported for potential third-party adapter development
- Unit tests for registry logic (registration, detection, fallback)

**Key Files**:
- `src/harness/harness-adapter.ts` (NEW or refactored from existing)
- `src/harness/harness-registry.ts` (NEW)

**Dependencies**: Phase 1 complete

---

### P4-2: Claude Code Adapter Extraction

**Description**: Extract all Claude Code-specific logic currently hardcoded in the extension into the `ClaudeCodeAdapter` class implementing `HarnessAdapter`. This is a refactoring task — no new functionality.

**Acceptance Criteria**:
- All Claude Code-specific logic in a single `ClaudeCodeAdapter` class
- No direct references to `claude-vscode.*` commands outside the adapter
- Session detection, chat opening, hook registration all delegated through adapter
- Existing functionality unchanged (all tests pass)
- Extension core uses only `HarnessAdapter` interface methods
- `HarnessAdapterRegistry` initialized with `ClaudeCodeAdapter` at activation

**Key Files**:
- `src/harness/adapters/claude-code-adapter.ts` (NEW)
- `src/correlation/session-correlator.ts` — refactor to use adapter
- `src/commands/*.ts` — refactor to use adapter

**Dependencies**: P4-1 (interface finalized)

---

### P4-3: Codex Adapter

**Description**: Implement `HarnessAdapter` for OpenAI Codex CLI. Research Codex's extensibility model (hooks, session management, transcript format) and implement accordingly.

**Acceptance Criteria**:
- `CodexAdapter` implements `HarnessAdapter`
- `isAvailable()` detects Codex extension/CLI installation
- `detectSessions()` reads Codex session state (format TBD based on research)
- `openSession()` navigates to Codex session (API TBD)
- `supportedHooks()` returns available hook types (may be limited)
- If Codex lacks hooks: fallback to file-watching for evaluation triggers documented
- Integration tested against a real Codex session
- Known limitations documented

**Key Files**:
- `src/harness/adapters/codex-adapter.ts` (NEW)

**Dependencies**: P4-2 (adapter extraction), P4-R (research findings for Codex feasibility)

---

### P4-4: Copilot Adapter

**Description**: Implement `HarnessAdapter` for GitHub Copilot. Research Copilot's extensibility model and implement accordingly.

**Acceptance Criteria**:
- `CopilotAdapter` implements `HarnessAdapter`
- Same requirements as P4-3 adapted to Copilot's architecture
- Copilot chat / workspace agent detection
- Known limitations documented (Copilot may have very different session model)

**Key Files**:
- `src/harness/adapters/copilot-adapter.ts` (NEW)

**Dependencies**: P4-2, P4-R (research findings for Copilot feasibility)

---

### P4-5: Gemini CLI Adapter

**Description**: Implement `HarnessAdapter` for Google Gemini CLI. Research Gemini CLI's extensibility model and implement accordingly.

**Acceptance Criteria**:
- `GeminiCLIAdapter` implements `HarnessAdapter`
- Same requirements as P4-3 adapted to Gemini CLI's architecture
- Known limitations documented

**Key Files**:
- `src/harness/adapters/gemini-cli-adapter.ts` (NEW)

**Dependencies**: P4-2, P4-R (research findings for Gemini CLI feasibility)

---

### P4-6: Three-Tier Harness Configuration UI

**Description**: Implement the settings UI for the three-tier harness configuration model from Architecture §8. Shows resolved configuration with provenance indicators (which tier each setting came from). Bulk override fields shown as locked.

**Acceptance Criteria**:
- Extension settings show harness configuration options
- Provenance indicators: "*(base)*", "*(claude-code override)*", "*(bulk override — locked)*"
- Bulk override fields are non-editable with explanation
- Settings discoverable in VS Code settings UI (not buried in JSON)
- Configuration changes write to `sentinel.config.json` (respecting the tier model)
- Quick pick for selecting harness for new sentinel sessions

**Key Files**:
- `package.json` — `contributes.configuration` for harness settings
- `src/ui/settings/harness-config.ts` (NEW)
- `src/stores/config-manager.ts` — add tier resolution logic (mirrors Go `ResolveConfig`)

**Dependencies**: P4-2 (at least one adapter), P4-3 or P4-4 (need multiple adapters to demonstrate)

---

### P4-7: Harness Detection for Sentinel Conversation

**Description**: When multiple harnesses are configured, the "Open Sentinel Chat" command opens the conversation in the correct harness's editor. Auto-detect which harness the sentinel is using from config.

**Acceptance Criteria**:
- `openSentinelChat` reads harness from sentinel config
- Opens conversation using the correct adapter's `openSentinelChat` method
- If harness is ambiguous, shows quick pick for user to choose
- Works with all implemented adapters

**Key Files**:
- `src/commands/open-sentinel-chat.ts` — multi-harness support

**Dependencies**: P4-2, P3-1 (sentinel chat command)

---

### P4-8: Cross-Harness Testing

**Description**: Systematic testing of sentinel functionality across all implemented harness adapters. Verify that observations, session correlation, and sentinel interaction work for each harness.

**Acceptance Criteria**:
- Test matrix: each adapter × each feature (observations, correlation, chat, eval creation)
- Known limitations per harness documented in README
- Adapter-specific edge cases handled gracefully
- Performance characteristics per harness documented (some may be slower)
- Regression test suite that can be run per adapter

**Key Files**:
- `src/harness/adapters/*.test.ts` — per-adapter test suites
- `docs/harness-support.md` (NEW) — compatibility matrix

**Dependencies**: P4-3, P4-4, P4-5 (all adapters)

---

### Phase 4 Gate

Phase 4 is complete when ALL of the following are true:

1. At least two non-Claude-Code adapters implemented and tested
2. Claude Code-specific logic fully extracted to adapter
3. Sentinel observations display correctly regardless of which harness triggered them
4. Three-tier configuration model works in the settings UI
5. Sentinel conversation opens in the correct harness
6. Harness compatibility matrix documented

**Deliverables**:
- Harness adapter interface and registry
- Claude Code, Codex, Copilot, Gemini CLI adapters
- Three-tier configuration UI
- Harness compatibility documentation

---

## Phase 5: Extension API + Commercial Foundation

> **DEFERRED**: Phase 5 is deferred until the free extension is validated through internal use. Phase 6 (Polish, Quality, Community) is being executed first to harden the extension. The commercial extension infrastructure will be built when the product is ready for a commercial layer. Decision made 2026-03-25.

**Goal**: agent-sentinel-extension becomes a platform that volition-extension builds on — with a stable, documented API surface.

**Prerequisites**: Phase 1–3 complete (API surface informed by real usage). Phase 4 recommended but not required.

**Expertise required**: TypeScript (API design), extension architecture

**Parallelization**: P5-1 and P5-2 are sequential. P5-3 and P5-4 can be parallel after P5-2. P5-5 depends on P5-3 + P5-4. P5-6 depends on P5-5.

---

### P5-1: Extension API Surface Finalization

**Description**: Finalize the `SentinelExtensionAPI` interface from Architecture §9. Shape the API based on Phase 1–4 experience. Define which events, accessors, actions, and extension points are exposed.

**Acceptance Criteria**:
- `SentinelExtensionAPI` interface finalized with all categories: Events, Data Accessors, Actions, Extension Points
- API matches Architecture §9 with Phase 1–4 learnings incorporated
- All public types exported with comprehensive JSDoc documentation
- API stability categorized per Architecture §9: Stable (events, accessors, actions) vs Experimental (extension points)
- API version set to 1
- `extension.ts` `activate()` returns the API object

**Key Files**:
- `src/api/extension-api.ts` (NEW) — API implementation
- `src/api/types.ts` (NEW) — public type definitions
- `src/extension.ts` — return API from activate()

**Dependencies**: Phases 1–3 complete (API shaped by experience)

---

### P5-2: API Stability Guarantees and Versioning

**Description**: Document API versioning strategy, stability guarantees, and the consumer pattern for volition-extension. Publish an npm package with type definitions.

**Acceptance Criteria**:
- Versioning documented: single integer version, incremented on breaking changes
- Stability tiers documented: Stable (additive only), Experimental (may change between major versions)
- Consumer pattern documented with code examples (as in Architecture §9)
- `@volition/sentinel-extension-api` npm package with type definitions (`.d.ts` only)
- Changelog template for API changes
- Migration guide template for breaking changes

**Key Files**:
- `docs/api-reference.md` (NEW)
- `packages/api-types/` (NEW) — npm package with type definitions

**Dependencies**: P5-1

---

### P5-3: volition-extension Repository Creation

**Description**: Create the commercial `volition-extension` repository with basic scaffold. This is the foundation for enterprise features.

**Acceptance Criteria**:
- Repository created (private, commercial license)
- `package.json` with `extensionDependencies: ["volition.agent-sentinel"]`
- TypeScript project setup matching agent-sentinel-extension patterns
- `extension.ts` that activates, acquires the sentinel API, and logs API version
- CI pipeline for build and test
- Basic feature gating infrastructure (license check stub)

**Key Files**:
- New repository: `volition-extension/`
- `package.json`, `tsconfig.json`, `src/extension.ts`

**Dependencies**: P5-1 (API exists to consume)

---

### P5-4: Commercial Extension Scaffold

**Description**: Set up the commercial extension infrastructure: feature gating, license management stubs, and the basic structure for enterprise views.

**Acceptance Criteria**:
- Feature gate system: checks for valid license before enabling commercial features
- License check is a stub for now (always returns true in dev, designed for real auth later)
- Graceful degradation: if license invalid, commercial views show upgrade prompt
- Settings contribution for license key / authentication
- Extension activates cleanly when agent-sentinel extension is present
- Extension shows helpful error when agent-sentinel is missing

**Key Files (in volition-extension repo)**:
- `src/licensing/feature-gate.ts` (NEW)
- `src/extension.ts` — API acquisition and feature gating

**Dependencies**: P5-3

---

### P5-5: Extension Dependency Wiring

**Description**: Verify and test the full dependency chain: agent-sentinel-extension exports API → volition-extension consumes API, subscribes to events, registers sidebar sections.

**Acceptance Criteria**:
- volition-extension successfully acquires API from agent-sentinel-extension
- Event subscriptions work: `onObservationReceived`, `onHealthChanged`, etc.
- Data accessors return correct data: `getObservations()`, `getSessions()`, etc.
- Actions execute correctly: `startSentinel()`, `runDoctor()`, etc.
- `registerSidebarSection()` adds a view to the sentinel activity bar panel
- Version check works: consumer rejects incompatible API versions
- Integration test: both extensions installed → verify full data flow

**Key Files (both repos)**:
- `src/api/extension-api.ts` — API provider side
- `volition-extension/src/extension.ts` — API consumer side

**Dependencies**: P5-3, P5-4

---

### P5-6: Sidebar Section Registration

**Description**: Implement `registerSidebarSection()` in the extension API so volition-extension can add its own views (fleet dashboard, policy management, etc.) to the sentinel activity bar panel.

**Acceptance Criteria**:
- `registerSidebarSection(section: SidebarSection): vscode.Disposable` works
- Commercial extension can add a "Fleet Dashboard" section to the sidebar
- Section registration is dynamic (sections added/removed at runtime)
- Sections render correctly within the existing panel layout
- Disposing the returned `Disposable` removes the section
- Maximum of 5 registered sections (prevents UI bloat)

**Key Files**:
- `src/api/extension-api.ts` — `registerSidebarSection` implementation
- `src/ui/sidebar/sidebar-provider.ts` — dynamic section rendering

**Dependencies**: P5-5 (dependency wiring verified)

---

### Phase 5 Gate

Phase 5 is complete when ALL of the following are true:

1. Extension API is finalized, documented, and versioned
2. API type definitions published as npm package
3. volition-extension consumes the API successfully
4. Event subscriptions, data accessors, and actions work across the extension boundary
5. Sidebar section registration works for commercial views
6. Feature gating architecture supports license-based access control

**Deliverables**:
- Finalized `SentinelExtensionAPI` with documentation
- `@volition/sentinel-extension-api` npm package
- `volition-extension` repository with commercial scaffold
- Extension dependency wiring verified

---

## Phase 6: Polish, Marketplace, Community

> **EXECUTION ORDER CHANGE**: Phase 6 is being executed before Phase 5. The free extension needs hardening (security audit, performance profiling, accessibility audit, documentation) before building commercial infrastructure. Phase 5 is deferred.

**Goal**: Make agent-sentinel-extension one of the most popular GitHub projects in its category — through documentation, community infrastructure, and marketplace optimization.

**Prerequisites**: Phases 1–3 complete (core product polished). ~~Phase 5 recommended.~~ Phase 5 deferred; Phase 6 proceeds independently.

**Expertise required**: Technical writing, design (screenshots/GIFs), accessibility audit, performance engineering

**Parallelization**: Most P6 tasks are independent and can be done in parallel.

---

### P6-1: Documentation Site

**Description**: Build a documentation site covering setup, configuration, eval authoring, API reference, and architecture overview. Can be a GitHub Pages site with a static site generator.

**Acceptance Criteria**:
- Getting started guide: install → configure → first observation in <5 minutes
- Configuration reference: all settings, config file format, pattern authoring
- Eval authoring guide: YAML format, examples, testing evals
- API reference: generated from JSDoc, with usage examples
- Architecture overview: simplified version of architecture.md for contributors
- Troubleshooting / FAQ section
- Search functionality
- Mobile-friendly responsive design
- Deployed on a public URL (GitHub Pages or similar)

**Key Files**:
- `docs-site/` (NEW) — static site source

**Dependencies**: P5-2 (API reference content)

---

### P6-2: Community Eval Sharing Infrastructure

**Description**: Build the infrastructure for community eval sharing. At minimum: import/export YAML evals, schema validation on import, and a README/guide for sharing evals via Git. Ref: Vision §7.1.

**Acceptance Criteria**:
- "Export Eval" command: exports selected eval as a standalone YAML file
- "Import Eval" command: opens file picker, validates against schema, copies to evals directory
- Schema validation on import: rejects invalid evals with helpful error messages
- Export includes: eval rule + metadata (author, created date, description)
- Import de-duplicates by eval ID (warns on conflict)
- Contributing guide for community eval authors (YAML format, testing, naming conventions)
- Example eval packs: "web-security-basics", "code-quality" starter sets

**Key Files**:
- `src/evals/eval-import-export.ts` (NEW)
- `src/evals/eval-validator.ts` — schema validation
- `docs/eval-authoring-guide.md` (NEW)

**Dependencies**: P2-2 (Eval Rules view for UI integration)

---

### P6-3: Marketplace Optimization

**Description**: Optimize the VS Code Marketplace listing for discovery and conversion. High-quality screenshots, demo GIFs, compelling description, and correct category/tag selection.

**Acceptance Criteria**:
- 5+ high-quality screenshots showing key features (status bar, live feed, observation cards, eval rules, health assessment)
- Demo GIF (15–30 seconds) showing real-time observation appearing
- Marketplace description optimized: first sentence is the hook, features are scannable
- Categories: "Linters", "Other" (or most appropriate available)
- Tags: agent, AI, safety, monitoring, sentinel, security
- Q&A and ratings monitoring process documented
- Changelog maintained in extension for marketplace display

**Key Files**:
- `README.md` — marketplace content
- `media/screenshots/` — marketplace screenshots
- `media/demo.gif` — demo animation
- `CHANGELOG.md`

**Dependencies**: P1-13 (initial README), all visible features implemented

---

### P6-4: Contribution Guide

**Description**: Write a comprehensive contributing guide for the project, focused on community eval authors and extension contributors.

**Acceptance Criteria**:
- `CONTRIBUTING.md` with: development setup, project structure, coding standards, PR process
- Eval authoring section: YAML format reference, testing evals locally, submitting evals
- Extension development section: building, testing, debugging
- Code of conduct
- Issue and PR templates
- "Good first issue" labels on starter tasks

**Key Files**:
- `CONTRIBUTING.md` (NEW)
- `.github/ISSUE_TEMPLATE/` (NEW)
- `.github/PULL_REQUEST_TEMPLATE.md` (NEW)

**Dependencies**: None (can be done anytime)

---

### P6-5: Performance Profiling and Optimization

**Description**: Profile the extension under realistic load (10+ sessions, burst observations) and optimize to meet performance budgets from Vision §13. Establish CI-enforced performance budgets.

**Acceptance Criteria**:
- Activation time measured and optimized to <200ms
- Memory profiled with 10 concurrent sessions: must stay under 50MB
- File watcher event processing benchmarked: observation display within 200ms of file write
- Webview rendering benchmarked: charts render within 100ms
- CPU during idle: near-zero (measured)
- Performance regression tests added to CI
- Bottlenecks identified and resolved (documented)
- Benchmark results documented for baseline

**Key Files**:
- `benchmarks/` (NEW) — performance test scripts
- `.github/workflows/ci.yml` — add performance checks

**Dependencies**: Phase 1 complete (extension must exist to profile)

---

### P6-6: Accessibility Audit

**Description**: Comprehensive WCAG 2.1 AA audit of all extension UI components. Fix any issues found. Ref: Vision §12.

**Acceptance Criteria**:
- Audit checklist covering: color contrast (4.5:1 normal, 3:1 large), keyboard navigation, screen reader support, high-contrast themes, reduced motion
- All webview components audited: observation cards, session health, eval editor, sentinel panel
- Tree views audited: ARIA roles, focus order, keyboard operability
- Status bar audited: ARIA labels for screen readers
- Live Feed: ARIA live regions for new observation announcements
- All severity indicators use icon + label (not color alone)
- High-contrast theme testing: VS Code High Contrast and High Contrast Light
- `prefers-reduced-motion` respected for all animations
- Audit results documented with before/after screenshots
- All critical and major issues resolved

**Key Files**:
- All UI component files
- `docs/accessibility-audit.md` (NEW) — audit results

**Dependencies**: Phase 2 complete (webviews must exist to audit)

---

### P6-7: Security Audit

**Description**: Security audit of the extension itself — ensure no data exfiltration, secure webview practices, safe CLI invocation, and no accidental telemetry. Ref: Vision §14.

**Acceptance Criteria**:
- Verify: zero network requests from the extension (no phone-home)
- Webview security: `Content-Security-Policy` headers on all webviews, no inline scripts
- CLI invocation: no shell injection vectors in command construction
- File access: extension only reads files within workspace and `~/.claude/`
- No secrets logged to output channel or console
- Dependencies audited: `npm audit` clean, minimal dependency tree
- Extension permissions reviewed: only requested permissions are necessary
- Findings documented and all issues resolved

**Key Files**:
- All source files (audit scope)
- `docs/security-audit.md` (NEW) — audit results

**Dependencies**: Phase 1 complete

---

### Phase 6 Gate

Phase 6 is complete when ALL of the following are true:

1. Documentation site is live and comprehensive
2. Eval sharing (import/export) works end-to-end
3. Marketplace listing has professional screenshots, GIF, and optimized description
4. Contributing guide enables external contributors
5. Performance budgets met and enforced in CI
6. WCAG 2.1 AA audit passed
7. Security audit passed with no outstanding issues

**Deliverables**:
- Documentation site (public URL)
- Community eval sharing infrastructure
- Optimized marketplace listing
- Contributing guide and templates
- Performance benchmark suite
- Accessibility audit report
- Security audit report

---

## Future Work (Deferred)

The following capabilities are **designed in the architecture document** but intentionally not scheduled in this phase plan. They will be planned when the VS Code + forks experience is proven and stable.

### JSON-RPC over stdio Cross-IDE Protocol

Architecture §10 defines a JSON-RPC 2.0 over stdio protocol for communication between the Go sentinel service and IDE clients. This protocol enables real-time event push (lower latency than file watching) and standardized command execution. It is designed now to ensure the file-watching architecture doesn't preclude it, but implementation is deferred because:

- The file-watching approach (Phases 1–3) is sufficient for VS Code and its forks
- The protocol's primary value is enabling non-VS-Code clients, which are not yet prioritized
- Building it prematurely would add maintenance burden without users

**Trigger to schedule**: When Phase 4 harness research (P4-R) identifies a harness or IDE where file watching is insufficient, or when user demand for JetBrains/Neovim support reaches critical mass.

### Non-VS-Code Thin Clients

The architecture supports thin clients for **JetBrains IDEs**, **Neovim**, and **Web-based editors** via the JSON-RPC protocol. These clients would consume the same sentinel data through the stdio protocol rather than file watchers. They are deferred because:

- VS Code (including Cursor, Windsurf, VSCodium, Theia) covers the vast majority of AI coding agent users today
- Each thin client requires platform-specific expertise (Kotlin for JetBrains, Lua for Neovim)
- The JSON-RPC protocol must be implemented first (see above)

**Trigger to schedule**: After JSON-RPC protocol is implemented and at least one non-VS-Code IDE reaches >10% of the target user base.

---

*This document is the execution roadmap for agent-sentinel-extension. It turns the [Vision](vision-and-requirements.md) and [Architecture](architecture.md) into actionable work with concrete acceptance criteria and explicit dependencies. Each task is designed to be picked up by a developer unfamiliar with the surrounding context.*
