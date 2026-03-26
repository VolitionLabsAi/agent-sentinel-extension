/**
 * CSS styles for observation card webview.
 *
 * Uses VS Code CSS variables for full theme compatibility (light, dark, high-contrast).
 * WCAG 2.1 AA: visible focus indicators, no color-only information, prefers-reduced-motion.
 */
export const OBSERVATION_CARD_STYLES = `
:root {
    --card-radius: 6px;
    --card-padding: 16px;
    --badge-radius: 3px;
    --badge-padding: 2px 8px;
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

.observation-card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    border-radius: var(--card-radius);
    background: var(--vscode-editor-background);
    max-width: 720px;
    margin: 0 auto;
}

/* ── Header ───────────────────────────────────────────── */

.card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: var(--card-padding);
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
}

.severity-badge,
.hook-badge,
.tier-badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: var(--badge-padding);
    border-radius: var(--badge-radius);
    white-space: nowrap;
}

/* Severity badges — foreground color from VS Code theme, background derived with opacity */
.severity-badge.critical {
    color: var(--vscode-errorForeground, #f44747);
    background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground, #f44747) 40%, transparent);
}

.severity-badge.warning {
    color: var(--vscode-editorWarning-foreground, #cca700);
    background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 40%, transparent);
}

.severity-badge.info {
    color: var(--vscode-editorInfo-foreground, #3794ff);
    background: color-mix(in srgb, var(--vscode-editorInfo-foreground, #3794ff) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-editorInfo-foreground, #3794ff) 40%, transparent);
}

.hook-badge {
    color: var(--vscode-editor-foreground);
    background: color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 25%, transparent);
}

.hook-badge.prevented {
    color: var(--vscode-errorForeground, #f44747);
    background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground, #f44747) 30%, transparent);
}

.tier-badge {
    color: var(--vscode-descriptionForeground, #999);
    background: transparent;
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    font-weight: 400;
}

.eval-id {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    margin-left: 4px;
}

/* ── Body ─────────────────────────────────────────────── */

.card-body {
    padding: var(--card-padding);
}

.one-liner {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-editor-foreground);
}

.analysis {
    font-size: 13px;
    line-height: 1.65;
    color: var(--vscode-editor-foreground);
    white-space: pre-wrap;
    word-wrap: break-word;
}

.analysis:empty {
    display: none;
}

/* ── Footer ───────────────────────────────────────────── */

.card-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px var(--card-padding);
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent));
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
}

.footer-left,
.footer-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

.footer-label {
    opacity: 0.7;
}

.footer-value {
    font-family: var(--vscode-editor-font-family, monospace);
}

/* ── Metadata grid (below card) ───────────────────────── */

.metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    max-width: 720px;
    margin: 12px auto 0;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
}

.metadata-item {
    display: flex;
    gap: 6px;
}

.metadata-item .meta-label {
    opacity: 0.7;
}

.metadata-item .meta-value {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-editor-foreground);
}

/* ── Focus & keyboard navigation ──────────────────────── */

a:focus-visible,
button:focus-visible,
[tabindex]:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 2px;
    border-radius: 2px;
    transition: outline-offset var(--transition-speed) ease;
}

/* ── Responsive ───────────────────────────────────────── */

@media (max-width: 480px) {
    .card-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .card-footer {
        flex-direction: column;
        align-items: flex-start;
    }

    .metadata-grid {
        grid-template-columns: 1fr;
    }
}
`;
