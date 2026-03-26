/**
 * Harness adapter interface — abstracts interaction with different
 * AI coding assistant harnesses (Claude Code, Copilot, etc.).
 *
 * Each adapter knows how to detect whether its harness is available
 * and how to perform harness-specific operations like opening sessions.
 */
export interface HarnessAdapter {
    /** Human-readable name of the harness, e.g. "Claude Code" */
    readonly name: string;

    /** Whether this harness's extension is currently installed and available */
    readonly isAvailable: boolean;

    /**
     * Open an existing session by its ID in the harness's editor UI.
     * Throws if the harness is not available or the operation fails.
     */
    openSession(sessionId: string): Promise<void>;
}
