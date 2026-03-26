/**
 * WebviewPanel manager for observation card details.
 *
 * Creates or reveals a single editor-area panel that renders a rich observation
 * card. Panel content updates in place when a different observation is selected.
 * Context is retained when the panel is hidden (tab switch) so users don't lose state.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { PersistentObservation } from '../../types/observation.js';
import { renderCard } from './observation-renderer.js';
import { buildObservationCardHtml } from './observation-card/template.js';

const VIEW_TYPE = 'sentinel.observationCard';

export class ObservationCardPanel {
    private panel: vscode.WebviewPanel | undefined;
    private currentObservation: PersistentObservation | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * Show an observation as a rich card in the editor area.
     *
     * If a panel already exists it is revealed and its content updated.
     * Otherwise a new panel is created.
     */
    show(observation: PersistentObservation): void {
        this.currentObservation = observation;

        const title = `[${observation.severity.toUpperCase()}] ${observation.eval_id}`;

        if (this.panel) {
            this.panel.title = title;
            this.panel.reveal(undefined, true);
            this.updateContent(observation);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            title,
            { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri],
            },
        );

        this.updateContent(observation);

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

    /**
     * Return the currently displayed observation, if any.
     */
    get observation(): PersistentObservation | undefined {
        return this.currentObservation;
    }

    // ── Private ──────────────────────────────────────────

    private updateContent(observation: PersistentObservation): void {
        if (!this.panel) { return; }

        const nonce = crypto.randomBytes(16).toString('hex');
        const cardHtml = renderCard(observation);
        this.panel.webview.html = buildObservationCardHtml(cardHtml, nonce);
    }

    private onPanelDisposed(): void {
        this.panel = undefined;
        this.currentObservation = undefined;
    }
}
