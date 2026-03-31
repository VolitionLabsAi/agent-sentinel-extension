---
layout: home

hero:
  name: Agent Sentinel
  text: Real-time AI agent monitoring
  tagline: Error Lens + GitLens for AI agent safety. See what your AI coding agents are doing — and stop dangerous operations before they execute.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/VolitionLabsAi/agent-sentinel-extension

features:
  - title: Inline Prevention (Tier 0)
    details: Block dangerous operations before they execute. Destructive file deletions, force pushes, credential exfiltration — caught and stopped at the source via pattern matching in under 10ms.
  - title: Observations
    details: A real-time sidebar feed of every action your AI agent takes. File writes, shell commands, tool invocations — all categorized by severity and streamed as they happen.
  - title: Multi-Harness Support
    details: Works with Claude Code, Gemini CLI, GitHub Copilot, and Codex CLI. One extension monitors all your AI coding assistants with harness-specific adapters.
  - title: Evals
    details: Write natural-language eval rules in YAML. The sentinel's LLM evaluator applies your rules to agent behavior — no regex required. Share rules as eval packs.
---

## Quick Install

Install from the VS Code Marketplace:

```
ext install volition.agent-sentinel
```

Or search for **Agent Sentinel** in the Extensions sidebar.

## How It Works

Agent Sentinel is a **thin VS Code client** that reads observation data produced by the [sentinel CLI](https://github.com/VolitionLabsAi/agent-sentinel) (a Go binary). The extension never runs evaluations directly — it watches the filesystem for observation output and renders it in real time.

```
Sentinel CLI (Go)          Filesystem              VS Code Extension (TS)
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│ Hook triggers    │──>│ observations.jsonl│──>│ File watchers            │
│ Pattern matching │    │ sentinel-state   │    │ State manager            │
│ LLM evaluation   │    │ config, evals    │    │ UI: sidebar, status bar  │
└─────────────────┘    └──────────────────┘    └─────────────────────────┘
```

Read the [Getting Started guide](/guide/getting-started) to have your first observation in under 5 minutes.
