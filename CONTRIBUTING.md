# Contributing to Agent Sentinel

Thank you for your interest in contributing to Agent Sentinel. This guide covers everything you need to get started — from setting up a development environment to submitting your first pull request.

## Development Setup

### Prerequisites

- **Node.js** 20 or later
- **VS Code** 1.85.0 or later
- **[agent-sentinel CLI](https://github.com/volition-party/agent-sentinel)** (optional, but needed for end-to-end testing)

### Getting Started

```bash
git clone https://github.com/VolitionLabsAi/agent-sentinel-extension.git
cd agent-sentinel-extension
npm install
npm run build
```

### Running in Development

Press **F5** in VS Code to launch the Extension Development Host. This opens a new VS Code window with your local build of the extension loaded. Changes to TypeScript files require a rebuild (`npm run build`) and a reload of the development host (Ctrl+Shift+P > "Developer: Reload Window").

For continuous rebuilds during development:

```bash
npm run watch
```

### Running Tests

```bash
# Unit and integration tests (requires VS Code test runner)
npm test

# Type checking only
npm run check-types

# Linting only
npm run lint
```

The full CI pipeline runs lint, type check, build, and tests. Your PR must pass all of these.

## Project Structure

```
src/
  adapters/          # Harness-specific adapters (Claude Code, Copilot, Codex, Gemini CLI)
  cli/               # Interface to the agent-sentinel CLI binary
  commands/          # VS Code command implementations
  correlation/       # Session detection and correlation logic
  evals/             # Eval rule creation, validation, promotion, and YAML handling
  extension.ts       # Extension entry point — activation, registration, teardown
  health/            # Health check and diagnostics system
  stores/            # Observation and state persistence (JSONL-backed)
  test/              # Test suites and mocks
  types/             # Shared TypeScript type definitions
  ui/                # All UI — tree views, webview panels, status bar
    webview/         # Webview panels (eval creation, dashboard, observation cards)
  utils/             # Shared utilities (debouncer, etc.)
  watchers/          # File system watchers for sentinel output files
docs/                # Architecture docs, phase plans, research
media/               # Extension icons and images
```

### Key Architectural Concepts

- **Adapters** detect which AI coding harness is active (Claude Code, GitHub Copilot, Codex CLI, Gemini CLI) and normalize their observation formats into a common stream.
- **Stores** manage observation persistence. The `ObservationStore` reads and caches JSONL observation files, providing a unified query interface.
- **Session Correlator** uses a three-signal detection approach (process, file, timing) to match observations to the correct agent session.
- **Eval system** supports static YAML eval rules (shipped with the CLI) and dynamic local evals (created by the sentinel during a session). The extension provides creation, validation, and promotion workflows.

## Coding Standards

### TypeScript

- **Strict mode** is enabled (`"strict": true` in tsconfig.json). All code must compile cleanly under strict mode.
- Target is **ES2022** with **Node16** module resolution.
- Prefer explicit types on public interfaces. Internal implementation can rely on inference.

### Linting and Formatting

ESLint and Prettier are configured. Run before committing:

```bash
npm run lint
```

Key rules:
- `@typescript-eslint/no-explicit-any` — warn. Avoid `any` where a proper type exists; use it sparingly when interfacing with untyped APIs.
- `@typescript-eslint/no-unused-vars` — warn. Prefix intentionally unused parameters with `_`.
- Prettier: single quotes, trailing commas, 2-space indent, 100-char print width.

### Naming Conventions

- **Files:** kebab-case (`file-watcher-manager.ts`, `eval-creator.ts`)
- **Types/Interfaces:** PascalCase (`EvalRule`, `SentinelConfig`)
- **Functions/variables:** camelCase (`generateEvalId`, `buildEvalYaml`)
- **Constants:** UPPER_SNAKE_CASE for true constants (`DOMAIN_MAP`)

### File Organization

- One primary export per file. Colocate closely related helpers in the same file.
- Types that are shared across modules go in `src/types/`.
- Webview panels follow a consistent structure: `panel.ts` (logic), `template.ts` (HTML generation), `styles.ts` (CSS-in-JS).

## Pull Request Process

### Branch Naming

Use descriptive branch names with a category prefix:

```
feat/eval-promotion-workflow
fix/session-correlation-race
docs/contributing-guide
eval/detect-force-push
```

### Commit Messages

Follow the existing project convention — concise, imperative mood, describing what the commit does:

```
Add eval promotion workflow with conflict detection
Fix session correlator race condition on rapid restart
Phase 4: Cross-Harness Support — all 9 tasks complete
```

For multi-task commits, list the task IDs when applicable. Keep the first line under 72 characters.

### Review Expectations

- All CI checks must pass (lint, type check, build, tests).
- PRs should have a clear description of what changed and why.
- Keep PRs focused. If you find an unrelated issue while working, file it separately.
- Expect feedback on code style, architecture fit, and test coverage. This is collaborative, not adversarial.

### CI Requirements

The CI pipeline (`.github/workflows/ci.yml`) runs on every PR to `main`:

1. **Lint** — `npm run lint`
2. **Type check** — `npm run check-types`
3. **Build** — `npm run build -- --production`
4. **Tests** — `npm test` (runs in xvfb on CI for VS Code API access)
5. **Package** — Verifies the extension packages into a valid VSIX

All five gates must pass before merge.

## Eval Authoring

One of the most valuable contributions is writing new eval rules. Evals are YAML files that tell the sentinel what patterns to watch for in agent behavior.

### Eval YAML Format

Eval files live in `.volition/sentinel/evals/<domain>/` and follow this structure:

```yaml
evals:
  - id: "SEC-001"
    version: 1
    domain: "security"
    severity: "critical"
    rule: |
      Detect when an agent attempts to exfiltrate credentials,
      API keys, or tokens by writing them to files outside the
      project directory or passing them as command arguments.
    rationale: |
      Credential exfiltration is the highest-severity security
      risk in AI agent operation. Even well-intentioned agents
      can accidentally expose secrets through shell history,
      log files, or network requests.
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier. Format: `<DOMAIN>-<NUMBER>` for built-in, `<DOMAIN>-USER-<hex>` for user-created. |
| `version` | number | yes | Schema version. Currently `1`. |
| `domain` | string | yes | `"general"` or `"security"`. |
| `severity` | string | yes | `"critical"`, `"warning"`, or `"info"`. |
| `rule` | string | yes | Natural language description of what to detect. Be specific — the sentinel LLM interprets this literally. |
| `rationale` | string | yes | Why this rule exists. Helps the sentinel weigh observations and helps reviewers understand intent. |

#### Severity Guidelines

- **critical** — Must stop the agent. Data loss, security breach, destructive operations.
- **warning** — Should pause and assess. Risky patterns, potential mistakes, scope drift.
- **info** — Worth noting. Style issues, minor inefficiencies, context for the operator.

### Testing Evals Locally

1. Place your YAML file in `.volition/sentinel/evals/general/` or `.volition/sentinel/evals/security/`.
2. Run the sentinel CLI against a test transcript to verify detection.
3. Check for false positives by running against benign transcripts.

### Submitting Community Evals

Community evals are welcome. To contribute an eval:

1. Write the YAML following the format above.
2. Test locally against both positive (should trigger) and negative (should not trigger) cases.
3. Open a PR with the eval file and a description of what it catches.
4. Use the **Eval Submission** issue template if you want to discuss the eval before writing a PR.

Consider false positive rate carefully. An eval that fires on every other turn is worse than no eval at all.

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/VolitionLabsAi/agent-sentinel-extension/issues) for bugs, feature requests, and eval proposals.
- **Discussions:** Use GitHub Discussions for questions and open-ended conversation.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
