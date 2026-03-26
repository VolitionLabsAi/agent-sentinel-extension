/**
 * HTML template for the Sentinel Conversation Panel sidebar webview.
 *
 * Displays sentinel status, active sentinels, recent observations,
 * and a quick input area for sending messages.
 *
 * Communicates with the extension host via postMessage.
 */

import { SENTINEL_PANEL_STYLES } from './styles.js';

/**
 * Build the full HTML document for the sentinel conversation panel webview.
 *
 * @param nonce - Cryptographic nonce for CSP script allowance
 * @param cspSource - The webview CSP source (`webview.cspSource`)
 * @returns Complete HTML string for WebviewViewProvider.resolveWebviewView
 */
export function buildSentinelPanelHtml(nonce: string, cspSource: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">${SENTINEL_PANEL_STYLES}</style>
</head>
<body>
    <div id="panel-root" role="region" aria-label="Sentinel Conversation Panel">

        <!-- Status Badge -->
        <div class="status-section" aria-live="polite" aria-atomic="true">
            <span class="status-badge stopped" id="status-badge" role="status">
                <span class="status-dot" aria-hidden="true"></span>
                <span id="status-text">No Sentinels</span>
            </span>
        </div>

        <!-- Context Stats -->
        <div class="context-stats" role="group" aria-label="Monitoring context">
            <div class="stat-card" tabindex="0" aria-label="Active evals">
                <span class="stat-value" id="eval-count">0</span>
                <span class="stat-label">Active Evals</span>
            </div>
            <div class="stat-card" tabindex="0" aria-label="Observations">
                <span class="stat-value" id="obs-count">0</span>
                <span class="stat-label">Observations</span>
            </div>
            <div class="stat-card" tabindex="0" aria-label="Active sentinels">
                <span class="stat-value" id="sentinel-count">0</span>
                <span class="stat-label">Sentinels</span>
            </div>
            <div class="stat-card" tabindex="0" aria-label="Monitoring duration">
                <span class="stat-value" id="duration">--</span>
                <span class="stat-label">Duration</span>
            </div>
        </div>

        <!-- Active Sentinels List -->
        <div id="sentinels-section" style="display: none;">
            <div class="section-header">Active Sentinels</div>
            <ul class="sentinel-list" id="sentinel-list" aria-label="Active sentinel instances"></ul>
        </div>

        <!-- Recent Observations -->
        <div id="observations-section" style="display: none;">
            <div class="section-header">Recent Observations</div>
            <ul class="observation-list" id="observation-list" aria-label="Recent observations" aria-live="polite"></ul>
        </div>

        <!-- Quick Input -->
        <div class="quick-input-section">
            <div class="input-row">
                <input type="text" class="quick-input" id="quick-input"
                       placeholder="Send a message to sentinel..."
                       aria-label="Quick message to sentinel" />
                <button class="send-btn" id="send-btn" disabled
                        aria-label="Send message">Send</button>
            </div>
            <ul class="messages-list" id="messages-list" aria-label="Sent messages" aria-live="polite"></ul>
        </div>

        <!-- Open Full Conversation -->
        <button class="open-chat-btn" id="open-chat-btn"
                aria-label="Open full sentinel conversation">
            Open Full Conversation
        </button>

        <!-- Limitation notice (shown when harness unavailable) -->
        <div class="limitation-notice" id="limitation-notice" style="display: none;">
            Claude Code extension not detected. Quick input is available as the primary
            interaction mode. Install Claude Code for full conversation support.
        </div>
    </div>

    <script nonce="${nonce}">
        (function () {
            var vscode = acquireVsCodeApi();

            // DOM refs
            var quickInput = document.getElementById('quick-input');
            var sendBtn = document.getElementById('send-btn');
            var messagesList = document.getElementById('messages-list');
            var openChatBtn = document.getElementById('open-chat-btn');
            var statusBadge = document.getElementById('status-badge');
            var statusText = document.getElementById('status-text');
            var evalCount = document.getElementById('eval-count');
            var obsCount = document.getElementById('obs-count');
            var sentinelCount = document.getElementById('sentinel-count');
            var durationEl = document.getElementById('duration');
            var sentinelsSection = document.getElementById('sentinels-section');
            var sentinelList = document.getElementById('sentinel-list');
            var observationsSection = document.getElementById('observations-section');
            var observationList = document.getElementById('observation-list');
            var limitationNotice = document.getElementById('limitation-notice');

            // Enable/disable send
            quickInput.addEventListener('input', function () {
                sendBtn.disabled = quickInput.value.trim().length === 0;
            });

            // Send on Enter
            quickInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !sendBtn.disabled) {
                    sendMessage();
                }
            });

            sendBtn.addEventListener('click', function () {
                sendMessage();
            });

            function sendMessage() {
                var text = quickInput.value.trim();
                if (!text) return;

                vscode.postMessage({ type: 'quickMessage', text: text });
                quickInput.value = '';
                sendBtn.disabled = true;
            }

            openChatBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'openChat' });
            });

            function escapeHtml(str) {
                return str
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            function formatTime(iso) {
                if (!iso) return '';
                try {
                    var d = new Date(iso);
                    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                } catch (_) {
                    return '';
                }
            }

            function formatDuration(ms) {
                if (!ms || ms < 0) return '--';
                var sec = Math.floor(ms / 1000);
                if (sec < 60) return sec + 's';
                var min = Math.floor(sec / 60);
                if (min < 60) return min + 'm';
                var hr = Math.floor(min / 60);
                return hr + 'h ' + (min % 60) + 'm';
            }

            // Messages from extension host
            window.addEventListener('message', function (event) {
                var msg = event.data;

                if (msg.type === 'update') {
                    // Update status badge
                    var running = msg.sentinelCount > 0;
                    statusBadge.className = 'status-badge ' + (running ? 'running' : 'stopped');
                    statusText.textContent = running
                        ? msg.sentinelCount + ' Sentinel' + (msg.sentinelCount > 1 ? 's' : '') + ' Active'
                        : 'No Sentinels';

                    // Update stats
                    evalCount.textContent = String(msg.evalCount || 0);
                    obsCount.textContent = String(msg.observationCount || 0);
                    sentinelCount.textContent = String(msg.sentinelCount || 0);
                    durationEl.textContent = formatDuration(msg.durationMs);

                    // Update sentinel list
                    if (msg.sentinels && msg.sentinels.length > 0) {
                        sentinelsSection.style.display = '';
                        sentinelList.innerHTML = msg.sentinels.map(function (s) {
                            return '<li class="sentinel-item">' +
                                '<span class="sentinel-name">' + escapeHtml(s.name) + '</span>' +
                                '<span class="sentinel-session">' + escapeHtml(s.sessionId.slice(0, 8)) + '...</span>' +
                                '</li>';
                        }).join('');
                    } else {
                        sentinelsSection.style.display = 'none';
                    }

                    // Update recent observations
                    if (msg.recentObservations && msg.recentObservations.length > 0) {
                        observationsSection.style.display = '';
                        observationList.innerHTML = msg.recentObservations.map(function (o) {
                            return '<li class="observation-item ' + escapeHtml(o.severity) + '">' +
                                '<span class="observation-severity">' + escapeHtml(o.severity) + '</span> ' +
                                '<span class="observation-time">' + formatTime(o.timestamp) + '</span>' +
                                '<span class="observation-text">' + escapeHtml(o.oneLiner || '') + '</span>' +
                                '</li>';
                        }).join('');
                    } else {
                        observationsSection.style.display = 'none';
                    }

                    // Harness availability
                    if (msg.harnessAvailable === false) {
                        limitationNotice.style.display = '';
                    } else {
                        limitationNotice.style.display = 'none';
                    }
                }

                if (msg.type === 'messageSent') {
                    // Append to local messages list
                    var li = document.createElement('li');
                    li.className = 'message-item';
                    li.innerHTML = '<span class="message-time">' + formatTime(msg.timestamp) + '</span>' +
                        escapeHtml(msg.text);
                    messagesList.appendChild(li);
                    messagesList.scrollTop = messagesList.scrollHeight;
                }
            });
        })();
    </script>
</body>
</html>`;
}
