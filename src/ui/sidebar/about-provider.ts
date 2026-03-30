import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { ViewMode } from './observations-provider.js';
import type { SessionCorrelator } from '../../correlation/session-correlator.js';
import type { StateManager } from '../../stores/state-manager.js';

/** Minimal interface for the observations provider fields we need. */
interface ObservationsProviderLike {
    getSessionFilter(): string | undefined;
}

export class AboutProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sentinel.about';

    private webviewView: vscode.WebviewView | undefined;
    private filterMode: ViewMode = 'all';
    private filterDetail = '';
    private lastEvalTimestamp: string | undefined;

    constructor(private readonly extensionUri: vscode.Uri) {}

    /** Update the last-eval timestamp shown in the status pill. */
    updateLastEvalTime(timestamp: string | undefined): void {
        this.lastEvalTimestamp = timestamp;
        this.pushStateToWebview();
    }

    /**
     * Called by extension.ts whenever the filter mode changes.
     * Resolves session title asynchronously and pushes update to the webview.
     */
    async updateFilterState(
        mode: ViewMode,
        observations: ObservationsProviderLike,
        correlator: SessionCorrelator,
        stateMgr: StateManager,
    ): Promise<void> {
        this.filterMode = mode;
        this.filterDetail = '';

        if (mode === 'recent') {
            try {
                const result = correlator.getCurrentSession();
                if (result) {
                    const session = stateMgr.getSession(result.sessionId);
                    let title: string | null = session?.title ?? null;
                    if (!title && session?.transcript_path) {
                        title = await correlator.extractSessionTitle(session.transcript_path);
                    }
                    if (title) {
                        const truncated = title.length > 40 ? title.slice(0, 37) + '...' : title;
                        this.filterDetail = truncated;
                    } else {
                        this.filterDetail = result.sessionId.slice(0, 8);
                    }
                }
            } catch {
                // ignore
            }
        } else if (mode === 'pinned') {
            const filter = observations.getSessionFilter();
            if (filter) {
                try {
                    const session = stateMgr.getSession(filter);
                    let title: string | null = session?.title ?? null;
                    if (!title && session?.transcript_path) {
                        title = await correlator.extractSessionTitle(session.transcript_path);
                    }
                    if (title) {
                        const truncated = title.length > 40 ? title.slice(0, 37) + '...' : title;
                        this.filterDetail = truncated;
                    } else {
                        this.filterDetail = filter.slice(0, 8);
                    }
                } catch {
                    this.filterDetail = filter.slice(0, 8);
                }
            }
        }

        this.pushStateToWebview();
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
        };

        this.renderHtml();

        webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
            switch (msg.type) {
                case 'openSettings':
                    void vscode.commands.executeCommand('sentinel.openSettings');
                    break;
                case 'openDocs':
                    void vscode.commands.executeCommand(
                        'workbench.action.openWalkthrough',
                        'volition.agent-sentinel#sentinel-setup',
                        false,
                    );
                    break;
                case 'runHealthCheck':
                    void vscode.commands.executeCommand('sentinel.runHealthCheck');
                    break;
                case 'changeFilter':
                    void vscode.commands.executeCommand('sentinel.setViewMode');
                    break;
            }
        });

        // Push current state in case it was set before the webview was ready
        this.pushStateToWebview();
    }

    private pushStateToWebview(): void {
        if (!this.webviewView) {
            return;
        }
        void this.webviewView.webview.postMessage({
            type: 'updateFilter',
            mode: this.filterMode,
            detail: this.filterDetail,
            lastEvalTimestamp: this.lastEvalTimestamp,
        });
    }

    private renderHtml(): void {
        if (!this.webviewView) {
            return;
        }

        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        const version = ext?.packageJSON?.version ?? '0.0.0';
        const nonce = crypto.randomBytes(16).toString('hex');

        const modeLabels: Record<string, string> = {
            all: 'All Sessions',
            recent: 'Recent Session',
            pinned: 'Pinned Session',
        };
        const initialModeLabel = modeLabels[this.filterMode] ?? 'All Sessions';
        const initialDetail = this.filterDetail;

        this.webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 4px 12px 6px;
            margin: 0;
            line-height: 1.4;
        }
        .header-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 1px 0;
        }
        .filter-row {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 0;
        }
        .filter-label {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .filter-value {
            font-weight: 500;
        }
        .filter-detail {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
            font-size: 0.9em;
        }
        a:hover { text-decoration: underline; }
        .links {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 2px 0;
        }
        .separator {
            color: var(--vscode-descriptionForeground);
            opacity: 0.5;
        }
        .version {
            color: var(--vscode-descriptionForeground);
            font-size: 0.8em;
        }
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-bottom: 4px;
            background: var(--vscode-badge-background, transparent);
            color: var(--vscode-badge-foreground, var(--vscode-foreground));
        }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .status-dot.fresh  { background: var(--vscode-testing-iconPassed, #388a34); }
        .status-dot.recent { background: var(--vscode-editorWarning-foreground, #ff9800); }
        .status-dot.stale  { background: var(--vscode-disabledForeground, #888); }
    </style>
</head>
<body>
    <div class="status-pill" id="status-pill" style="display:none">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Last eval --</span>
    </div>
    <div class="filter-row">
        <span class="filter-label">Viewing:</span>
        <span class="filter-value" id="mode">${initialModeLabel}</span>
        <span class="separator">|</span>
        <a id="changeFilter" href="#">Change</a>
    </div>
    <div class="filter-row" id="detail-row" style="${initialDetail ? '' : 'display:none'}">
        <span class="filter-detail" id="detail">${initialDetail}</span>
    </div>
    <div class="links">
        <a id="settings" href="#">Settings</a>
        <span class="separator">&middot;</span>
        <a id="health" href="#">Health Check</a>
        <span class="separator">&middot;</span>
        <a id="docs" href="#">Docs</a>
        <span class="separator">&middot;</span>
        <span class="version">v${version}</span>
    </div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const modeLabels = { all: 'All Sessions', recent: 'Recent Session', pinned: 'Pinned Session' };

            var lastTimestamp = null;
            function updateStatusPill(timestamp) {
                lastTimestamp = timestamp;
                var pill = document.getElementById('status-pill');
                if (!timestamp) { pill.style.display = 'none'; return; }
                pill.style.display = '';
                var elapsed = Date.now() - new Date(timestamp).getTime();
                var seconds = Math.floor(elapsed / 1000);
                var text, colorClass;
                if (seconds < 60) { text = seconds + 's ago'; }
                else if (seconds < 3600) { text = Math.floor(seconds / 60) + 'm ago'; }
                else { text = Math.floor(seconds / 3600) + 'h ago'; }
                if (seconds < 120) { colorClass = 'fresh'; }
                else if (seconds < 600) { colorClass = 'recent'; }
                else { colorClass = 'stale'; }
                document.getElementById('status-text').textContent = 'Last eval ' + text;
                document.getElementById('status-dot').className = 'status-dot ' + colorClass;
            }
            setInterval(function() { if (lastTimestamp) { updateStatusPill(lastTimestamp); } }, 30000);

            window.addEventListener('message', function(event) {
                const msg = event.data;
                if (msg.type === 'updateFilter') {
                    document.getElementById('mode').textContent = modeLabels[msg.mode] || msg.mode;
                    const detailRow = document.getElementById('detail-row');
                    const detailEl = document.getElementById('detail');
                    if (msg.detail) {
                        detailEl.textContent = msg.detail;
                        detailRow.style.display = '';
                    } else {
                        detailRow.style.display = 'none';
                    }
                    updateStatusPill(msg.lastEvalTimestamp || null);
                }
            });

            document.getElementById('changeFilter').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'changeFilter' });
            });
            document.getElementById('settings').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'openSettings' });
            });
            document.getElementById('health').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'runHealthCheck' });
            });
            document.getElementById('docs').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'openDocs' });
            });
        })();
    </script>
</body>
</html>`;
    }
}
