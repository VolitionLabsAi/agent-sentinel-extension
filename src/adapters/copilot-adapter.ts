import * as vscode from 'vscode';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from './types.js';

/** GitHub Copilot Chat extension ID in the VS Code marketplace */
const EXTENSION_ID = 'github.copilot-chat';

/** Copilot base extension ID (required dependency) */
const COPILOT_BASE_EXTENSION_ID = 'github.copilot';

/** ViewType for Copilot Chat panels — VS Code's built-in chat view */
const CHAT_VIEW_TYPE = 'workbench.panel.chat';

/**
 * GitHub Copilot harness adapter.
 *
 * Encapsulates ALL Copilot-specific knowledge:
 * - Extension detection via `github.copilot-chat` (primary) and `github.copilot` (base)
 * - Tab detection via VS Code's built-in chat panel viewType
 * - Hook support via VS Code agent hooks (Preview)
 *
 * Copilot agent mode uses VS Code's native agent hook system, which supports
 * PreToolUse with deny/ask/allow decisions, PostToolUse, and six other lifecycle
 * events. The hook system is in Preview and reads `.claude/settings.json` for
 * cross-harness compatibility.
 *
 * No other module should reference these Copilot-specific identifiers.
 */
export class CopilotAdapter implements HarnessAdapter {
    readonly name = 'GitHub Copilot';
    readonly extensionId = EXTENSION_ID;

    readonly capabilities: HarnessCapabilities = {
        canOpenSessions: false,    // No documented command to open a specific session by ID
        canDetectTabs: true,       // Can detect VS Code chat panel tabs
        hasPreToolUseHook: true,   // VS Code agent hooks PreToolUse (Preview)
        hasStopHook: true,         // VS Code agent hooks Stop event
        canInjectMessages: false,
    };

    get isAvailable(): boolean {
        return vscode.extensions.getExtension(EXTENSION_ID) !== undefined ||
            vscode.extensions.getExtension(COPILOT_BASE_EXTENSION_ID) !== undefined;
    }

    get isInstalled(): boolean {
        return vscode.extensions.getExtension(EXTENSION_ID) !== undefined ||
            vscode.extensions.getExtension(COPILOT_BASE_EXTENSION_ID) !== undefined;
    }

    async openSession(_sessionId: string): Promise<void> {
        // Copilot does not expose a command to open a specific session by ID.
        // Sessions are managed through VS Code's Chat view (time-grouped list).
        throw new Error(
            'GitHub Copilot does not support opening sessions by ID. '
            + 'Use the Chat view sidebar to browse session history.',
        );
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        // Copilot sessions live in VS Code's internal workspaceStorage.
        // No public API to enumerate them programmatically.
        return [];
    }

    isHarnessTab(tab: vscode.Tab): boolean {
        const input = tab.input;
        if (input && typeof input === 'object' && 'viewType' in input) {
            const viewType = (input as { viewType: string }).viewType;
            return viewType.includes(CHAT_VIEW_TYPE);
        }
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        // Copilot does not expose session IDs in tab metadata.
        return undefined;
    }
}
