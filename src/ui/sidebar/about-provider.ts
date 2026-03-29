import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { ViewMode } from './live-feed-provider.js';
import type { SessionCorrelator } from '../../correlation/session-correlator.js';
import type { StateManager } from '../../stores/state-manager.js';

/** Minimal interface for the live-feed provider fields we need. */
interface LiveFeedProviderLike {
    getSessionFilter(): string | undefined;
}

export class AboutProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sentinel.about';

    private webviewView: vscode.WebviewView | undefined;
    private filterMode: ViewMode = 'all';
    private filterDetail = '';

    constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * Called by extension.ts whenever the filter mode changes.
     * Resolves session title asynchronously and pushes update to the webview.
     */
    async updateFilterState(
        mode: ViewMode,
        liveFeed: LiveFeedProviderLike,
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
            const filter = liveFeed.getSessionFilter();
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
    </style>
</head>
<body>
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
