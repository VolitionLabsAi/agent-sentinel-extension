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
 * Encapsulates ALL Codex CLI–specific knowledge:
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
 * No other module should reference these Codex CLI–specific identifiers.
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

    get isAvailable(): boolean {
        return this.isBinaryOnPath() ||
            vscode.extensions.getExtension(EXTENSION_ID) !== undefined;
    }

    get isInstalled(): boolean {
        return this.isBinaryOnPath() ||
            vscode.extensions.getExtension(EXTENSION_ID) !== undefined;
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
     * Check whether the `codex` binary is available on PATH.
     * Result is cached after first check.
     */
    private isBinaryOnPath(): boolean {
        if (this.binaryResolved !== undefined) {
            return this.binaryResolved;
        }

        try {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            cp.execSync(`${cmd} ${BINARY_NAME}`, { stdio: 'ignore', timeout: 3000 });
            this.binaryResolved = true;
        } catch {
            this.binaryResolved = false;
        }

        return this.binaryResolved;
    }
}
