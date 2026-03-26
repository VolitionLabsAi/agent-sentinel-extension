import * as vscode from 'vscode';
import * as cp from 'child_process';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from './types.js';

/** Gemini CLI Companion extension ID in the VS Code marketplace */
const EXTENSION_ID = 'Google.gemini-cli-vscode-ide-companion';

/** Binary name for Gemini CLI */
const BINARY_NAME = 'gemini';

/**
 * Gemini CLI harness adapter.
 *
 * Encapsulates ALL Gemini CLI-specific knowledge:
 * - CLI binary detection via `gemini` on PATH
 * - VS Code companion extension detection via `Google.gemini-cli-vscode-ide-companion`
 * - Session storage at `~/.gemini/tmp/<hash>/chats/`
 *
 * Gemini CLI has the most mature hook system of the three non-Claude harnesses,
 * with BeforeTool (blocking), AfterTool, BeforeAgent, AfterAgent, BeforeModel,
 * AfterModel, SessionStart, SessionEnd, and more — 11 events total, enabled by
 * default since v0.26.0+.
 *
 * No other module should reference these Gemini CLI-specific identifiers.
 */
export class GeminiCLIAdapter implements HarnessAdapter {
    readonly name = 'Gemini CLI';
    readonly extensionId = EXTENSION_ID;

    readonly capabilities: HarnessCapabilities = {
        canOpenSessions: false,   // Companion extension has no session-open command
        canDetectTabs: false,     // Gemini CLI runs in integrated terminal, no webview panels
        hasPreToolUseHook: true,  // BeforeTool with deny/block/modify capabilities
        hasStopHook: true,        // SessionEnd lifecycle hook
        canInjectMessages: false,
    };

    private binaryResolved: boolean | undefined;

    /**
     * Whether this adapter can perform its declared capabilities right now.
     * Requires the CLI binary on PATH — the companion extension alone is a
     * thin bridge for workspace context and does not provide hook capabilities.
     */
    get isAvailable(): boolean {
        // Return cached async result if available; false until detectAvailability resolves
        return this.binaryResolved ?? false;
    }

    /**
     * Whether the user has Gemini CLI installed.
     * Requires the CLI binary on PATH — the companion extension alone does not
     * make Gemini CLI usable as a harness.
     */
    get isInstalled(): boolean {
        return this.binaryResolved ?? false;
    }

    /**
     * Asynchronously detect whether the `gemini` binary is on PATH.
     * Called during extension activation; caches the result for synchronous
     * `isAvailable` access afterward.
     */
    async detectAvailability(): Promise<void> {
        this.binaryResolved = await this.checkBinaryAsync();
    }

    async openSession(_sessionId: string): Promise<void> {
        // Gemini CLI companion extension does not expose a session-open command.
        // Sessions are resumed via `gemini --resume <UUID>` in the terminal.
        throw new Error(
            'Gemini CLI does not support opening sessions from VS Code. '
            + 'Use `gemini --resume <session-id>` in the terminal.',
        );
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        // Gemini CLI sessions are stored on disk at ~/.gemini/tmp/<hash>/chats/
        // but require parsing project-specific hashed directories.
        // For now, return empty — session detection requires deeper filesystem scanning.
        return [];
    }

    isHarnessTab(_tab: vscode.Tab): boolean {
        // Gemini CLI runs in the integrated terminal, not as a webview panel.
        // No tab viewType to detect.
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        return undefined;
    }

    /**
     * Async check for the `gemini` binary on PATH using cp.exec.
     */
    private checkBinaryAsync(): Promise<boolean> {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            cp.exec(`${cmd} ${BINARY_NAME}`, { timeout: 3000 }, (error) => {
                resolve(!error);
            });
        });
    }
}
