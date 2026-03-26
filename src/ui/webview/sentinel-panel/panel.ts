/**
 * WebviewViewProvider for the Sentinel Conversation Panel.
 *
 * Sidebar panel that shows sentinel status, active sentinels, recent observations,
 * and a quick input area. Wraps sentinel interaction for at-a-glance monitoring.
 *
 * Updates automatically when observations or state change.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { buildSentinelPanelHtml } from './template.js';
import { ObservationStore } from '../../../stores/observation-store.js';
import { StateManager } from '../../../stores/state-manager.js';
import { ConfigManager } from '../../../stores/config-manager.js';
import { HarnessAdapterRegistry } from '../../../adapters/adapter-registry.js';
import { writeSteeringInstruction } from '../../../commands/steer-sentinel.js';

/** Quick message stored in-memory for display in the panel. */
export interface QuickMessage {
    text: string;
    timestamp: string;
}

/**
 * Sentinel Conversation Panel — sidebar webview showing sentinel status,
 * recent observations, and quick messaging.
 */
export class SentinelConversationPanel implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'sentinel.conversationPanel';

    private view: vscode.WebviewView | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly quickMessages: QuickMessage[] = [];

    constructor(
        private readonly observationStore: ObservationStore,
        private readonly stateManager: StateManager,
        private readonly configManager: ConfigManager,
        private readonly adapterRegistry: HarnessAdapterRegistry,
    ) {
        // Re-render when observations change
        this.disposables.push(
            observationStore.onObservationReceived(() => this.update()),
        );

        // Re-render when state changes (sentinel sessions)
        this.disposables.push(
            stateManager.onSessionsChanged(() => this.update()),
        );
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        const nonce = crypto.randomBytes(16).toString('hex');
        webviewView.webview.html = buildSentinelPanelHtml(nonce, webviewView.webview.cspSource);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            null,
            this.disposables,
        );

        // Re-send data when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.update();
            }
        }, null, this.disposables);

        // Initial data push
        this.update();
    }

    /** Get the stored quick messages. */
    getQuickMessages(): ReadonlyArray<QuickMessage> {
        return this.quickMessages;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── Private ──────────────────────────────────────────

    private update(): void {
        if (!this.view?.visible) {
            return;
        }

        const sentinelSessions = this.stateManager.getSentinelSessions();
        const observations = this.observationStore.getObservations();
        const evalRules = this.configManager.getEvalRules();
        const harnessAvailable = this.adapterRegistry.getAvailable() !== undefined;

        // Recent observations (last 5)
        const recentObservations = observations
            .slice(-5)
            .reverse()
            .map(o => ({
                severity: o.severity ?? 'info',
                oneLiner: o.one_liner ?? o.eval_id ?? '',
                timestamp: o.timestamp,
            }));

        // Compute monitoring duration from earliest sentinel start
        let durationMs: number | undefined;
        if (sentinelSessions.length > 0) {
            const starts = sentinelSessions
                .filter(s => s.startedAt)
                .map(s => new Date(s.startedAt!).getTime());
            if (starts.length > 0) {
                const earliest = Math.min(...starts);
                durationMs = Date.now() - earliest;
            }
        }

        this.view.webview.postMessage({
            type: 'update',
            sentinelCount: sentinelSessions.length,
            evalCount: evalRules.length,
            observationCount: observations.length,
            durationMs: durationMs ?? -1,
            harnessAvailable,
            sentinels: sentinelSessions.map(s => ({
                name: s.name,
                sessionId: s.sentinelSessionId,
            })),
            recentObservations,
        });
    }

    private handleMessage(msg: { type: string; text?: string }): void {
        switch (msg.type) {
            case 'openChat':
                void vscode.commands.executeCommand('sentinel.openSentinelChat');
                break;

            case 'quickMessage':
                if (msg.text) {
                    const quickMsg: QuickMessage = {
                        text: msg.text,
                        timestamp: new Date().toISOString(),
                    };
                    this.quickMessages.push(quickMsg);

                    // Persist to steering JSONL for sentinel consumption
                    const sessions = this.stateManager.getSentinelSessions();
                    const sessionId = sessions.length > 0 ? sessions[0].parentSessionId : undefined;
                    void writeSteeringInstruction({
                        action: 'custom',
                        instruction: msg.text,
                        timestamp: quickMsg.timestamp,
                        session_id: sessionId,
                    });

                    // Echo back to webview
                    this.view?.webview.postMessage({
                        type: 'messageSent',
                        text: quickMsg.text,
                        timestamp: quickMsg.timestamp,
                    });

                    void vscode.window.showInformationMessage(
                        `Sentinel message queued: "${msg.text.slice(0, 50)}${msg.text.length > 50 ? '...' : ''}"`,
                    );
                }
                break;
        }
    }
}
