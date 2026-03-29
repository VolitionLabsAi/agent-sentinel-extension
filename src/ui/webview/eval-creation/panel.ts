/**
 * WebviewPanel manager for the eval creation flow.
 *
 * Hosts a two-step creation flow: describe → preview/edit/save.
 * Communicates with the webview via postMessage for all state transitions.
 * Panel is singleton — calling show() reveals the existing panel or creates a new one.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { buildEvalCreationHtml } from './template.js';
import { generateEvalFromDescription, saveEval } from '../../../evals/eval-creator.js';
import type { WebviewToHostMessage, HostToWebviewMessage } from '../../../types/eval-creation.js';
import type { EvalSeverity } from '../../../types/eval-rule.js';

const VIEW_TYPE = 'sentinel.evalCreation';

export class EvalCreationPanel {
    private panel: vscode.WebviewPanel | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * Show the eval creation panel.
     *
     * If a panel already exists, it is revealed. Otherwise a new one is created.
     *
     * @param projectDir - Absolute path to the workspace/project root, used for saving
     */
    show(projectDir: string): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One, true);
            // Reset the webview HTML to clear stale Step 2 state
            const nonce = crypto.randomBytes(16).toString('hex');
            this.panel.webview.html = buildEvalCreationHtml(nonce);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Create Eval Rule',
            { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri],
            },
        );

        const nonce = crypto.randomBytes(16).toString('hex');
        this.panel.webview.html = buildEvalCreationHtml(nonce);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (message: WebviewToHostMessage) => this.handleMessage(message, projectDir),
            null,
            this.disposables,
        );

        this.panel.onDidDispose(() => this.onPanelDisposed(), null, this.disposables);
    }

    /**
     * Dispose of the panel and all associated resources.
     */
    dispose(): void {
        this.panel?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── Private ──────────────────────────────────────────

    private async handleMessage(message: WebviewToHostMessage, projectDir: string): Promise<void> {
        switch (message.type) {
            case 'generate':
                this.handleGenerate(message.description, message.domain, message.severity);
                break;

            case 'save':
                await this.handleSave(message.yaml, message.filePath, projectDir);
                break;

            case 'discard':
                this.panel?.dispose();
                break;

            case 'editYaml':
                // The webview handles edit mode internally; this message type
                // exists for future use (e.g., validation on the host side).
                break;
        }
    }

    private handleGenerate(description: string, domain: string, severity: EvalSeverity): void {
        try {
            const result = generateEvalFromDescription({ description, domain, severity });

            this.postMessage({
                type: 'preview',
                yaml: result.yaml,
                filePath: result.filePath,
                evalId: result.id,
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error generating eval';
            this.postMessage({ type: 'error', message: errorMessage });
        }
    }

    private async handleSave(yaml: string, filePath: string, projectDir: string): Promise<void> {
        try {
            const absolutePath = await saveEval(yaml, filePath, projectDir);

            this.postMessage({ type: 'saved', filePath });

            // Open the saved file in the editor
            const doc = await vscode.workspace.openTextDocument(absolutePath);
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });

            // Show a brief notification
            void vscode.window.showInformationMessage(
                `Eval rule saved. Sentinel will pick it up on next trigger.`,
            );
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error saving eval';
            this.postMessage({ type: 'error', message: errorMessage });
        }
    }

    private postMessage(message: HostToWebviewMessage): void {
        void this.panel?.webview.postMessage(message);
    }

    private onPanelDisposed(): void {
        this.panel = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
