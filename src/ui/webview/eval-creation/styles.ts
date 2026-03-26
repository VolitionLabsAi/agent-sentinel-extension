/**
 * CSS styles for the eval creation webview.
 *
 * Uses VS Code CSS variables for full theme compatibility (light, dark, high-contrast).
 * WCAG 2.1 AA: visible focus indicators, sufficient contrast, keyboard navigation.
 */
export const EVAL_CREATION_STYLES = `
:root {
    --card-radius: 6px;
    --card-padding: 16px;
    --transition-speed: 150ms;
}

@media (prefers-reduced-motion: reduce) {
    :root {
        --transition-speed: 0ms;
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
    padding: 16px;
}

.container {
    max-width: 640px;
    margin: 0 auto;
}

h1 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--vscode-editor-foreground);
}

/* ── Form Elements ──────────────────────────────────────── */

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--vscode-editor-foreground);
}

.form-group .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
    margin-bottom: 6px;
}

textarea {
    width: 100%;
    min-height: 100px;
    padding: 8px;
    font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    line-height: 1.5;
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground));
    background: var(--vscode-input-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #444));
    border-radius: 4px;
    resize: vertical;
}

textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
}

select {
    width: 100%;
    padding: 6px 8px;
    font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-dropdown-foreground, var(--vscode-editor-foreground));
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #444));
    border-radius: 4px;
}

select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
}

/* ── Inline selectors row ───────────────────────────────── */

.selectors-row {
    display: flex;
    gap: 12px;
}

.selectors-row .form-group {
    flex: 1;
}

/* ── Buttons ────────────────────────────────────────────── */

.button-row {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}

button {
    padding: 6px 14px;
    font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    font-weight: 600;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: opacity var(--transition-speed) ease;
}

button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

button.primary {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
}

button.primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
}

button.secondary {
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    background: var(--vscode-button-secondaryBackground, #3a3d41);
}

button.secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
}

/* ── Focus indicators (WCAG) ────────────────────────────── */

button:focus-visible,
textarea:focus-visible,
select:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 2px;
}

/* ── YAML Preview ───────────────────────────────────────── */

.yaml-preview {
    background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    border-radius: var(--card-radius);
    padding: 12px 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre;
    tab-size: 2;
}

.yaml-edit {
    width: 100%;
    min-height: 200px;
    padding: 12px 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--vscode-input-foreground, var(--vscode-editor-foreground));
    background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #444));
    border-radius: var(--card-radius);
    resize: vertical;
    tab-size: 2;
}

.yaml-edit:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
}

/* ── YAML Syntax Highlighting ───────────────────────────── */

.yaml-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
}

.yaml-string {
    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
}

.yaml-number {
    color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
}

.yaml-comment {
    color: var(--vscode-descriptionForeground, #6a9955);
    font-style: italic;
}

.yaml-block-indicator {
    color: var(--vscode-symbolIcon-operatorForeground, #d4d4d4);
}

.yaml-literal {
    color: var(--vscode-editor-foreground);
}

/* ── File path display ──────────────────────────────────── */

.file-path {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
    margin-top: 8px;
    word-break: break-all;
}

/* ── Status messages ────────────────────────────────────── */

.status {
    font-size: 12px;
    margin-top: 12px;
}

.status.success {
    color: var(--vscode-testing-iconPassed, #73c991);
}

.status.error {
    color: var(--vscode-errorForeground, #f44747);
}

.status.loading {
    color: var(--vscode-descriptionForeground, #999);
}

/* ── Step indicators ────────────────────────────────────── */

.step-indicator {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 16px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
}

.step {
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
}

.step.active {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
    border-color: var(--vscode-button-background, #0e639c);
}

.step-arrow {
    opacity: 0.5;
}

/* ── Responsive ─────────────────────────────────────────── */

@media (max-width: 480px) {
    .selectors-row {
        flex-direction: column;
        gap: 0;
    }

    .button-row {
        flex-direction: column;
    }

    button {
        width: 100%;
    }
}
`;
