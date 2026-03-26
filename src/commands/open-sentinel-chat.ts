import * as vscode from 'vscode';
import { StateManager, SentinelSessionInfo } from '../stores/state-manager.js';
import { HarnessAdapterRegistry } from '../adapters/adapter-registry.js';

/**
 * Opens a sentinel's sidechain session as an editor tab in VS Code.
 *
 * If multiple sentinels are active (e.g. GEN, SEC), presents a QuickPick
 * for the user to choose. If only one sentinel exists, opens it directly.
 *
 * Uses the harness adapter registry to open the session, allowing future
 * support for harnesses beyond Claude Code.
 */
export async function openSentinelChat(
    stateManager: StateManager,
    adapterRegistry: HarnessAdapterRegistry,
): Promise<void> {
    // Check that a harness adapter is available
    const adapter = adapterRegistry.getAvailable();
    if (!adapter) {
        void vscode.window.showErrorMessage(
            'Claude Code extension is required to open sentinel chat.',
        );
        return;
    }

    // Get all sentinel sessions from state
    const sentinelSessions = stateManager.getSentinelSessions();

    if (sentinelSessions.length === 0) {
        void vscode.window.showInformationMessage(
            'No active sentinel session. Start monitoring with \'vl sentinel start\'.',
        );
        return;
    }

    let selected: SentinelSessionInfo;

    if (sentinelSessions.length === 1) {
        // Only one sentinel — open directly
        selected = sentinelSessions[0];
    } else {
        // Multiple sentinels — let the user choose
        const items = sentinelSessions.map(s => ({
            label: s.name,
            description: `Session: ${s.sentinelSessionId.slice(0, 8)}...`,
            detail: s.startedAt
                ? `Started: ${new Date(s.startedAt).toLocaleString()}`
                : undefined,
            session: s,
        }));

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a sentinel to open',
            title: 'Open Sentinel Chat',
        });

        if (!pick) {
            return; // User cancelled
        }

        selected = pick.session;
    }

    try {
        await adapter.openSession(selected.sentinelSessionId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
            `Failed to open sentinel chat: ${message}`,
        );
    }
}
