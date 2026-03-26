# Architecture Overview

Agent Sentinel is a **core Go CLI binary** paired with a **thin VS Code TypeScript client**. The extension reads sentinel's on-disk data structures via file watchers — it never invokes the evaluation pipeline directly.

## System Components

```
┌──────────────────────────────────────────────────────────┐
│  VS Code Extension (TypeScript)                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Extension Host Process                              │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │  │
│  │  │ File     │ │ Session   │ │ Harness Adapter    │  │  │
│  │  │ Watchers │ │ Correlator│ │ Layer              │  │  │
│  │  └────┬─────┘ └────┬──────┘ └────────┬───────────┘  │  │
│  │       │             │                 │              │  │
│  │  ┌────▼─────────────▼─────────────────▼───────────┐  │  │
│  │  │  State Manager (in-memory model of disk state) │  │  │
│  │  └────┬───────────────────────────────┬───────────┘  │  │
│  │       │                               │              │  │
│  │  ┌────▼──────────┐  ┌────────────────▼────────────┐  │  │
│  │  │ UI Components │  │ Extension API              │  │  │
│  │  │ - Status Bar  │  │ - Events                   │  │  │
│  │  │ - Sidebar     │  │ - Accessors                │  │  │
│  │  │ - Webviews    │  │ - Actions                  │  │  │
│  │  └───────────────┘  └────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────┬─────────────────────────────┘
              Reads files      │  Spawns CLI commands
              (FileSystemWatcher) │  (sentinel start/stop/doctor)
                                │
┌───────────────────────────────▼─────────────────────────────┐
│  Filesystem (.volition/sentinel/)                            │
│  sentinel-state.json    sentinel-observations.jsonl          │
│  sentinel.config.json   sentinel-trigger.log                 │
│  patterns/              evals/                               │
└───────────────────────────────┬─────────────────────────────┘
              Written by         │
                                │
┌───────────────────────────────▼─────────────────────────────┐
│  Sentinel Core (Go binary)                                   │
│  trigger.go    — Stop hook: reads transcript, runs evals,   │
│                  appends observations, injects to transcript │
│  pretrigger    — PreToolUse: Tier 0 pattern matching (<10ms)│
│  doctor        — Health checks (JSON or human output)        │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Observation Pipeline

1. AI agent performs a tool call (file write, shell command, etc.)
2. The harness fires a hook (PreToolUse or Stop)
3. Sentinel CLI receives the hook input, runs evaluations
4. CLI writes observations to `sentinel-observations.jsonl`
5. VS Code file watcher detects the change
6. State manager parses new observations and updates in-memory state
7. UI components re-render (sidebar, status bar, webviews)

### Tier 0 (Inline Prevention)

The PreToolUse hook path is latency-critical — it runs synchronously before the tool executes:

1. Harness invokes the pretrigger command with tool call on stdin
2. Sentinel matches against Tier 0 patterns (YAML pattern files)
3. If a pattern matches: writes observation, outputs `decision:block` to stdout
4. If no match: outputs nothing (tool proceeds)

Target latency: under 10ms.

### Tier 1/2 (Post-hoc Evaluation)

The Stop hook path runs after the agent's turn completes:

1. Harness fires the Stop event with session context
2. Sentinel reads the transcript delta since the last evaluation
3. Tier 1: local LLM evaluates against enabled eval rules
4. Tier 2: cloud LLM evaluates for higher-fidelity assessment
5. Observations are appended to the JSONL file and injected into the transcript

## Extension Components

### File Watchers (`src/watchers/`)
Monitor `.volition/sentinel/` for changes to observations, state, and config files. Debounced to handle rapid writes.

### Session Correlator (`src/correlation/`)
Maps observations to agent sessions. Uses heuristics (tab metadata, transcript activity, timing) since session IDs aren't always available from harnesses.

### Harness Adapter Layer (`src/adapters/`)
Abstracts harness-specific behavior behind a common interface. Each adapter knows how to:
- Detect whether its harness is installed
- Register hooks in the harness's config format
- Map harness-specific session identifiers
- Open sessions in the appropriate UI

Four adapters: `ClaudeCodeAdapter`, `GeminiCLIAdapter`, `CopilotAdapter`, `CodexCLIAdapter`.

### State Manager (`src/stores/`)
Maintains an in-memory model of the on-disk state. Sources of truth are always the files — the state manager is a read cache with change events.

### UI Layer (`src/ui/`)
- **Status bar** — heartbeat indicator showing monitoring state
- **Sidebar** — live feed provider, session health provider, eval rules tree
- **Webviews** — observation cards, eval creation/editing, sentinel conversation panel

### CLI Integration (`src/cli/`)
Wraps calls to the sentinel binary. Used for start/stop lifecycle, doctor health checks, and hook registration.

## Extension Points

The harness adapter interface (`src/adapters/`) is the primary extension point. Adding support for a new AI harness requires implementing the adapter interface:

```typescript
interface HarnessAdapter {
  id: string;
  displayName: string;
  isAvailable(): Promise<boolean>;
  registerHooks(config: HookConfig): Promise<void>;
  getSessionInfo(context: SessionContext): Promise<SessionInfo | undefined>;
  openSession(sessionId: string): Promise<void>;
}
```

See [Harness Support](/guide/harness-support) for current adapter capabilities.
