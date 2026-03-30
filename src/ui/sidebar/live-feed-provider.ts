import * as vscode from 'vscode';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import { PersistentObservation } from '../../types/observation.js';
import { ObservationTreeItem, ObservationDetailItem } from './observation-tree-item.js';
import { Debouncer } from '../../utils/debouncer.js';

type FeedItem = ObservationTreeItem | ObservationDetailItem | LoadMoreTreeItem | EndOfHistoryTreeItem;

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
export class LiveFeedProvider implements vscode.TreeDataProvider<FeedItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FeedItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];
    private sessionFilter: string | undefined;
    private viewMode: ViewMode = 'recent';

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

    /** Debouncer to coalesce rapid tree refresh calls. */
    private readonly refreshDebouncer: Debouncer;

    constructor(
        private readonly store: ObservationStore,
        private readonly stateManager: StateManager,
    ) {
        this.refreshDebouncer = new Debouncer(() => {
            this._onDidChangeTreeData.fire();
        }, 250);
        this.disposables.push(this._onDidChangeTreeData);

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

        // Root level — return observations newest-first
        const observations = this.store.getObservations(
            this.sessionFilter ? { sessionId: this.sessionFilter } : undefined,
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
            const historical = this.historicalObservations.get(this.sessionFilter) ?? [];
            for (const obs of historical) {
                const sessionLabel = this.getSessionLabel(obs.session_id);
                const item = new ObservationTreeItem(obs, sessionLabel);
                if (showSessionLabel) {
                    item.description = `${item.description ?? ''}  \u27E8${sessionLabel}\u27E9`;
                }
                items.push(item);
            }

            // Add load-more or end-of-history marker
            if (this.loadingHistory.has(this.sessionFilter)) {
                const loadingItem = new vscode.TreeItem('Loading...', vscode.TreeItemCollapsibleState.None);
                loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
                loadingItem.description = 'Fetching older observations';
                items.push(loadingItem as FeedItem);
            } else if (this.historyExhausted.has(this.sessionFilter)) {
                if (historical.length > 0 || this.store.hasMoreHistory(this.sessionFilter)) {
                    items.push(new EndOfHistoryTreeItem());
                }
            } else if (this.store.hasMoreHistory(this.sessionFilter)) {
                items.push(new LoadMoreTreeItem(this.sessionFilter));
            }
        } else if (this.viewMode === 'all') {
            // In "all" mode, check each session for history
            // Only show a single "Load More" if any session has more history
            // (in all mode, historical browsing is session-filtered — guide the user)
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

        return items;
    }

    /**
     * Returns a human-friendly session label: "Title (shortId)" if a title
     * is available from StateManager, otherwise just the short ID (first 8 chars).
     */
    private getSessionLabel(sessionId: string): string {
        let label = this.sessionLabelCache.get(sessionId);
        if (!label) {
            const shortId = sessionId.slice(0, 8);
            const session = this.stateManager.getSession(sessionId);
            label = session?.title ? `${session.title} (${shortId})` : shortId;
            this.sessionLabelCache.set(sessionId, label);
        }
        return label;
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
    }
}
