# Extension API

::: warning Phase 5 — Deferred
Formal API stabilization is planned for Phase 5 (Extension API + Commercial Foundation). The interfaces documented below reflect the current implementation and may change.
:::

## Current Exports

The extension exposes functionality through the `activate()` return value, accessible to other extensions via the VS Code extension API.

### Accessing the API

```typescript
const sentinel = vscode.extensions.getExtension('volition.agent-sentinel');
if (sentinel?.isActive) {
  const api = sentinel.exports;
  // Use api...
}
```

## Key Components

### ObservationStore

The central store for observation data. Maintains an in-memory ring buffer of observations parsed from the JSONL file.

- Fires events when new observations arrive
- Supports filtering by session, severity, eval ID
- Bounded by `sentinel.observations.maxInMemory` setting

### StateManager

Read-only accessor for the current monitoring state, including:

- Active sessions and their status
- Current harness and adapter
- Monitoring lifecycle state (idle, active, error)
- Config and health assessment results

### SessionCorrelator

Maps observations to agent sessions using heuristic matching:

- Tab-based correlation (Claude Code, Copilot)
- Transcript activity correlation
- Timing-based fallback

### HarnessAdapterRegistry

Access to the active harness adapter and available adapters:

- Query which harnesses are installed
- Get the active adapter
- Subscribe to adapter change events

## Commands

All commands are available programmatically via `vscode.commands.executeCommand`:

| Command | Description |
|---------|-------------|
| `sentinel.start` | Begin watching for agent observations |
| `sentinel.stop` | Stop the file watcher and clear state |
| `sentinel.status` | Display current monitoring status |
| `sentinel.openLiveFeed` | Focus the sidebar observation feed |
| `sentinel.runHealthCheck` | Run diagnostics on setup |
| `sentinel.focusSession` | Switch focus to a specific session |
| `sentinel.cycleVisibility` | Cycle status bar display modes |
| `sentinel.selectHarness` | Change the default harness |

## Events

The extension emits events through the state manager and observation store. Subscribe patterns follow standard VS Code `Event<T>` conventions.

```typescript
// Example: listen for new observations
api.observationStore.onDidAddObservation((observation) => {
  console.log(`New ${observation.severity}: ${observation.summary}`);
});
```

::: tip
When the API is formalized in Phase 5, stable event contracts and typed interfaces will be published as an npm package for extension authors.
:::
