import * as vscode from 'vscode';

/**
 * Health states for the sentinel status bar.
 */
export type HealthState = 'not-initialized' | 'idle' | 'running' | 'degraded' | 'error';

interface StatusInfo {
    healthState: HealthState;
    sessionCount: number;
    lastObservationSeverity: string | undefined;
    sessionContext: string | undefined;
    sessionDetail: string | undefined;
}

const HEALTH_LABELS: Record<HealthState, string> = {
    'not-initialized': 'Not Initialized',
    'idle': 'Idle',
    'running': 'Running',
    'degraded': 'Degraded',
    'error': 'Error',
};

const HEALTH_ICONS: Record<HealthState, string> = {
    'not-initialized': '$(shield)',
    'idle': '$(shield)',
    'running': '$(eye)',
    'degraded': '$(warning)',
    'error': '$(error)',
};

/**
 * Manages the sentinel status bar item, including health state display
 * and tooltip information.
 */
export class StatusBarManager implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    private info: StatusInfo = {
        healthState: 'not-initialized',
        sessionCount: 0,
        lastObservationSeverity: undefined,
        sessionContext: undefined,
        sessionDetail: undefined,
    };

    constructor(_context: vscode.ExtensionContext) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );
        this.item.command = 'sentinel.setViewMode';

        // Initial render — status bar is always visible
        this.render();
        this.item.show();
    }

    // ── Public API ──────────────────────────────────────────────

    /**
     * Update the displayed health state.
     */
    setHealthState(state: HealthState): void {
        this.info.healthState = state;
        this.render();
    }

    /**
     * Update the active session count shown in the tooltip.
     */
    setSessionCount(count: number): void {
        this.info.sessionCount = count;
        this.render();
    }

    /**
     * Update the last observation severity shown in the tooltip.
     */
    setLastObservationSeverity(severity: string | undefined): void {
        this.info.lastObservationSeverity = severity;
        this.render();
    }

    /**
     * Update the session context label shown in the status bar text.
     * Values: 'All' | session name | 'Pinned: name' | undefined
     */
    setSessionContext(context: string | undefined, detail?: string): void {
        this.info.sessionContext = context;
        this.info.sessionDetail = detail;
        this.render();
    }

    /**
     * Convenience: update all status fields at once.
     */
    update(partial: Partial<StatusInfo>): void {
        Object.assign(this.info, partial);
        this.render();
    }

    dispose(): void {
        this.item.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    // ── Internals ───────────────────────────────────────────────

    private render(): void {
        const { healthState } = this.info;

        // Text — include session context when available
        const sessionSuffix = this.info.sessionContext ? ` (${this.info.sessionContext})` : '';
        this.item.text = `${HEALTH_ICONS[healthState]} Sentinel${sessionSuffix}`;

        // Colors
        this.item.color = this.getForegroundColor(healthState);
        this.item.backgroundColor = this.getBackgroundColor(healthState);

        // Tooltip
        this.item.tooltip = this.buildTooltip();
    }

    private getForegroundColor(state: HealthState): string | vscode.ThemeColor | undefined {
        switch (state) {
            case 'not-initialized':
                return new vscode.ThemeColor('disabledForeground');
            case 'idle':
                return new vscode.ThemeColor('charts.blue');
            case 'running':
                return new vscode.ThemeColor('charts.green');
            case 'degraded':
                return undefined; // let background carry the signal
            case 'error':
                return undefined;
        }
    }

    private getBackgroundColor(state: HealthState): vscode.ThemeColor | undefined {
        switch (state) {
            case 'degraded':
                return new vscode.ThemeColor('statusBarItem.warningBackground');
            case 'error':
                return new vscode.ThemeColor('statusBarItem.errorBackground');
            default:
                return undefined;
        }
    }

    private buildTooltip(): vscode.MarkdownString {
        const { healthState, sessionCount, lastObservationSeverity } = this.info;
        const lines: string[] = [
            `**Agent Sentinel**`,
            ``,
            `Health: ${HEALTH_LABELS[healthState]}`,
            `Active sessions: ${sessionCount}`,
        ];

        if (lastObservationSeverity) {
            lines.push(`Last observation: ${lastObservationSeverity}`);
        }

        if (this.info.sessionContext) {
            lines.push(`View: ${this.info.sessionContext}`);
        }
        if (this.info.sessionDetail) {
            lines.push(`Session: ${this.info.sessionDetail}`);
        }

        lines.push(``, `*(click to change view mode)*`);

        const md = new vscode.MarkdownString(lines.join('\n\n'));
        md.isTrusted = true;
        return md;
    }
}
