# Getting Started

Get from install to your first sentinel observation in under 5 minutes.

## Prerequisites

- **VS Code** 1.85 or later
- **Sentinel CLI** — installed via the [`vl` CLI](https://github.com/VolitionLabsAi/agent-sentinel) or as a standalone Go binary
- An AI coding assistant with hook support (Claude Code, Gemini CLI, GitHub Copilot, or Codex CLI)

## 1. Install the Extension

Install from the VS Code Marketplace:

```
ext install volition.agent-sentinel
```

Or open VS Code, go to the Extensions sidebar (`Ctrl+Shift+X`), and search for **Agent Sentinel**.

## 2. Initialize Sentinel in Your Workspace

Open a terminal in your project and run:

```bash
vl sentinel init
```

This creates the `.volition/sentinel/` directory with:

- `sentinel.config.json` — configuration file
- `evals/` — directory for eval rules (general and security)
- `patterns/` — directory for Tier 0 pattern files

## 3. Start Monitoring

You have two options:

**From the command palette:**

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Sentinel: Start Monitoring**

**Auto-start on workspace open:**

Set `sentinel.autoStart` to `true` in your VS Code settings. Sentinel will activate automatically when it detects a `sentinel.config.json` in your workspace.

## 4. See Your First Observation

Start an AI coding session (e.g., open Claude Code, start a Copilot chat, or run Gemini CLI in the terminal). As the agent uses tools — writing files, running commands — sentinel evaluates each action and streams observations to the sidebar.

Open the Sentinel sidebar from the Activity Bar to see the live feed. Each observation shows:

- **Severity** — critical (red), warning (yellow), or info (blue)
- **Eval ID** — which rule triggered the observation
- **Summary** — what the sentinel detected
- **Timestamp** — when the observation occurred

Click any observation to jump to the relevant file or agent session.

## 5. Verify Your Setup

Run the built-in health check:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Sentinel: Run Health Check**

This validates your configuration, checks CLI connectivity, and reports on observation pipeline health.

## What's Next

- [Configuration Reference](/guide/configuration) — tune sentinel settings and eval behavior
- [Eval Authoring Guide](/guide/eval-authoring) — write custom rules for your project
- [Harness Support](/guide/harness-support) — per-harness setup and feature matrix
- [Troubleshooting](/guide/troubleshooting) — common issues and solutions
