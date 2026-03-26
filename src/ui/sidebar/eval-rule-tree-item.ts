import * as vscode from 'vscode';
import { EvalDomain, EvalRule, LocalEval } from '../../types/eval-rule.js';

/**
 * Severity metadata for eval rules — mirrors observation-tree-item.ts conventions.
 */
const SEVERITY_META: Record<string, { icon: string; color: string; label: string }> = {
    critical: { icon: 'circle-filled', color: 'charts.red', label: 'CRITICAL' },
    warning: { icon: 'circle-filled', color: 'charts.orange', label: 'WARNING' },
    info: { icon: 'circle-filled', color: 'charts.blue', label: 'INFO' },
};

const DOMAIN_META: Record<EvalDomain, { icon: string; label: string }> = {
    GEN: { icon: 'checklist', label: 'General' },
    SEC: { icon: 'shield', label: 'Security' },
    LOCAL: { icon: 'star-full', label: 'Dynamic' },
};

/**
 * Top-level domain grouping node.
 */
export class DomainTreeItem extends vscode.TreeItem {
    constructor(
        public readonly domain: EvalDomain,
        public readonly ruleCount: number,
        public readonly enabledCount: number,
    ) {
        const meta = DOMAIN_META[domain];
        super(
            `${meta.label} (${domain})`,
            vscode.TreeItemCollapsibleState.Expanded,
        );

        this.description = `${enabledCount}/${ruleCount} active`;
        this.iconPath = new vscode.ThemeIcon(meta.icon);
        this.contextValue = 'evalDomain';

        this.tooltip = new vscode.MarkdownString(
            `**${meta.label}** domain\n\n${enabledCount} of ${ruleCount} rules enabled`,
        );
    }
}

/**
 * Individual eval rule node.
 */
export class EvalRuleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly rule: EvalRule,
        public readonly hitCount: number,
        public readonly lastTriggered: string | undefined,
    ) {
        super(rule.id, vscode.TreeItemCollapsibleState.Collapsed);

        const meta = SEVERITY_META[rule.severity] ?? SEVERITY_META.info;

        // Description: severity + hit count + enabled state
        const parts: string[] = [meta.label];
        if (hitCount > 0) {
            parts.push(`${hitCount} hit${hitCount !== 1 ? 's' : ''}`);
        }
        if (!rule.enabled) {
            parts.push('DISABLED');
        }
        this.description = parts.join('  |  ');

        // Icon reflects severity; dimmed if disabled
        if (rule.enabled) {
            this.iconPath = new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
        }

        this.contextValue = rule.enabled ? 'evalRule.enabled' : 'evalRule.disabled';

        // Rich tooltip
        const tooltipLines = [
            `**${rule.id}** — ${meta.label}`,
            '',
            `**Domain:** ${rule.domain}  |  **Version:** ${rule.version}`,
            `**Status:** ${rule.enabled ? 'Enabled' : 'Disabled'}`,
            `**Hits:** ${hitCount}`,
        ];
        if (lastTriggered) {
            tooltipLines.push(`**Last triggered:** ${lastTriggered}`);
        }
        tooltipLines.push('', '---', '', rule.rule.substring(0, 300));
        if (rule.rule.length > 300) {
            tooltipLines.push('...');
        }

        this.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
    }
}

/**
 * Tree item for a dynamically-created LOCAL eval rule.
 * Visually distinct from static rules with a sparkle icon and "dynamic" badge.
 */
export class DynamicEvalRuleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly localEval: LocalEval,
        public readonly hitCount: number,
        public readonly lastTriggered: string | undefined,
        public readonly isCurrentSession: boolean,
    ) {
        super(localEval.id, vscode.TreeItemCollapsibleState.Collapsed);

        const meta = SEVERITY_META[localEval.severity] ?? SEVERITY_META.info;

        // Description: severity + dynamic badge + session indicator + hit count
        const parts: string[] = [meta.label, 'dynamic'];
        if (isCurrentSession) {
            parts.push('learned this session');
        }
        if (hitCount > 0) {
            parts.push(`${hitCount} hit${hitCount !== 1 ? 's' : ''}`);
        }
        this.description = parts.join('  |  ');

        // Sparkle icon for dynamic evals
        this.iconPath = new vscode.ThemeIcon('sparkle', new vscode.ThemeColor(meta.color));

        this.contextValue = 'evalRule.dynamic';

        // Rich tooltip
        const tooltipLines = [
            `**${localEval.id}** — ${meta.label} *(dynamic)*`,
            '',
            `**Sentinel:** ${localEval.sentinel_name}  |  **Session:** ${localEval.session_id.slice(0, 8)}`,
            `**Created:** ${localEval.created_at}`,
            `**Hits:** ${hitCount}`,
        ];
        if (isCurrentSession) {
            tooltipLines.push('', '> *Learned during the current session*');
        }
        if (lastTriggered) {
            tooltipLines.push(`**Last triggered:** ${lastTriggered}`);
        }
        tooltipLines.push('', '---', '', localEval.rule.substring(0, 300));
        if (localEval.rule.length > 300) {
            tooltipLines.push('...');
        }

        this.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
    }
}

/**
 * Leaf node showing rule text or rationale detail.
 */
export class EvalRuleDetailItem extends vscode.TreeItem {
    constructor(label: string, detail: string) {
        super('', vscode.TreeItemCollapsibleState.None);

        // For multi-line text, show first line in label, rest in tooltip
        const firstLine = detail.split('\n')[0].trim();
        const truncated = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
        this.label = `${label}: ${truncated}`;
        this.iconPath = new vscode.ThemeIcon('dash');

        if (detail.length > truncated.length) {
            this.tooltip = new vscode.MarkdownString(`**${label}**\n\n${detail}`);
        }
    }
}
