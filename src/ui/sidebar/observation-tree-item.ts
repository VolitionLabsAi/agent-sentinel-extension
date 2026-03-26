import * as vscode from 'vscode';
import { PersistentObservation } from '../../types/observation.js';

/**
 * Severity metadata: icon name (codicon), ThemeColor id, and accessible label.
 */
const SEVERITY_META: Record<string, { icon: string; color: string; label: string }> = {
    critical: { icon: 'circle-filled', color: 'charts.red', label: 'CRITICAL' },
    warning: { icon: 'circle-filled', color: 'charts.orange', label: 'WARNING' },
    info: { icon: 'circle-filled', color: 'charts.blue', label: 'INFO' },
};

const STATUS_META = { icon: 'circle-filled', color: 'charts.green', label: 'STATUS' };

/**
 * Format a timestamp as a relative string (e.g., '2m ago').
 */
function relativeTime(isoTimestamp: string): string {
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) { return `${seconds}s ago`; }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) { return `${minutes}m ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `${hours}h ago`; }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * A top-level observation tree item — collapsible, with severity icon and action badge.
 */
export class ObservationTreeItem extends vscode.TreeItem {
    constructor(public readonly observation: PersistentObservation) {
        const badge = observation.hook_type === 'pre' ? 'PREVENTED' : 'OBSERVED';
        const meta = SEVERITY_META[observation.severity] ?? STATUS_META;

        // Label includes severity text for accessibility (not color alone)
        const label = `[${meta.label}] ${observation.eval_id} — ${observation.one_liner}`;

        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.description = `${relativeTime(observation.timestamp)}  ${badge}`;
        this.iconPath = new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color));
        this.contextValue = `observation.${observation.severity}`;

        this.tooltip = new vscode.MarkdownString(
            [
                `**${meta.label}** — ${observation.eval_id}`,
                '',
                observation.one_liner,
                '',
                `**Sentinel:** ${observation.sentinel_label} (${observation.sentinel_name})`,
                `**Tier:** ${observation.tier}  |  **Hook:** ${observation.hook_type}  |  **Action:** ${badge}`,
                `**Turn:** ${observation.turn_number}  |  **Duration:** ${observation.duration_ms}ms`,
                `**Session:** ${observation.session_id}`,
                `**Timestamp:** ${observation.timestamp}`,
                '',
                observation.analysis ? `---\n${observation.analysis}` : '',
            ].join('\n'),
        );
    }
}

/**
 * A child detail item shown when an ObservationTreeItem is expanded.
 */
export class ObservationDetailItem extends vscode.TreeItem {
    constructor(label: string, detail: string) {
        super('', vscode.TreeItemCollapsibleState.None);
        this.label = `${label}: ${detail}`;
        this.iconPath = new vscode.ThemeIcon('dash');
    }
}
