/**
 * CSS styles for the eval editor webview panel.
 *
 * Uses VS Code CSS variables for full theme compatibility (light, dark, high-contrast).
 * Monospace font for YAML editing, syntax highlighting classes, error indicators,
 * and WCAG 2.1 AA focus indicators.
 */
export const EVAL_EDITOR_STYLES = `
:root {
    --editor-padding: 12px;
    --toolbar-height: 40px;
    --error-panel-max-height: 150px;
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
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

/* ── Toolbar ─────────────────────────────────────────────── */

.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px var(--editor-padding);
    height: var(--toolbar-height);
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    background: var(--vscode-editor-background);
    flex-shrink: 0;
}

.toolbar-spacer {
    flex: 1;
}

.toolbar-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    font-size: 12px;
    font-family: var(--vscode-font-family, system-ui);
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-speed) ease;
}

.toolbar-button:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
}

.toolbar-button.secondary {
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, transparent));
}

.toolbar-button.secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
}

.toolbar-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.validation-status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 3px;
}

.validation-status.valid {
    color: var(--vscode-testing-iconPassed, #73c991);
}

.validation-status.invalid {
    color: var(--vscode-errorForeground, #f44747);
}

.read-only-badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 3px;
    color: var(--vscode-descriptionForeground, #999);
    background: color-mix(in srgb, var(--vscode-descriptionForeground, #999) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-descriptionForeground, #999) 25%, transparent);
}

/* ── Editor area ─────────────────────────────────────────── */

.editor-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.editor-wrapper {
    flex: 1;
    position: relative;
    overflow: auto;
}

.editor-textarea {
    width: 100%;
    height: 100%;
    min-height: 200px;
    padding: var(--editor-padding);
    padding-left: 56px;
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', 'Courier New', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    border: none;
    outline: none;
    resize: none;
    tab-size: 2;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
}

.editor-textarea:read-only {
    opacity: 0.8;
    cursor: default;
}

/* Highlighted overlay positioned behind the textarea */
.editor-highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: var(--editor-padding);
    padding-left: 56px;
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', 'Courier New', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    white-space: pre;
    overflow-wrap: normal;
    pointer-events: none;
    color: transparent;
}

/* Line numbers gutter */
.line-numbers {
    position: absolute;
    top: 0;
    left: 0;
    width: 44px;
    padding: var(--editor-padding) 8px var(--editor-padding) 0;
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', 'Courier New', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    text-align: right;
    color: var(--vscode-editorLineNumber-foreground, #858585);
    user-select: none;
    pointer-events: none;
    white-space: pre;
    border-right: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    background: var(--vscode-editor-background);
    z-index: 1;
}

/* ── Syntax highlighting tokens ──────────────────────────── */

.yaml-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
}

.yaml-value {
    color: var(--vscode-editor-foreground);
}

.yaml-string {
    color: var(--vscode-debugTokenExpression-string, #ce9178);
}

.yaml-number {
    color: var(--vscode-debugTokenExpression-number, #b5cea8);
}

.yaml-boolean {
    color: var(--vscode-debugTokenExpression-boolean, #569cd6);
}

.yaml-comment {
    color: var(--vscode-editorLineNumber-foreground, #6a9955);
    font-style: italic;
}

.yaml-scalar {
    color: var(--vscode-debugTokenExpression-boolean, #569cd6);
    font-weight: 600;
}

.yaml-list {
    color: var(--vscode-editor-foreground);
    font-weight: 600;
}

/* ── Error highlighting ──────────────────────────────────── */

.error-line {
    background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 10%, transparent);
    text-decoration: wavy underline var(--vscode-errorForeground, #f44747);
    text-decoration-skip-ink: none;
}

/* ── Error panel ─────────────────────────────────────────── */

.error-panel {
    max-height: var(--error-panel-max-height);
    overflow-y: auto;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    background: var(--vscode-editor-background);
    flex-shrink: 0;
}

.error-panel:empty {
    display: none;
}

.error-panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px var(--editor-padding);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-errorForeground, #f44747);
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
}

.error-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px var(--editor-padding);
    font-size: 12px;
    cursor: pointer;
    transition: background var(--transition-speed) ease;
}

.error-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
}

.error-line-num {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
    min-width: 40px;
}

.error-message {
    color: var(--vscode-errorForeground, #f44747);
}

/* ── Focus & keyboard navigation ─────────────────────────── */

a:focus-visible,
button:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 2px;
    border-radius: 2px;
    transition: outline-offset var(--transition-speed) ease;
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 480px) {
    .toolbar {
        flex-wrap: wrap;
        height: auto;
    }

    .editor-textarea,
    .editor-highlight {
        padding-left: 40px;
        font-size: 12px;
    }

    .line-numbers {
        width: 32px;
        font-size: 12px;
    }
}
`;
