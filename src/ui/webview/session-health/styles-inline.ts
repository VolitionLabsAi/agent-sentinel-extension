/**
 * Inline CSS for the Insights webview.
 * Exported as a string constant so it can be embedded directly in the HTML
 * without requiring file system access from the webview.
 *
 * Source of truth: styles.css in this directory.
 * If you change the design, update this file to match.
 */
export const STYLES = `
:root {
    --health-spacing-xs: 4px;
    --health-spacing-sm: 8px;
    --health-spacing-md: 12px;
    --health-spacing-lg: 16px;
    --card-radius: 6px;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-editor-background);
    padding: var(--health-spacing-md);
    line-height: 1.5;
}

.metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--health-spacing-sm);
    margin-bottom: var(--health-spacing-lg);
}

.metric-card {
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    border-radius: var(--card-radius);
    padding: var(--health-spacing-sm) var(--health-spacing-md);
    text-align: center;
}

.metric-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--vscode-editor-foreground);
    display: block;
}

.metric-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.section {
    margin-bottom: var(--health-spacing-lg);
}

.section-title {
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: var(--health-spacing-sm);
    padding-bottom: var(--health-spacing-xs);
    border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.chart-container {
    display: flex;
    justify-content: center;
    padding: var(--health-spacing-sm) 0;
}

.chart-container svg {
    max-width: 100%;
    height: auto;
}

.empty-state {
    text-align: center;
    padding: var(--health-spacing-lg) var(--health-spacing-md);
    color: var(--vscode-descriptionForeground);
}

.empty-state .icon {
    font-size: 2em;
    margin-bottom: var(--health-spacing-sm);
    opacity: 0.5;
}

.metric-card:focus-visible,
.chart-container:focus-visible {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    * {
        animation: none !important;
        transition: none !important;
    }
}
`;
