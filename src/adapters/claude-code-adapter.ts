import * as vscode from 'vscode';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from './types.js';

/** Claude Code extension ID in the VS Code marketplace */
const EXTENSION_ID = 'anthropic.claude-code';

/** Command exposed by Claude Code to open a session editor tab */
const OPEN_SESSION_COMMAND = 'claude-vscode.editor.open';

/** ViewType substring used by Claude Code webview panels in tab groups */
const WEBVIEW_VIEW_TYPE = 'claudeVSCodePanel';

/**
 * Claude Code harness adapter.
 *
 * Encapsulates ALL Claude Code–specific knowledge:
 * - Extension detection via `anthropic.claude-code`
 * - Session opening via `claude-vscode.editor.open`
 * - Tab detection via `claudeVSCodePanel` viewType
 *
 * No other module should reference these Claude Code–specific identifiers.
 */
export class ClaudeCodeAdapter implements HarnessAdapter {
    readonly name = 'Claude Code';
    readonly extensionId = EXTENSION_ID;

    readonly capabilities: HarnessCapabilities = {
        canOpenSessions: true,
        canDetectTabs: true,
        hasPreToolUseHook: true,
        hasStopHook: true,
        canInjectMessages: false,
    };

    get isAvailable(): boolean {
        return vscode.extensions.getExtension(EXTENSION_ID) !== undefined;
    }

    get isInstalled(): boolean {
        // For VS Code extensions, installed == available in the extensions list.
        // A more nuanced check could distinguish activated vs. not, but
        // getExtension returns the extension if installed regardless of activation.
        return vscode.extensions.getExtension(EXTENSION_ID) !== undefined;
    }

    async openSession(sessionId: string): Promise<void> {
        // Feature-detect the command before invoking
        const commands = await vscode.commands.getCommands(true);
        if (!commands.includes(OPEN_SESSION_COMMAND)) {
            throw new Error(
                'Claude Code extension is required to open sentinel chat. '
                + 'Install it from the VS Code marketplace.',
            );
        }

        await vscode.commands.executeCommand(OPEN_SESSION_COMMAND, sessionId);
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        const sessions: SessionInfo[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (this.isHarnessTab(tab)) {
                    sessions.push({
                        sessionId: this.getSessionIdFromTab(tab) ?? '',
                        label: tab.label,
                    });
                }
            }
        }
        return sessions;
    }

    isHarnessTab(tab: vscode.Tab): boolean {
        const input = tab.input;
        if (input && typeof input === 'object' && 'viewType' in input
            && typeof (input as Record<string, unknown>).viewType === 'string') {
            const viewType = (input as { viewType: string }).viewType;
            return viewType.includes(WEBVIEW_VIEW_TYPE);
        }
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        // Claude Code does not currently expose the session ID in tab metadata.
        // The session correlator uses other signals (cache, transcript activity,
        // title matching) to map tabs to session IDs.
        return undefined;
    }
}
