import * as vscode from 'vscode';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import { ConfigManager } from '../../stores/config-manager.js';
import { PersistentObservation } from '../../types/observation.js';
import { ObservationTreeItem, ObservationDetailItem, SessionGroupTreeItem } from './observation-tree-item.js';
import { Debouncer } from '../../utils/debouncer.js';
import { extractTranscriptTitle } from '../../utils/transcript-title.js';

type FeedItem = ObservationTreeItem | ObservationDetailItem | LoadMoreTreeItem | EndOfHistoryTreeItem | SessionGroupTreeItem;

export type ViewMode = 'all' | 'recent' | 'pinned';

/** How many historical observations to load per "Load More" click. */
const HISTORY_PAGE_SIZE = 100;

/**
 * Sentinel tree item that triggers loading more historical observations.
 */
class LoadMoreTreeItem extends vscode.TreeItem {
    readonly sessionId: string;

    constructor(sessionId: string) {
        super('Load More...', vscode.TreeItemCollapsibleState.None);
        this.sessionId = sessionId;
        this.iconPath = new vscode.ThemeIcon('ellipsis');
        this.description = 'Click to load older observations';
        this.contextValue = 'loadMore';
        this.command = {
            command: 'sentinel.loadMoreHistory',
            title: 'Load More History',
            arguments: [sessionId],
        };
    }
}

/**
 * Sentinel tree item indicating all history has been loaded.
 */
