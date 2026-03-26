/**
 * CSS styles for the Sentinel Conversation Panel sidebar webview.
 *
 * Uses VS Code CSS variables for full theme compatibility (light, dark, high-contrast).
 * WCAG 2.1 AA: visible focus indicators, sufficient contrast, keyboard navigation.
 */
export const SENTINEL_PANEL_STYLES = `
:root {
    --card-radius: 6px;
    --card-padding: 12px;
    --transition-speed: 150ms;
}

@media (prefers-reduced-motion: reduce) {
    :root {
        --transition-speed: 0ms;
    }
    * {
        animation: none !important;
        transition: none !important;
    }
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    line-height: 1.5;
    padding: 12px;
}

/* ── Status Section ──────────────────────────────────────── */

.status-section {
    margin-bottom: 16px;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}

.status-badge.running {
    background: var(--vscode-testing-iconPassed, #388a34);
    color: var(--vscode-button-foreground, #fff);
}

.status-badge.stopped {
    background: var(--vscode-disabledForeground, #888);
    color: var(--vscode-button-foreground, #fff);
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.status-badge.running .status-dot {
    background: var(--vscode-charts-green, #6fbf73);
}

.status-badge.stopped .status-dot {
    background: var(--vscode-disabledForeground, #bbb);
}

/* ── Context Stats ───────────────────────────────────────── */

.context-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
}

.stat-card {
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    border-radius: var(--card-radius);
    padding: 8px var(--card-padding);
    text-align: center;
}

.stat-value {
    display: block;
    font-size: 18px;
    font-weight: 700;
    color: var(--vscode-editor-foreground);
}

.stat-label {
    display: block;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* ── Sentinel List ───────────────────────────────────────── */

.section-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, #888);
    margin-bottom: 8px;
    margin-top: 16px;
}

.sentinel-list {
    list-style: none;
    margin-bottom: 16px;
}

.sentinel-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--card-radius);
    margin-bottom: 4px;
    background: var(--vscode-list-hoverBackground, transparent);
}

.sentinel-name {
    font-weight: 600;
    font-size: 13px;
}

.sentinel-session {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--vscode-editor-fontFamily, monospace);
}

/* ── Observations Summary ────────────────────────────────── */

.observation-list {
    list-style: none;
    margin-bottom: 16px;
}

.observation-item {
    padding: 6px 8px;
    border-left: 3px solid transparent;
    margin-bottom: 4px;
    border-radius: 0 var(--card-radius) var(--card-radius) 0;
    background: var(--vscode-list-hoverBackground, transparent);
    font-size: 12px;
}

.observation-item.critical {
    border-left-color: var(--vscode-testing-iconFailed, #f44336);
}

.observation-item.warning {
    border-left-color: var(--vscode-editorWarning-foreground, #ff9800);
}

.observation-item.info {
    border-left-color: var(--vscode-editorInfo-foreground, #2196f3);
}

.observation-severity {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
}

.observation-text {
    display: block;
    color: var(--vscode-editor-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.observation-time {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #888);
}

/* ── Quick Input ─────────────────────────────────────────── */

.quick-input-section {
    margin-top: 16px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    padding-top: 12px;
}

.input-row {
    display: flex;
    gap: 6px;
}

.quick-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, #444));
    border-radius: var(--card-radius);
    background: var(--vscode-input-background, var(--vscode-editor-background));
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground));
    font-family: inherit;
    font-size: 12px;
    outline: none;
}

.quick-input:focus {
    border-color: var(--vscode-focusBorder, #007acc);
    outline: 1px solid var(--vscode-focusBorder, #007acc);
    outline-offset: -1px;
}

.quick-input:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007acc);
    outline-offset: 1px;
}

.quick-input::placeholder {
    color: var(--vscode-input-placeholderForeground, #888);
}

.send-btn {
    padding: 6px 12px;
    border: none;
    border-radius: var(--card-radius);
    background: var(--vscode-button-background, #007acc);
    color: var(--vscode-button-foreground, #fff);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-speed);
}

.send-btn:hover {
    background: var(--vscode-button-hoverBackground, #005a9e);
}

.send-btn:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007acc);
    outline-offset: 2px;
}

.send-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

/* ── Messages ────────────────────────────────────────────── */

.messages-list {
    list-style: none;
    margin-top: 8px;
    max-height: 200px;
    overflow-y: auto;
}

.message-item {
    padding: 4px 8px;
    margin-bottom: 4px;
    border-radius: var(--card-radius);
    background: var(--vscode-list-hoverBackground, transparent);
    font-size: 12px;
}

.message-item .message-time {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #888);
    margin-right: 6px;
}

/* ── Action Button ───────────────────────────────────────── */

.open-chat-btn {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: var(--card-radius);
    background: var(--vscode-button-background, #007acc);
    color: var(--vscode-button-foreground, #fff);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    margin-top: 12px;
    transition: background var(--transition-speed);
}

.open-chat-btn:hover {
    background: var(--vscode-button-hoverBackground, #005a9e);
}

.open-chat-btn:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007acc);
    outline-offset: 2px;
}

/* ── Empty/Limitation State ──────────────────────────────── */

.empty-state {
    text-align: center;
    padding: 24px 12px;
    color: var(--vscode-descriptionForeground, #888);
}

.empty-state .icon {
    font-size: 32px;
    margin-bottom: 8px;
}

.limitation-notice {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: var(--card-radius);
    background: var(--vscode-inputValidation-infoBackground, transparent);
    border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-widget-border, #444));
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #888);
}
`;
