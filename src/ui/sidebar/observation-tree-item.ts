import * as vscode from 'vscode';
import * as path from 'path';
import { PersistentObservation } from '../../types/observation.js';

/**
 * Severity metadata: SVG icon filename and accessible label.
 * Uses file-based SVGs so colors persist on list selection/focus
 * (ThemeIcon colors get overridden by VS Code's selection foreground).
 */
const SEVERITY_META: Record<string, { iconFile: string; label: string }> = {
    critical: { iconFile: 'severity-critical.svg', label: 'CRITICAL' },
    warning: { iconFile: 'severity-warning.svg', label: 'WARNING' },
    info: { iconFile: 'severity-info.svg', label: 'INFO' },
};

const STATUS_META = { iconFile: 'severity-status.svg', label: 'STATUS' };

let extensionUri: vscode.Uri | undefined;

/** Call once during activation to set the extension root for icon paths. */
export function setExtensionUri(uri: vscode.Uri): void {
    extensionUri = uri;
}

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
    constructor(public readonly observation: PersistentObservation, sessionLabel?: string) {
        const badge = observation.hook_type === 'pre' ? 'PREVENTED' : 'OBSERVED';
        const meta = SEVERITY_META[observation.severity] ?? STATUS_META;

        // Severity conveyed by colored icon; eval_id + one_liner get full width
        const label = `${observation.eval_id}: ${observation.one_liner}`;

        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.description = `${relativeTime(observation.timestamp)}  ${badge}`;
        if (extensionUri) {
            this.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icons', meta.iconFile);
        }
        this.contextValue = `observation.${observation.severity}`;

        // P1-14: Clickable observation → navigate to Claude Code session
        if (observation.session_id) {
            this.command = {
                command: 'sentinel.navigateToSession',
                title: 'Navigate to Session',
                arguments: [observation.session_id],
            };
        }

        const displaySession = sessionLabel ?? observation.session_id;

        this.tooltip = new vscode.MarkdownString(
            [
                `**${meta.label}** — ${observation.eval_id}`,
                '',
                observation.one_liner,
                '',
                `**Sentinel:** ${observation.sentinel_label} (${observation.sentinel_name})`,
                `**Tier:** ${observation.tier}  |  **Hook:** ${observation.hook_type}  |  **Action:** ${badge}`,
                `**Turn:** ${observation.turn_number}  |  **Duration:** ${observation.duration_ms}ms`,
                `**Session:** ${displaySession}`,
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

/** Severity priority for determining highest severity in a group. */
const SEVERITY_PRIORITY: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
};

/**
 * A group tree item representing a session that contains observations.
 * Used when "Group by Session" mode is active.
 */
export class SessionGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly sessionId: string,
        sessionLabel: string,
        observationCount: number,
        displaySeverity: string,
    ) {
        super(sessionLabel, vscode.TreeItemCollapsibleState.Expanded);

        this.description = `${observationCount} observation${observationCount === 1 ? '' : 's'}`;
        this.contextValue = 'observationGroup';

        // Use the icon for the display severity (determined by caller based on config)
        const meta = SEVERITY_META[displaySeverity] ?? STATUS_META;
        if (extensionUri) {
            this.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icons', meta.iconFile);
        }

        // Clicking a session group header navigates to that Claude Code conversation
        if (sessionId) {
            this.command = {
                command: 'sentinel.navigateToSession',
                title: 'Navigate to Session',
                arguments: [sessionId],
            };
        }
    }

    /**
     * Determine the highest severity from a list of observations.
     */
    static highestSeverityOf(observations: PersistentObservation[]): string {
        let best = 'info';
        let bestPri = SEVERITY_PRIORITY[best] ?? 999;
        for (const obs of observations) {
            const pri = SEVERITY_PRIORITY[obs.severity] ?? 999;
            if (pri < bestPri) {
                best = obs.severity;
                bestPri = pri;
            }
        }
        return best;
    }
}
