import * as vscode from 'vscode';
import { ObservationStore } from '../../stores/observation-store.js';
import { ObservationTreeItem, ObservationDetailItem } from './observation-tree-item.js';

type FeedItem = ObservationTreeItem | ObservationDetailItem;

/**
 * TreeDataProvider that displays sentinel observations in real-time.
 *
 * New observations appear at the TOP. Supports optional sessionId filtering
 * for future Active/Pinned view modes.
 */
export class LiveFeedProvider implements vscode.TreeDataProvider<FeedItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FeedItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];
    private sessionFilter: string | undefined;

    constructor(private readonly store: ObservationStore) {
        this.disposables.push(this._onDidChangeTreeData);

        // Auto-refresh when new observations arrive
        this.disposables.push(
            store.onObservationReceived(() => this.refresh()),
        );
    }

    /** Set an optional session ID filter (undefined = show all). */
    setSessionFilter(sessionId: string | undefined): void {
        this.sessionFilter = sessionId;
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FeedItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FeedItem): FeedItem[] {
        // Child items for an expanded observation
        if (element instanceof ObservationTreeItem) {
            return this.getObservationDetails(element);
        }

        // Root level — return observations newest-first
        const observations = this.store.getObservations(
            this.sessionFilter ? { sessionId: this.sessionFilter } : undefined,
        );

        if (observations.length === 0) {
            return [this.createEmptyStateItem()];
        }

        // Newest first
        return observations
            .slice()
            .reverse()
            .map((obs) => new ObservationTreeItem(obs));
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
        items.push(new ObservationDetailItem('Session', obs.session_id));

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

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
