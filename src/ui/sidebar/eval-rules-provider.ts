import * as vscode from 'vscode';
import { ConfigManager } from '../../stores/config-manager.js';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import { EvalDomain, EvalRule, LocalEval } from '../../types/eval-rule.js';
import {
    DomainTreeItem,
    EvalRuleTreeItem,
    DynamicEvalRuleTreeItem,
    EvalRuleDetailItem,
} from './eval-rule-tree-item.js';

type EvalTreeItem = DomainTreeItem | EvalRuleTreeItem | DynamicEvalRuleTreeItem | EvalRuleDetailItem;

/** Ordered domain list for consistent display. */
const DOMAIN_ORDER: EvalDomain[] = ['GEN', 'SEC', 'LOCAL'];

/**
 * TreeDataProvider for the Eval Rules sidebar view.
 *
 * Displays rules grouped by domain (GEN, SEC, LOCAL), each rule showing
 * severity, hit count, enabled state, and expandable detail text.
 */
export class EvalRulesProvider implements vscode.TreeDataProvider<EvalTreeItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<EvalTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];

    /** Session start timestamp for "learned this session" detection. */
    private readonly sessionStartTime: string;

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
            observationStore.onObservationReceived(() => this.refresh()),
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

    getTreeItem(element: EvalTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: EvalTreeItem): EvalTreeItem[] {
        if (!element) {
            return this.getRootItems();
        }

        if (element instanceof DomainTreeItem) {
            return this.getDomainChildren(element.domain);
        }

        if (element instanceof EvalRuleTreeItem) {
            return this.getRuleDetails(element.rule);
        }

        if (element instanceof DynamicEvalRuleTreeItem) {
            return this.getRuleDetails(element.localEval);
        }

        return [];
    }

    /**
     * Root level: domain grouping nodes.
     * Only shows domains that have at least one rule.
     */
    private getRootItems(): EvalTreeItem[] {
        const rules = this.configManager.getEvalRules();
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

        const items: EvalTreeItem[] = [];
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
     * Second level: individual rules within a domain.
     */
    private getDomainChildren(domain: EvalDomain): EvalTreeItem[] {
        const rules = this.configManager.getEvalRules().filter((r) => r.domain === domain);

        const items: EvalTreeItem[] = rules.map((rule) => {
            const { hitCount, lastTriggered } = this.getHitStats(rule.id);
            return new EvalRuleTreeItem(rule, hitCount, lastTriggered);
        });

        // For the LOCAL domain, also include dynamic evals from state
        if (domain === 'LOCAL' && this.stateManager) {
            const localEvals = this.stateManager.getLocalEvals();
            for (const localEval of localEvals) {
                const { hitCount, lastTriggered } = this.getHitStats(localEval.id);
                const isCurrentSession = localEval.created_at >= this.sessionStartTime;
                items.push(new DynamicEvalRuleTreeItem(localEval, hitCount, lastTriggered, isCurrentSession));
            }
        }

        return items;
    }

    /**
     * Third level: rule text and rationale details.
     */
    private getRuleDetails(rule: EvalRule | LocalEval): EvalRuleDetailItem[] {
        const items: EvalRuleDetailItem[] = [];

        if (rule.rule) {
            items.push(new EvalRuleDetailItem('Rule', rule.rule));
        }
        if (rule.rationale) {
            items.push(new EvalRuleDetailItem('Rationale', rule.rationale));
        }

        return items;
    }

    /**
     * Compute hit count and last-triggered timestamp for a rule
     * by querying the ObservationStore.
     */
    private getHitStats(evalId: string): { hitCount: number; lastTriggered: string | undefined } {
        const observations = this.observationStore.getObservations({ evalId });
        if (observations.length === 0) {
            return { hitCount: 0, lastTriggered: undefined };
        }

        // Find most recent timestamp
        let latest = observations[0].timestamp;
        for (const obs of observations) {
            if (obs.timestamp > latest) {
                latest = obs.timestamp;
            }
        }

        return { hitCount: observations.length, lastTriggered: latest };
    }

    private createEmptyStateItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(
            'No eval rules found — check sentinel config',
            vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('info');
        return item as EvalTreeItem;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
