import type * as vscode from 'vscode';

/**
 * Capabilities a harness adapter may or may not support.
 * Used by consumers to check what operations are possible
 * without needing to know the specific harness.
 */
export interface HarnessCapabilities {
    /** Can open existing sessions in the harness UI */
    canOpenSessions: boolean;
    /** Can detect harness tabs in VS Code tab groups */
    canDetectTabs: boolean;
    /** Harness supports a preToolUse hook */
    hasPreToolUseHook: boolean;
    /** Harness supports a stop hook */
    hasStopHook: boolean;
    /** Can inject messages into an active harness session */
    canInjectMessages: boolean;
}

/**
 * Harness adapter interface — abstracts interaction with different
 * AI coding assistant harnesses (Claude Code, Copilot, etc.).
 *
 * Each adapter knows how to detect whether its harness is available,
 * how to perform harness-specific operations like opening sessions,
 * and how to identify harness tabs in VS Code's tab groups.
 */
export interface HarnessAdapter {
    /** Human-readable name of the harness, e.g. "Claude Code" */
    readonly name: string;

    /** VS Code extension ID, e.g. "anthropic.claude-code" */
    readonly extensionId: string;

    /** Whether this harness's extension is currently installed and available */
    readonly isAvailable: boolean;

    /** Whether this harness's extension is installed (may not be activated yet) */
    readonly isInstalled: boolean;

    /** What this adapter can do */
    readonly capabilities: HarnessCapabilities;

    /**
     * Asynchronously detect whether the adapter is available.
     * Called during extension activation so that `isAvailable` can return
     * a cached result synchronously. Adapters that rely on async checks
     * (e.g., binary-on-PATH detection) should implement this method.
     * Adapters that are purely synchronous (e.g., VS Code extension lookup)
     * may omit it — the default is a no-op.
     */
    detectAvailability?(): Promise<void>;

    /**
     * Open an existing session by its ID in the harness's editor UI.
     * Throws if the harness is not available or the operation fails.
     */
    openSession(sessionId: string): Promise<void>;

    /**
     * Detect active harness sessions visible in VS Code.
     * Returns info about each detected session.
     */
    detectActiveSessions(): Promise<SessionInfo[]>;

    /**
     * Check whether a VS Code tab belongs to this harness.
     * Used by the session correlator to identify harness tabs
     * without hardcoding harness-specific viewType strings.
     */
    isHarnessTab(tab: vscode.Tab): boolean;

    /**
     * Attempt to extract a session ID from a harness tab.
     * Returns undefined if the tab doesn't contain session ID information.
     */
    getSessionIdFromTab(tab: vscode.Tab): string | undefined;
}

/**
 * Basic info about a detected harness session.
 */
export interface SessionInfo {
    sessionId: string;
    label?: string;
}
