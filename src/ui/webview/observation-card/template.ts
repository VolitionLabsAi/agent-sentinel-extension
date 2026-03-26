/**
 * HTML template for the observation card webview document.
 *
 * Produces a complete HTML document with Content Security Policy,
 * nonce-based script allowance, and a message handler for live updates.
 */

import { OBSERVATION_CARD_STYLES } from './styles.js';

/**
 * Build the full HTML document for the observation card webview.
 *
 * @param cardHtml  Pre-rendered card HTML from ObservationRenderer
 * @param nonce     Cryptographic nonce for CSP script allowance
 * @returns Complete HTML string suitable for WebviewPanel.webview.html
 */
export function buildObservationCardHtml(cardHtml: string, nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Sentinel Observation</title>
    <style>${OBSERVATION_CARD_STYLES}</style>
</head>
<body>
    <main id="card-root" role="article" aria-label="Sentinel observation details">
        ${cardHtml}
    </main>
    <script nonce="${nonce}">
        (function () {
            const vscode = acquireVsCodeApi();
            const root = document.getElementById('card-root');

            window.addEventListener('message', function (event) {
                const message = event.data;
                if (message.type === 'updateCard' && message.html && root) {
                    root.innerHTML = message.html;
                }
            });
        })();
    </script>
</body>
</html>`;
}
