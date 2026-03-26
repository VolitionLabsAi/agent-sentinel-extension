import * as vscode from 'vscode';
import * as cp from 'child_process';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from './types.js';

/** Codex VS Code extension ID in the marketplace */
const EXTENSION_ID = 'openai.chatgpt';

/** Binary name for Codex CLI */
const BINARY_NAME = 'codex';

/**
 * OpenAI Codex CLI harness adapter.
 *
 * Encapsulates ALL Codex CLI-specific knowledge:
 * - CLI binary detection via `codex` on PATH
 * - VS Code extension detection via `openai.chatgpt`
 * - Session storage at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
 *
 * **Key limitation:** Codex CLI has NO PreToolUse/BeforeTool equivalent.
 * All tool-related hooks fire *after* execution (AfterToolUse). The
 * UserPromptSubmit hook can block prompts before they reach the model,
 * but individual tool calls cannot be intercepted before execution.
 *
 * The hooks system is experimental and requires a feature flag:
 * `codex -c features.codex_hooks=true`
 *
 * No other module should reference these Codex CLI-specific identifiers.
 */
export class CodexCLIAdapter implements HarnessAdapter {
    readonly name = 'Codex CLI';
    readonly extensionId = EXTENSION_ID;

    readonly capabilities: HarnessCapabilities = {
        canOpenSessions: false,    // No public extension API for session opening
        canDetectTabs: false,      // Extension provides chat panel but no documented viewType
        hasPreToolUseHook: false,  // KEY LIMITATION: No PreToolUse equivalent
        hasStopHook: true,         // Stop event available (experimental)
        canInjectMessages: false,
    };

    private binaryResolved: boolean | undefined;

    /**
     * Whether this adapter can perform its declared capabilities right now.
     * Requires the CLI binary on PATH — the VS Code extension alone does not
     * provide the hook capabilities this adapter declares.
     */
    get isAvailable(): boolean {
        // Return cached async result if available; false until detectAvailability resolves
        return this.binaryResolved ?? false;
    }

    /**
     * Whether the user has Codex installed in any form (CLI binary or VS Code extension).
     */
    get isInstalled(): boolean {
        return (this.binaryResolved ?? false) ||
            vscode.extensions.getExtension(EXTENSION_ID) !== undefined;
    }

    /**
     * Asynchronously detect whether the `codex` binary is on PATH.
     * Called during extension activation; caches the result for synchronous
     * `isAvailable` access afterward.
     */
    async detectAvailability(): Promise<void> {
        this.binaryResolved = await this.checkBinaryAsync();
    }

    async openSession(_sessionId: string): Promise<void> {
        // Codex VS Code extension does not expose a public API for opening sessions.
        // Sessions are resumed via `codex resume <session-id>` in the terminal.
        throw new Error(
            'Codex CLI does not support opening sessions from VS Code. '
            + 'Use `codex resume <session-id>` in the terminal.',
        );
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        // Codex stores sessions at ~/.codex/sessions/ as JSONL files.
        // The format is explicitly unstable ("an internal detail and may change").
        // For now, return empty — session detection requires parsing unstable JSONL.
        return [];
    }

    isHarnessTab(_tab: vscode.Tab): boolean {
        // Codex VS Code extension provides a chat panel, but no documented
        // viewType string for external detection. Keyboard commands exist
        // (toggle chat, add context) but the panel identity is not public.
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        return undefined;
    }

    /**
     * Async check for the `codex` binary on PATH using cp.exec.
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
