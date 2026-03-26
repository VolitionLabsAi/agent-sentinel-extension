# Security Audit Report

**Date:** 2026-03-25
**Auditor:** Security specialist (automated)
**Extension:** Agent Sentinel v0.0.1

## Scope

Full source audit of all 56 TypeScript source files in `src/`, plus `package.json` and dependency tree. Audit covered:

- Network requests and data exfiltration
- Webview Content Security Policy (CSP)
- CLI/shell injection via child_process
- File access boundaries
- Logging of sensitive data
- Dependency vulnerabilities (npm audit)
- Extension permissions and activation events
- HTML escaping in webviews

---

## Findings

### Category: Network Requests / Data Exfiltration

| Check | Status | Details |
|-------|--------|---------|
| No `fetch`, `XMLHttpRequest`, `axios`, `node-fetch` | PASS | Zero network request libraries imported or used in any source file |
| No telemetry or phone-home calls | PASS | No outbound HTTP/HTTPS calls found anywhere |
| Webview CSP blocks external network | PASS | All 5 webviews use `default-src 'none'` which blocks all network requests from webviews |

### Category: Webview Security (CSP)

| Check | Status | Details |
|-------|--------|---------|
| All webviews have CSP meta tag | PASS | All 5 webview templates include `Content-Security-Policy` |
| No `unsafe-eval` | PASS | No webview uses `unsafe-eval` |
| No `unsafe-inline` for scripts | PASS | All script tags use `nonce-${nonce}` |
| No `unsafe-inline` for styles | FIXED | 3 webviews (observation-card, eval-creation, eval-editor) used `style-src 'unsafe-inline'` instead of nonce-based styles. Fixed to `style-src 'nonce-${nonce}'` with `<style nonce>` attributes. Session-health and sentinel-panel were already correct. |
| Nonces are cryptographically random | PASS | All nonces generated via `crypto.randomBytes(16).toString('hex')` |

### Category: CLI Injection

| Check | Status | Details |
|-------|--------|---------|
| sentinel-cli.ts uses `execFile` | PASS | Uses `cp.execFile` with argument arrays, no shell interpolation |
| Adapter binary detection | FIXED | `codex-cli-adapter.ts` and `gemini-cli-adapter.ts` used `cp.exec` with string interpolation (`\`${cmd} ${BINARY_NAME}\``). While the interpolated values are hardcoded constants (not user input), this pattern is fragile. Fixed to use `cp.execFile(cmd, [BINARY_NAME])` matching the sentinel-cli.ts pattern. |
| No user input in CLI args | PASS | All CLI arguments are either hardcoded constants or workspace folder paths from VS Code API |

### Category: File Access Boundaries

| Check | Status | Details |
|-------|--------|---------|
| Reads scoped to workspace | PASS | All file reads target `.volition/sentinel/` within workspace folders, derived from `vscode.workspace.workspaceFolders` |
| Writes scoped to workspace | PASS | All writes (config, evals, steering JSONL) target `.volition/sentinel/` within workspace folders |
| Eval editor save uses stored path | PASS | `EvalEditorPanel.handleSave()` writes to `this.currentFilePath` set during `show()` |
| Walkthrough reads scoped | PASS | `WalkthroughManager` reads only from workspace `.volition/sentinel/` paths |
| No arbitrary path traversal | PASS | File paths constructed via `path.join()` from workspace roots, no user-controlled path segments |

### Category: Secrets in Logs

| Check | Status | Details |
|-------|--------|---------|
| console.log/warn/error content | PASS | Log messages contain only: activation messages, config setting values (`autoStart`, `harness.default`), error objects, truncated malformed JSONL lines (first 100 chars). No API tokens, secrets, or full file contents logged. |
| Error messages to user | PASS | `showErrorMessage` calls display generic error descriptions, not sensitive data |

### Category: HTML Escaping in Webviews

| Check | Status | Details |
|-------|--------|---------|
| observation-renderer.ts | PASS | All user-supplied fields (`eval_id`, `one_liner`, `analysis`, `sentinel_label`, `sentinel_name`, `session_id`, `visibility`, `version`, `timestamp`) are escaped via `escapeHtml()` before embedding in HTML |
| sentinel-panel template | PASS | Uses `escapeHtml()` for sentinel names, session IDs, severity, one-liners, and message text before `innerHTML` |
| eval-creation template | PASS | YAML display uses `highlightYaml()` which escapes all text via `escapeHtml()` before wrapping in `<span>` tags |
| eval-editor template | PASS | Raw YAML embedded via `escapeAttr()` in textarea. Error panel HTML uses `escapeHtml()` for error messages |
| eval-editor panel.ts | PASS | `buildErrorPanelHtml()` escapes error messages via `escapeHtml()` |
| observation-card template | NOTE | `root.innerHTML = message.html` receives pre-rendered HTML from extension host (not webview). The HTML is built by `renderCard()` which escapes all user data. This is safe because the data flow is extension host -> webview, not user -> webview. |
| session-health chart SVGs | PASS | Chart SVGs are rendered on extension host from numeric data only (latency values, counts, timestamps). No user-supplied text in SVGs. |

### Category: Extension Permissions

| Check | Status | Details |
|-------|--------|---------|
| Activation events | PASS | `workspaceContains:**/.volition/sentinel/sentinel.config.json` (scoped) + `onStartupFinished` (deferred, low-priority). No `*` wildcard activation. |
| API permissions | PASS | No `extensionDependencies` required. Uses only standard VS Code APIs: `workspace.fs`, `window.createWebviewPanel`, `commands.registerCommand`, etc. |
| No filesystem API beyond workspace | PASS | Extension uses `vscode.workspace.workspaceFolders` as root for all file operations |

---

## Dependency Audit

```
# After npm audit fix --force (2026-03-25)

FIXED:
- diff (jsdiff DoS) - updated via mocha 11.3.0
- esbuild <=0.24.2 (dev server request forgery) - updated to 0.27.4

REMAINING (no fix available, dev-only):
- serialize-javascript <=7.0.2 (RCE via RegExp.flags) - HIGH severity
  Transitive via: mocha -> serialize-javascript
  Impact: Dev-only dependency, not bundled in extension output.
  No fix available upstream; mocha has not updated yet.
```

---

## Summary

- **Critical issues found:** 0
- **Issues fixed:** 2
  - CSP `unsafe-inline` for styles in 3 webview templates -> nonce-based
  - `cp.exec` with string interpolation in 2 adapter files -> `cp.execFile` with argument arrays
- **Remaining unfixable:** 1 (serialize-javascript in dev-only mocha dependency, no upstream fix)
- **Tests:** 248 passing, 0 failing
- **Lint:** 0 errors (15 warnings, all pre-existing in test files)
