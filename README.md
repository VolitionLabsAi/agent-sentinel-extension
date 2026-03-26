# Agent Sentinel — Real-time AI agent monitoring for VS Code

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/volition.agent-sentinel)](https://marketplace.visualstudio.com/items?itemName=volition.agent-sentinel)

**Error Lens + GitLens for AI agent safety.** Agent Sentinel gives you real-time visibility into what your AI coding agents are doing — and stops dangerous operations before they execute.

---

## Features

### Real-time Observation Feed

A live sidebar feed of every action your AI agent takes. Observations stream in as they happen — file writes, shell commands, tool invocations — all categorized by severity.

> *Screenshot: Live Feed sidebar showing a stream of agent observations — coming soon*

### Inline Prevention (Tier 0)

Sentinel blocks dangerous operations before they execute. Destructive file deletions, force pushes, credential exfiltration — caught and stopped at the source, not after the damage is done.

> *Screenshot: Tier 0 block notification preventing a dangerous rm -rf — coming soon*

### Status Bar Heartbeat

A persistent status bar indicator shows monitoring state at a glance. Green when healthy, yellow when observations need attention, red when something is wrong. Click to navigate directly to the relevant session.

> *Screenshot: Status bar showing sentinel heartbeat indicator — coming soon*

### Multi-Session Support

Working with multiple AI agents simultaneously? Sentinel tracks each session independently with automatic correlation. Switch between sessions, view consolidated feeds, or focus on a single agent.

> *Screenshot: Multi-session view with session picker — coming soon*

### Health Assessment

Built-in diagnostics via `Sentinel: Run Health Check`. Validates your configuration, checks CLI connectivity, and reports on observation pipeline health — like a doctor's checkup for your monitoring setup.

> *Screenshot: Health check results panel — coming soon*

### Guided Setup

A step-by-step walkthrough gets you from install to first observation in under two minutes. No docs to read, no config files to write by hand.

> *Screenshot: Getting Started walkthrough — coming soon*

### Clickable Navigation

Every observation in the feed is actionable. Click to jump to the relevant file, line, or agent session. Observations link directly to the code they describe.

> *Screenshot: Click-to-navigate from observation to source — coming soon*

---

## Quick Start

### 1. Install

Install Agent Sentinel from the VS Code Marketplace or Open VSX.

### 2. Configure

Open a workspace that has the [agent-sentinel CLI](https://github.com/volition-party/agent-sentinel) configured, or run `Sentinel: Start Monitoring` to initialize.

### 3. Monitor

Open the Sentinel sidebar from the Activity Bar. Observations appear in real time as your AI agent works.

---

## Requirements

- **VS Code** ≥ 1.85.0
- **[agent-sentinel CLI](https://github.com/volition-party/agent-sentinel)** — the core monitoring engine that captures agent observations

The CLI produces observation data; this extension visualizes it.

---

## Configuration Reference

All settings are under the `sentinel.*` namespace.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sentinel.autoStart` | `boolean` | `false` | Automatically start monitoring when sentinel config is detected |
| `sentinel.statusBar.enabled` | `boolean` | `true` | Show sentinel status in the status bar |
| `sentinel.observations.maxInMemory` | `number` | `1000` | Maximum number of observations to keep in memory |
| `sentinel.viewMode` | `string` | `"all"` | Default view mode for the live feed (`all`, `active`, `pinned`) |
| `sentinel.doctor.backgroundInterval` | `number` | `300` | Background health check interval in seconds |

---

## Commands

| Command | Description |
|---------|-------------|
| `Sentinel: Start Monitoring` | Begin watching for agent observations |
| `Sentinel: Stop Monitoring` | Stop the file watcher and clear state |
| `Sentinel: Show Status` | Display current monitoring status |
| `Sentinel: Open Live Feed` | Focus the sidebar observation feed |
| `Sentinel: Run Health Check` | Run diagnostics on your setup |
| `Sentinel: Focus Session` | Switch focus to a specific agent session |
| `Sentinel: Navigate to Session` | Jump to a session's observations |
| `Sentinel: Set View Mode` | Toggle between all/active/pinned views |
| `Sentinel: Cycle Status Bar Visibility` | Cycle through status bar display modes |

---

## Links

- [GitHub Repository](https://github.com/volition-party/agent-sentinel-extension)
- [Report Issues](https://github.com/volition-party/agent-sentinel-extension/issues)
- [Contributing Guide](https://github.com/volition-party/agent-sentinel-extension/blob/main/CONTRIBUTING.md)
- [Core CLI — agent-sentinel](https://github.com/volition-party/agent-sentinel)

---

## License

[Apache-2.0](LICENSE)
