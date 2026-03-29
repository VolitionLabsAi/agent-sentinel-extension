import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { StateManager } from '../stores/state-manager.js';
import { HarnessAdapterRegistry } from '../adapters/adapter-registry.js';
import { Debouncer } from '../utils/debouncer.js';

export type CorrelationConfidence = 'high' | 'medium' | 'low';

export interface CorrelationResult {
    sessionId: string;
    confidence: CorrelationConfidence;
}

export interface ActiveSessionFile {
    session_id: string;
    transcript_path: string;
    timestamp: string;
}

/**
 * SessionCorrelator uses three signals to determine which agent session
 * corresponds to the currently active harness tab:
 *
 *   Signal 1 — Tab cache (instant, highest confidence):
 *     When the extension opens a session via the harness adapter,
 *     the caller caches {tabLabel -> sessionId}.
 *
 *   Signal 2 — Transcript activity (high confidence):
 *     Compares mtime of transcript JSONL files; the most recently modified
 *     within 5 seconds is the likely active session.
 *
 *   Signal 3 — Title matching (fallback, medium confidence):
 *     Reads the first few lines of transcript JSONL files to extract a
 *     session title and compares it to the active tab label.
 *
 * Sidebar limitation:
 *   VS Code's sidebar/webview panels do not always appear in tabGroups,
 *   so sidebar-based harness UIs may not be detectable via tab
 *   enumeration. The correlator gracefully returns null in that case.
 *
 * Harness abstraction:
 *   Tab detection is delegated to the HarnessAdapterRegistry, so the
 *   correlator works automatically with any registered harness adapter.
 */
