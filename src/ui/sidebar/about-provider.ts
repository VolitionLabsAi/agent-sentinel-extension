import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class AboutProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sentinel.about';

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
        };

        // Get version from package.json
        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        const version = ext?.packageJSON?.version ?? '0.0.0';

        const nonce = crypto.randomBytes(16).toString('hex');

        webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-descriptionForeground);
            padding: 8px 12px;
            line-height: 1.6;
            margin: 0;
        }
        .about-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 2px 0;
        }
        .about-row a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .about-row a:hover {
            text-decoration: underline;
        }
        .version {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .separator {
            border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, transparent));
            margin: 4px 0;
        }
    </style>
</head>
<body>
    <div class="about-row version">Agent Sentinel v${version}</div>
    <div class="separator"></div>
    <div class="about-row"><a id="settings" href="#">Settings</a></div>
    <div class="about-row"><a id="docs" href="#">Documentation</a></div>
    <div class="about-row"><a id="health" href="#">Run Health Check</a></div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            document.getElementById('settings').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'openSettings' });
            });
            document.getElementById('docs').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'openDocs' });
            });
            document.getElementById('health').addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ type: 'runHealthCheck' });
            });
        })();
    </script>
</body>
</html>`;

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
            }
        });
    }
}
