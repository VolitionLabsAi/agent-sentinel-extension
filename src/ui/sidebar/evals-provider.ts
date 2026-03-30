import * as vscode from 'vscode';
import { ConfigManager } from '../../stores/config-manager.js';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import { EvalDomain, EvalRule, LocalEval } from '../../types/eval-rule.js';
import {
    DomainTreeItem,
    EvalTreeItem,
    DynamicEvalTreeItem,
    EvalDetailItem,
} from './eval-tree-item.js';

type EvalNode = DomainTreeItem | EvalTreeItem | DynamicEvalTreeItem | EvalDetailItem;

/** Ordered domain list for consistent display. */
const DOMAIN_ORDER: EvalDomain[] = ['GEN', 'SEC', 'LOCAL'];

/**
 * TreeDataProvider for the Evals sidebar view.
 *
 * Displays evals grouped by domain (GEN, SEC, LOCAL), each eval showing
 * severity, hit count, enabled state, and expandable detail text.
 */
export class EvalsProvider implements vscode.TreeDataProvider<EvalNode>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<EvalNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];

    /** Session start timestamp for "learned this session" detection. */
    private readonly sessionStartTime: string;

    /** Incrementally-maintained cache of eval hit statistics. */
    private hitStatsCache: Map<string, { hitCount: number; lastTriggered: string | undefined }> = new Map();

    /** Whether the hit stats cache needs rebuilding before next read. */
    private hitStatsCacheDirty = true;

    constructor(
        private readonly configManager: ConfigManager,
        private readonly observationStore: ObservationStore,
        private readonly stateManager?: StateManager,
    ) {
        this.disposables.push(this._onDidChangeTreeData);
        this.sessionStartTime = new Date().toISOString();

        // Refresh on config changes (rule enable/disable, file edits)
        this.disposables.push(
            configManager.onConfigChanged(() => this.refresh()),
        );

        // Refresh on new observations (hit counts change)
        this.disposables.push(
            observationStore.onObservationReceived(() => {
                this.hitStatsCacheDirty = true;
                this.refresh();
            }),
        );

        // Refresh when local evals change
        if (stateManager) {
            this.disposables.push(
                stateManager.onLocalEvalsChanged(() => this.refresh()),
            );
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EvalNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: EvalNode): EvalNode[] {
        if (!element) {
            return this.getRootItems();
        }

        if (element instanceof DomainTreeItem) {
            return this.getDomainChildren(element.domain);
        }

        if (element instanceof EvalTreeItem) {
            return this.getRuleDetails(element.rule);
        }

        if (element instanceof DynamicEvalTreeItem) {
            return this.getRuleDetails(element.localEval);
        }

        return [];
    }

    /**
     * Root level: domain grouping nodes.
     * Only shows domains that have at least one rule.
     */
    private getRootItems(): EvalNode[] {
        const rules = this.configManager.getEvals();
        const localEvals = this.stateManager?.getLocalEvals() ?? [];

        if (rules.length === 0 && localEvals.length === 0) {
            return [this.createEmptyStateItem()];
        }

        const byDomain = new Map<EvalDomain, EvalRule[]>();
        for (const rule of rules) {
            let domainRules = byDomain.get(rule.domain);
            if (!domainRules) {
                domainRules = [];
                byDomain.set(rule.domain, domainRules);
            }
            domainRules.push(rule);
        }

        // Add dynamic evals to the LOCAL domain count
        if (localEvals.length > 0) {
            const existing = byDomain.get('LOCAL') ?? [];
            // We use the combined count for the domain header
            byDomain.set('LOCAL', existing);
        }

        const items: EvalNode[] = [];
        for (const domain of DOMAIN_ORDER) {
            const domainRules = byDomain.get(domain) ?? [];
            const dynamicCount = domain === 'LOCAL' ? localEvals.length : 0;
            const totalCount = domainRules.length + dynamicCount;

            if (totalCount === 0) { continue; }

            const enabledCount = domainRules.filter((r) => r.enabled).length + dynamicCount;
            items.push(new DomainTreeItem(domain, totalCount, enabledCount));
        }

        return items;
    }

    /**
     * Second level: individual evals within a domain.
     */
    private getDomainChildren(domain: EvalDomain): EvalNode[] {
        const rules = this.configManager.getEvals().filter((r) => r.domain === domain);

        const items: EvalNode[] = rules.map((rule) => {
            const { hitCount, lastTriggered } = this.getHitStats(rule.id);
            return new EvalTreeItem(rule, hitCount, lastTriggered);
        });

        // For the LOCAL domain, also include dynamic evals from state
        if (domain === 'LOCAL' && this.stateManager) {
            const localEvals = this.stateManager.getLocalEvals();
            for (const localEval of localEvals) {
                const { hitCount, lastTriggered } = this.getHitStats(localEval.id);
                const isCurrentSession = localEval.created_at >= this.sessionStartTime;
                items.push(new DynamicEvalTreeItem(localEval, hitCount, lastTriggered, isCurrentSession));
            }
        }

        return items;
    }

    /**
     * Third level: rule text and rationale details.
     */
    private getRuleDetails(rule: EvalRule | LocalEval): EvalDetailItem[] {
        const items: EvalDetailItem[] = [];

        if (rule.rule) {
            items.push(new EvalDetailItem('Eval', rule.rule));
        }
        if (rule.rationale) {
            items.push(new EvalDetailItem('Rationale', rule.rationale));
        }

        return items;
    }

    /**
     * Rebuild the hit stats cache in a single pass over all observations.
     * Called lazily before the first cache read after invalidation.
     */
    private rebuildHitStatsCache(): void {
        this.hitStatsCache.clear();
        const allObservations = this.observationStore.getObservations();
        for (const obs of allObservations) {
            const existing = this.hitStatsCache.get(obs.eval_id);
            if (existing) {
                existing.hitCount++;
                if (!existing.lastTriggered || obs.timestamp > existing.lastTriggered) {
                    existing.lastTriggered = obs.timestamp;
                }
            } else {
                this.hitStatsCache.set(obs.eval_id, {
                    hitCount: 1,
                    lastTriggered: obs.timestamp,
                });
            }
        }
        this.hitStatsCacheDirty = false;
    }

    /**
     * Look up hit count and last-triggered timestamp for a rule from the cache.
     */
    private getHitStats(evalId: string): { hitCount: number; lastTriggered: string | undefined } {
        if (this.hitStatsCacheDirty) {
            this.rebuildHitStatsCache();
        }
        return this.hitStatsCache.get(evalId) ?? { hitCount: 0, lastTriggered: undefined };
    }

    private createEmptyStateItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(
            'No evals found — check sentinel config',
            vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('info');
        return item as EvalNode;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