export class SessionCorrelator implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    /** Signal 1: tab label -> session ID cache */
    private readonly tabCache = new Map<string, string>();

    /** Path to the active-session.json file (set externally). */
    private activeSessionFilePath: string | undefined;

    /** Cached result from the most recent active-session.json read. */
    private activeSessionFileResult: CorrelationResult | null = null;

    /** Currently correlated session */
    private currentResult: CorrelationResult | null = null;

    private readonly _onActiveSessionChanged = new vscode.EventEmitter<CorrelationResult | null>();
    /** Fires when the correlated active session changes (or becomes null). */
    readonly onActiveSessionChanged: vscode.Event<CorrelationResult | null> = this._onActiveSessionChanged.event;

    constructor(
        private readonly stateManager: StateManager,
        private readonly adapterRegistry: HarnessAdapterRegistry,
    ) {
        this.disposables.push(this._onActiveSessionChanged);

        const correlationDebouncer = new Debouncer(() => {
            void this.onTabsChanged();
        }, 500);
        this.disposables.push(correlationDebouncer);

        const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
            correlationDebouncer.trigger();
        });
        this.disposables.push(tabChangeDisposable);
    }

    // ── Signal 1: Tab cache management ──────────────────────────────

    /**
     * Cache a known mapping from tab label to session ID.
     * Called when the extension opens a session via the harness adapter.
     */
    cacheSessionTab(sessionId: string, tabLabel: string): void {
        this.tabCache.set(tabLabel, sessionId);
    }

    // ── Active session file ─────────────────────────────────────────

    /**
     * Set the path to `.volition/sentinel/active-session.json`.
     * Called by the extension when workspace folders are resolved.
     */
    setActiveSessionFilePath(filePath: string): void {
        this.activeSessionFilePath = filePath;
    }

    /**
     * Read active-session.json and return a high-confidence result if
     * the timestamp is within the last 5 minutes.
     */
    async readActiveSessionFile(): Promise<CorrelationResult | null> {
        if (!this.activeSessionFilePath) {
            return null;
        }

        try {
            const content = await fs.readFile(this.activeSessionFilePath, 'utf-8');
            const data = JSON.parse(content) as ActiveSessionFile;

            if (!data.session_id || !data.timestamp) {
                return null;
            }

            const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
            const fileTime = new Date(data.timestamp).getTime();
            const now = Date.now();

            if (now - fileTime < ACTIVE_SESSION_WINDOW_MS) {
                const result: CorrelationResult = {
                    sessionId: data.session_id,
                    confidence: 'high',
                };
                this.activeSessionFileResult = result;
                return result;
            }
        } catch {
            // File doesn't exist or is invalid — not fatal
        }

        this.activeSessionFileResult = null;
        return null;
    }

    /**
     * Called when the active-session.json file changes on disk.
     * Re-reads the file and emits an event if the session changed.
     */
    async onActiveSessionFileChanged(): Promise<void> {
        const newResult = await this.readActiveSessionFile();

        const changed =
            (newResult === null) !== (this.currentResult === null) ||
            newResult?.sessionId !== this.currentResult?.sessionId;

        if (changed) {
            this.currentResult = newResult;
            this._onActiveSessionChanged.fire(newResult);
        }
    }

    // ── Tab detection ───────────────────────────────────────────────

    /**
     * Find the currently active harness tab, if any.
     * Delegates to the adapter registry to check whether a tab belongs
     * to any registered harness, rather than hardcoding viewType strings.
     *
     * Sidebar limitation: VS Code sidebar webviews do not appear in
     * tabGroups, so sidebar-hosted panels will not be found.
     */
    private getActiveHarnessTab(): vscode.Tab | undefined {
        for (const group of vscode.window.tabGroups.all) {
            if (group.isActive && group.activeTab) {
                const tab = group.activeTab;
                if (this.adapterRegistry.isHarnessTab(tab)) {
                    return tab;
                }
            }
        }
        // Also check non-active groups for any harness tab that might be active within its group
        for (const group of vscode.window.tabGroups.all) {
            if (group.activeTab) {
                const tab = group.activeTab;
                if (this.adapterRegistry.isHarnessTab(tab)) {
                    return tab;
                }
            }
        }
        return undefined;
    }

    // ── Correlation engine ──────────────────────────────────────────

    /**
     * Correlate the active harness tab to a session ID using
     * three signals in priority order.
     */
    async correlateActiveSession(): Promise<CorrelationResult | null> {
        // Signal 0: active-session.json from hooks (highest priority)
        const activeSessionResult = await this.readActiveSessionFile();
        if (activeSessionResult) {
            return activeSessionResult;
        }

        const tab = this.getActiveHarnessTab();
        if (!tab) {
            return null;
        }

        const tabLabel = tab.label;

        // Signal 1: Tab cache (instant, highest confidence)
        const cachedId = this.tabCache.get(tabLabel);
        if (cachedId) {
            return { sessionId: cachedId, confidence: 'high' };
        }

        const sessionIds = this.stateManager.getSessionIds();
        if (sessionIds.length === 0) {
            return null;
        }

        // Signal 2: Transcript activity (high confidence)
        const activityResult = await this.correlateByTranscriptActivity(sessionIds);
        if (activityResult) {
            return activityResult;
        }

        // Signal 3: Title matching (fallback, medium confidence)
        const titleResult = await this.correlateByTitleMatch(tabLabel, sessionIds);
        if (titleResult) {
            return titleResult;
        }

        // Signal 4: Most recently modified transcript (last resort, low confidence)
        // Unlike Signal 2, this has no time window — picks the most recent regardless.
        const recentResult = await this.correlateByMostRecentTranscript(sessionIds);
        if (recentResult) {
            return recentResult;
        }

        return null;
    }

    /**
     * Signal 2: Find the session whose transcript was most recently modified
     * within the last 5 seconds.
     */
    private async correlateByTranscriptActivity(
        sessionIds: string[],
    ): Promise<CorrelationResult | null> {
        const ACTIVITY_WINDOW_MS = 5000;
        const now = Date.now();

        let bestSessionId: string | undefined;
        let bestMtime = 0;

        for (const sessionId of sessionIds) {
            const transcriptPath = this.stateManager.getTranscriptPath(sessionId);
            if (!transcriptPath) {
                continue;
            }
            try {
                const stat = await fs.stat(transcriptPath);
                const mtime = stat.mtimeMs;
                if (mtime > bestMtime) {
                    bestMtime = mtime;
                    bestSessionId = sessionId;
                }
            } catch {
                // Transcript file may not exist yet — skip
            }
        }

        if (bestSessionId && (now - bestMtime) < ACTIVITY_WINDOW_MS) {
            return { sessionId: bestSessionId, confidence: 'high' };
        }

        return null;
    }

    /**
     * Signal 3: Read the first few lines of each transcript JSONL to extract
     * a session title and compare to the active tab label.
     */
    private async correlateByTitleMatch(
        tabLabel: string,
        sessionIds: string[],
    ): Promise<CorrelationResult | null> {
        for (const sessionId of sessionIds) {
            const transcriptPath = this.stateManager.getTranscriptPath(sessionId);
            if (!transcriptPath) {
                continue;
            }

            const title = await this.extractSessionTitle(transcriptPath);
            if (!title) {
                continue;
            }

            // Exact match = medium confidence
            if (title === tabLabel) {
                return { sessionId, confidence: 'medium' };
            }

            // Prefix match = low confidence
            if (tabLabel.startsWith(title) || title.startsWith(tabLabel)) {
                return { sessionId, confidence: 'low' };
            }
        }

        return null;
    }

    /**
     * Signal 4: Pick the session whose transcript was most recently modified,
     * without any time-window constraint. Used as a last-resort fallback
     * when a harness tab is active but no other signal can identify the session.
     */
    private async correlateByMostRecentTranscript(
        sessionIds: string[],
    ): Promise<CorrelationResult | null> {
        let bestSessionId: string | undefined;
        let bestMtime = 0;

        for (const sessionId of sessionIds) {
            const transcriptPath = this.stateManager.getTranscriptPath(sessionId);
            if (!transcriptPath) {
                continue;
            }
            try {
                const stat = await fs.stat(transcriptPath);
                const mtime = stat.mtimeMs;
                if (mtime > bestMtime) {
                    bestMtime = mtime;
                    bestSessionId = sessionId;
                }
            } catch {
                // Transcript file may not exist yet — skip
            }
        }

        if (bestSessionId) {
            return { sessionId: bestSessionId, confidence: 'low' };
        }

        return null;
    }

    /**
     * Extract a session title from the first few lines of a transcript JSONL.
     * Looks for a "summary" or "title" field in the JSON entries.
     */
    async extractSessionTitle(transcriptPath: string): Promise<string | null> {
        let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
        try {
            fileHandle = await fs.open(transcriptPath, 'r');
            // Read first 4KB to find title in early entries
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await fileHandle.read(buffer, 0, 4096, 0);
            const chunk = buffer.toString('utf-8', 0, bytesRead);
            const lines = chunk.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }
                try {
                    const entry = JSON.parse(trimmed) as Record<string, unknown>;
                    // Check common title fields
                    if (typeof entry.title === 'string' && entry.title) {
                        return entry.title;
                    }
                    if (typeof entry.summary === 'string' && entry.summary) {
                        return entry.summary;
                    }
                } catch {
                    // Malformed line — skip
                }
            }
        } catch {
            // File doesn't exist or read error — not fatal
        } finally {
            await fileHandle?.close();
        }
        return null;
    }

    // ── Event handling ──────────────────────────────────────────────

    /**
     * Called when VS Code tabs change. Re-correlates and emits if changed.
     */
    private async onTabsChanged(): Promise<void> {
        const newResult = await this.correlateActiveSession();

        const changed =
            (newResult === null) !== (this.currentResult === null) ||
            newResult?.sessionId !== this.currentResult?.sessionId ||
            newResult?.confidence !== this.currentResult?.confidence;

        if (changed) {
            this.currentResult = newResult;
            this._onActiveSessionChanged.fire(newResult);
        }
    }

    /**
     * Returns the last correlated result without re-computing.
     */
    getCurrentSession(): CorrelationResult | null {
        return this.currentResult;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.tabCache.clear();
    }
}