class EndOfHistoryTreeItem extends vscode.TreeItem {
    constructor() {
        super('Beginning of session', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('history');
        this.description = 'All observations loaded';
        this.contextValue = 'endOfHistory';
    }
}

/**
 * TreeDataProvider that displays sentinel observations in real-time.
 *
 * Supports three view modes:
 * - 'all': show all observations across sessions (session label on each item)
 * - 'recent': auto-filter to the most recent session via active-session.json
 * - 'pinned': user-pinned session; feed stays filtered regardless of tab
 *
 * Supports historical browsing via "Load More..." tree items that
 * lazy-load observations from disk beyond the in-memory cache boundary.
 */
export class ObservationsProvider implements vscode.TreeDataProvider<FeedItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FeedItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];
    private sessionFilter: string | undefined;
    private viewMode: ViewMode = 'recent';
    private groupBySession = true;

    /**
     * Historical observations loaded from disk, keyed by session ID.
     * Stored in reverse chronological order (newest of historical batch first).
     */
    private historicalObservations: Map<string, PersistentObservation[]> = new Map();

    /**
     * Whether we've exhausted all history for a session (no more on disk).
     */
    private historyExhausted: Set<string> = new Set();

    /**
     * Sessions currently loading history (for loading indicator).
     */
    private loadingHistory: Set<string> = new Set();

    /** Cache for session display labels (title + short ID or just short ID). */
    private sessionLabelCache = new Map<string, string>();

    /**
     * Sessions currently undergoing async title resolution from transcript.
     * Prevents multiple concurrent reads for the same session.
     */
    private readonly pendingTitleResolution = new Set<string>();

    /** Debouncer to coalesce rapid tree refresh calls. */
    private readonly refreshDebouncer: Debouncer;

    constructor(
        private readonly store: ObservationStore,
        private readonly stateManager: StateManager,
        private readonly configManager?: ConfigManager,
    ) {
        this.refreshDebouncer = new Debouncer(() => {
            this._onDidChangeTreeData.fire();
        }, 250);
        this.disposables.push(this._onDidChangeTreeData);

        // Read persisted view mode from config (defaults to 'grouped')
        if (configManager) {
            const persistedMode = configManager.getObservationsViewMode();
            this.groupBySession = persistedMode !== 'flat';
        }

        // Set initial context for group-by-session mode
        void vscode.commands.executeCommand('setContext', 'sentinel.groupBySession', this.groupBySession);

        // Auto-refresh when new observations arrive
        this.disposables.push(
            store.onObservationReceived(() => this.refresh()),
        );

        // Invalidate session label cache when sessions change (titles may be resolved)
        this.disposables.push(
            stateManager.onSessionsChanged(() => {
                this.sessionLabelCache.clear();
                this.refresh();
            }),
        );
    }

    /** Set an optional session ID filter (undefined = show all). */
    setSessionFilter(sessionId: string | undefined): void {
        this.sessionFilter = sessionId;
        this.refresh();
    }

    /** Get the current view mode. */
    getViewMode(): ViewMode {
        return this.viewMode;
    }

    /** Set the view mode and update the session filter accordingly. */
    setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
        if (mode === 'all') {
            this.sessionFilter = undefined;
        }
        this.refresh();
    }

    /** Get the current session filter value. */
    getSessionFilter(): string | undefined {
        return this.sessionFilter;
    }

    /** Whether group-by-session mode is active. */
    isGroupBySession(): boolean {
        return this.groupBySession;
    }

    /** Toggle group-by-session mode, persist to config, and refresh. */
    toggleGroupBySession(): void {
        this.groupBySession = !this.groupBySession;
        void vscode.commands.executeCommand('setContext', 'sentinel.groupBySession', this.groupBySession);
        if (this.configManager) {
            const newMode = this.groupBySession ? 'grouped' : 'flat';
            void this.configManager.setObservationsViewMode(newMode);
        }
        this.refresh();
    }

    /**
     * Load more historical observations for a session.
     * Called when the user clicks the "Load More..." tree item.
     */
    async loadMoreHistory(sessionId: string): Promise<void> {
        if (this.loadingHistory.has(sessionId)) {
            return; // Already loading
        }

        this.loadingHistory.add(sessionId);
        this.refresh(); // Show loading state

        try {
            // Determine the boundary: how many historical observations we already have
            const existingHistorical = this.historicalObservations.get(sessionId) ?? [];
            const oldestInMemoryIndex = this.store.getOldestInMemoryIndex(sessionId);

            // The "beforeIndex" is where in-memory starts, minus what we've already loaded historically
            const beforeIndex = oldestInMemoryIndex - existingHistorical.length;

            if (beforeIndex <= 0) {
                // We've loaded everything
                this.historyExhausted.add(sessionId);
                return;
            }

            const batch = await this.store.getHistoricalObservations(
                sessionId,
                beforeIndex,
                HISTORY_PAGE_SIZE,
            );

            if (batch.length === 0) {
                this.historyExhausted.add(sessionId);
            } else {
                // Append to existing historical (both in reverse-chron order)
                const existing = this.historicalObservations.get(sessionId) ?? [];
                existing.push(...batch);
                this.historicalObservations.set(sessionId, existing);

                // Check if we've reached the beginning
                if (batch.length < HISTORY_PAGE_SIZE || beforeIndex - batch.length <= 0) {
                    this.historyExhausted.add(sessionId);
                }
            }
        } finally {
            this.loadingHistory.delete(sessionId);
            this.refresh();
        }
    }

    refresh(): void {
        this.refreshDebouncer.trigger();
    }

    getTreeItem(element: FeedItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FeedItem): FeedItem[] {
        // Child items for an expanded observation
        if (element instanceof ObservationTreeItem) {
            return this.getObservationDetails(element);
        }

        // Non-expandable items have no children
        if (element instanceof LoadMoreTreeItem || element instanceof EndOfHistoryTreeItem) {
            return [];
        }

        // Session group children: return that session's observations
        if (element instanceof SessionGroupTreeItem) {
            return this.getSessionGroupChildren(element);
        }

        // Root level
        if (this.groupBySession) {
            return this.getGroupedRoot();
        }

        return this.getFlatRoot();
    }

    /**
     * Flat root: observations newest-first, optionally filtered by the time window.
     *
     * The window filter (observation_window_hours) is applied only in 'all' mode.
     * In 'recent'/'pinned' mode the caller has already set sessionFilter and we
     * show all observations for that specific session regardless of age.
     */
    private getFlatRoot(): FeedItem[] {
        const windowFilter = this.buildWindowFilter();
        const filter = this.sessionFilter
            ? { sessionId: this.sessionFilter, ...windowFilter }
            : windowFilter;
        const observations = this.store.getObservations(
            (filter && Object.keys(filter).length > 0) ? filter : undefined,
        );

        if (observations.length === 0 && !this.hasAnyHistory()) {
            return [this.createEmptyStateItem()];
        }

        const showSessionLabel = this.viewMode === 'all';
        const items: FeedItem[] = [];

        // In-memory observations, newest first (single reverse iteration instead of slice+reverse)
        for (let i = observations.length - 1; i >= 0; i--) {
            const obs = observations[i];
            const sessionLabel = this.getSessionLabel(obs.session_id);
            const item = new ObservationTreeItem(obs, sessionLabel);
            if (showSessionLabel) {
                item.description = `${item.description ?? ''}  \u27E8${sessionLabel}\u27E9`;
            }
            items.push(item);
        }

        // Historical observations (loaded from disk), appended after in-memory
        if (this.sessionFilter) {
            this.appendHistoryItems(items, this.sessionFilter, showSessionLabel);
        } else if (this.viewMode === 'all') {
            this.appendAllModeHint(items);
        }

        return items;
    }

    /**
     * Grouped root: return SessionGroupTreeItem[] — one per session, ordered by most recent observation.
     *
     * The window filter (observation_window_hours) is applied only in 'all' mode.
     * In 'recent'/'pinned' mode show all observations for the specific session.
     */
    private getGroupedRoot(): FeedItem[] {
        const windowFilter = this.buildWindowFilter();
        const filter = this.sessionFilter
            ? { sessionId: this.sessionFilter, ...windowFilter }
            : windowFilter;
        const observations = this.store.getObservations(
            (filter && Object.keys(filter).length > 0) ? filter : undefined,
        );

        if (observations.length === 0 && !this.hasAnyHistory()) {
            return [this.createEmptyStateItem()];
        }

        // Group observations by session, tracking latest timestamp per session
        const sessionObsMap = new Map<string, PersistentObservation[]>();
        const sessionLatest = new Map<string, string>();

        for (const obs of observations) {
            const arr = sessionObsMap.get(obs.session_id);
            if (arr) {
                arr.push(obs);
            } else {
                sessionObsMap.set(obs.session_id, [obs]);
            }
            const existing = sessionLatest.get(obs.session_id);
            if (!existing || obs.timestamp > existing) {
                sessionLatest.set(obs.session_id, obs.timestamp);
            }
        }

        // Include historical observations in counts
        for (const [sid, historical] of this.historicalObservations) {
            if (this.sessionFilter && sid !== this.sessionFilter) { continue; }
            const arr = sessionObsMap.get(sid) ?? [];
            // Don't push historical into sessionObsMap — they'll be returned in getSessionGroupChildren
            if (!sessionObsMap.has(sid)) {
                sessionObsMap.set(sid, []);
            }
            // Update count to include historical
            const totalCount = arr.length + historical.length;
            // Store adjusted count — we'll read from sessionObsMap + historicalObservations in children
            // Just ensure the session is represented
            if (!sessionLatest.has(sid) && historical.length > 0) {
                sessionLatest.set(sid, historical[0].timestamp);
            }
            // Replace for count purposes — sessionObsMap still only has in-memory
            void totalCount;
        }

        // Sort sessions by most-recent observation (descending)
        const sortedSessions = [...sessionObsMap.keys()].sort((a, b) => {
            const ta = sessionLatest.get(a) ?? '';
            const tb = sessionLatest.get(b) ?? '';
            return tb.localeCompare(ta);
        });

        const severityMode = this.configManager?.getSessionSeverityMode() ?? 'recent';

        return sortedSessions.map(sid => {
            const inMemory = sessionObsMap.get(sid) ?? [];
            const historical = (this.sessionFilter === sid || !this.sessionFilter)
                ? (this.historicalObservations.get(sid) ?? [])
                : [];
            const totalCount = inMemory.length + historical.length;
            const allObs = [...inMemory, ...historical];

            let severity: string;
            if (severityMode === 'highest') {
                severity = SessionGroupTreeItem.highestSeverityOf(allObs);
            } else {
                // 'recent': observations are stored oldest-first in memory,
                // so the last in-memory observation is the most recent.
                // If no in-memory observations, fall back to first historical (newest of historical batch).
                const mostRecent = inMemory.length > 0
                    ? inMemory[inMemory.length - 1]
                    : (historical.length > 0 ? historical[0] : undefined);
                severity = mostRecent?.severity ?? 'info';
            }

            const label = this.getSessionLabel(sid);
            return new SessionGroupTreeItem(sid, label, totalCount, severity);
        });
    }

    /**
     * Children of a SessionGroupTreeItem: that session's observations newest-first,
     * plus historical and load-more items.
     */
    private getSessionGroupChildren(group: SessionGroupTreeItem): FeedItem[] {
        const sid = group.sessionId;
        const observations = this.store.getObservations({ sessionId: sid });
        const items: FeedItem[] = [];

        // In-memory observations, newest first
        for (let i = observations.length - 1; i >= 0; i--) {
            const obs = observations[i];
            const sessionLabel = this.getSessionLabel(obs.session_id);
            items.push(new ObservationTreeItem(obs, sessionLabel));
        }

        // Historical + load-more/end-of-history within this group
        this.appendHistoryItems(items, sid, false);

        return items;
    }

    /**
     * Append historical observations, loading indicator, and end-of-history markers for a session.
     */
    private appendHistoryItems(items: FeedItem[], sessionId: string, showSessionLabel: boolean): void {
        const historical = this.historicalObservations.get(sessionId) ?? [];
        for (const obs of historical) {
            const sessionLabel = this.getSessionLabel(obs.session_id);
            const item = new ObservationTreeItem(obs, sessionLabel);
            if (showSessionLabel) {
                item.description = `${item.description ?? ''}  \u27E8${sessionLabel}\u27E9`;
            }
            items.push(item);
        }

        if (this.loadingHistory.has(sessionId)) {
            const loadingItem = new vscode.TreeItem('Loading...', vscode.TreeItemCollapsibleState.None);
            loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
            loadingItem.description = 'Fetching older observations';
            items.push(loadingItem as FeedItem);
        } else if (this.historyExhausted.has(sessionId)) {
            if (historical.length > 0 || this.store.hasMoreHistory(sessionId)) {
                items.push(new EndOfHistoryTreeItem());
            }
        } else if (this.store.hasMoreHistory(sessionId)) {
            items.push(new LoadMoreTreeItem(sessionId));
        }
    }

    /**
     * Append the "Pin a session to browse history" hint in all-mode flat view.
     */
    private appendAllModeHint(items: FeedItem[]): void {
        const sessionsWithHistory = this.getSessionsWithHistory();
        if (sessionsWithHistory.length > 0) {
            const hint = new vscode.TreeItem(
                'Pin a session to browse history',
                vscode.TreeItemCollapsibleState.None,
            );
            hint.iconPath = new vscode.ThemeIcon('pin');
            hint.description = `${sessionsWithHistory.length} session(s) have older observations`;
            items.push(hint as FeedItem);
        }
    }

    /**
     * Returns a human-friendly session label: "Title (shortId)" if a title
     * is available from StateManager, otherwise just the short ID (first 8 chars).
     *
     * When no title exists in the state manager, a transcript-based title extraction
     * is scheduled asynchronously (fire-and-forget). The resolved title is written
     * back to the state manager so subsequent renders use it directly. If extraction
     * fails, the bare short ID is cached to avoid repeated filesystem reads.
     */
    private getSessionLabel(sessionId: string): string {
        const cached = this.sessionLabelCache.get(sessionId);
        if (cached !== undefined) {
            // Return the cached label (may be bare short ID if extraction already failed).
            return cached;
        }

        const shortId = sessionId.slice(0, 8);
        const session = this.stateManager.getSession(sessionId);

        if (session?.title) {
            const label = `${session.title} (${shortId})`;
            this.sessionLabelCache.set(sessionId, label);
            return label;
        }

        // No title yet — schedule async extraction from transcript if not already in flight.
        if (!this.pendingTitleResolution.has(sessionId) && session?.transcript_path) {
            this.pendingTitleResolution.add(sessionId);
            const transcriptPath = session.transcript_path;
            extractTranscriptTitle(transcriptPath).then(async (title) => {
                if (title) {
                    // Write back to state manager (updates in-memory + sentinel-state.json).
                    await this.stateManager.setSessionTitle(sessionId, title);
                    // Invalidate cache entry so the next render picks up the new title.
                    this.sessionLabelCache.delete(sessionId);
                } else {
                    // Cache the bare short ID to skip future extraction attempts until
                    // the next session-change event clears the cache.
                    this.sessionLabelCache.set(sessionId, shortId);
                }
            }).catch(() => {
                // Extraction failed — cache bare ID to avoid repeated retries.
                this.sessionLabelCache.set(sessionId, shortId);
            }).finally(() => {
                this.pendingTitleResolution.delete(sessionId);
                // Re-render the tree so the resolved (or confirmed-missing) label is shown.
                this.refresh();
            });
        }

        // Return bare short ID immediately; tree will refresh when title resolves.
        return shortId;
    }

    /**
     * Build a time-window filter for use in 'all' view mode.
     *
     * In 'all' mode, apply `observation_window_hours` to restrict observations to
     * those within the configured window. In 'recent'/'pinned' mode (where
     * sessionFilter is set), show all observations for the specific session.
     *
     * Returns an empty object ({}) when no window filter should be applied.
     */
    private buildWindowFilter(): { since?: string } {
        // Only apply the window filter in 'all' mode (no session filter active).
        if (this.viewMode !== 'all' || this.sessionFilter) {
            return {};
        }
        if (!this.configManager) {
            return {};
        }
        const windowMs = this.configManager.getObservationWindowMs();
        if (windowMs === 0) {
            // 0 means "all time" — no filter.
            return {};
        }
        const since = new Date(Date.now() - windowMs).toISOString();
        return { since };
    }

    private getObservationDetails(parent: ObservationTreeItem): ObservationDetailItem[] {
        const obs = parent.observation;
        const items: ObservationDetailItem[] = [];

        if (obs.analysis) {
            items.push(new ObservationDetailItem('Analysis', obs.analysis));
        }
        items.push(new ObservationDetailItem('Sentinel', `${obs.sentinel_label} (${obs.sentinel_name})`));
        items.push(new ObservationDetailItem('Tier', obs.tier));
        items.push(new ObservationDetailItem('Duration', `${obs.duration_ms}ms`));
        items.push(new ObservationDetailItem('Turn', `${obs.turn_number}`));
        items.push(new ObservationDetailItem('Session', this.getSessionLabel(obs.session_id)));

        return items;
    }

    private createEmptyStateItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(
            'No observations yet — sentinel is watching',
            vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('shield');
        return item as FeedItem;
    }

    /** Check if any loaded historical observations exist. */
    private hasAnyHistory(): boolean {
        for (const obs of this.historicalObservations.values()) {
            if (obs.length > 0) {
                return true;
            }
        }
        return false;
    }

    /** Get session IDs that have more history on disk beyond in-memory cache. */
    private getSessionsWithHistory(): string[] {
        const sessions: string[] = [];
        const allObs = this.store.getObservations();
        const seen = new Set<string>();
        for (const obs of allObs) {
            if (!seen.has(obs.session_id) && this.store.hasMoreHistory(obs.session_id)) {
                sessions.push(obs.session_id);
                seen.add(obs.session_id);
            }
        }
        return sessions;
    }

    dispose(): void {
        this.refreshDebouncer.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.historicalObservations.clear();
        this.historyExhausted.clear();
        this.loadingHistory.clear();
        this.sessionLabelCache.clear();
        this.pendingTitleResolution.clear();
    }
}
