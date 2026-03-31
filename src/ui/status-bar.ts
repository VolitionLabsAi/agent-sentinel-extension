import * as vscode from 'vscode';

/**
 * Observation severity levels that drive status bar appearance.
 */
export type ObservationSeverityLevel = 'none' | 'info' | 'warning' | 'critical';

/**
 * Legacy HealthState kept for the health assessor's own use.
 * Only 'not-initialized' is used by the status bar directly.
 */
export type HealthState = 'not-initialized' | 'idle' | 'running' | 'degraded' | 'error';

interface StatusInfo {
    initialized: boolean;
    highestSeverity: ObservationSeverityLevel;
    sessionCount: number;
    severityCounts: { info: number; warning: number; critical: number };
    sessionContext: string | undefined;
    sessionDetail: string | undefined;
}

const SEVERITY_ICONS: Record<ObservationSeverityLevel, string> = {
    'none': '$(eye)',
    'info': '$(eye)',
    'warning': '$(warning)',
    'critical': '$(error)',
};

const SEVERITY_LABELS: Record<ObservationSeverityLevel, string> = {
    'none': 'No observations',
    'info': 'Info only',
    'warning': 'Warning present',
    'critical': 'Critical present',
};

/**
 * Manages the sentinel status bar item, displaying observation severity
 * and tooltip information.
 */
export class StatusBarManager implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    private info: StatusInfo = {
        initialized: false,
        highestSeverity: 'none',
        sessionCount: 0,
        severityCounts: { info: 0, warning: 0, critical: 0 },
        sessionContext: undefined,
        sessionDetail: undefined,
    };

    constructor(_context: vscode.ExtensionContext) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );

        // Initial render — status bar is always visible
        this.render();
        this.item.show();
    }

    // ── Public API ──────────────────────────────────────────────

    /**
     * Mark sentinel as initialized (binary found, config present, sessions possible).
     * When not initialized, the status bar shows a gray shield.
     */
    setInitialized(initialized: boolean): void {
        this.info.initialized = initialized;
        this.render();
    }

    /**
     * Update the displayed highest observation severity.
     * Drives the icon and color of the status bar.
     */
    setHighestSeverity(severity: ObservationSeverityLevel): void {
        this.info.highestSeverity = severity;
        this.render();
    }

    /**
     * Update observation counts by severity for the tooltip.
     */
    setSeverityCounts(counts: { info: number; warning: number; critical: number }): void {
        this.info.severityCounts = { ...counts };
        this.render();
    }

    /**
     * Legacy adapter: setHealthState maps to initialized state.
     * Only 'not-initialized' sets initialized=false; all others set initialized=true.
     * The health assessor still calls this for the not-initialized detection.
     */
    setHealthState(state: HealthState): void {
        this.info.initialized = state !== 'not-initialized';
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
     * Update the session context label shown in the status bar text.
     * Values: 'All' | 'Recent' | 'Pinned' | session name | undefined
     */
    setSessionContext(context: string | undefined, detail?: string): void {
        this.info.sessionContext = context;
        this.info.sessionDetail = detail;
        this.render();
    }

    /**
     * Convenience: update multiple status fields at once.
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
        const { initialized, highestSeverity } = this.info;

        // Text — include session context when available
        const sessionSuffix = this.info.sessionContext ? ` (${this.info.sessionContext})` : '';

        if (!initialized) {
            // Not initialized: gray shield
            this.item.text = `$(shield) Sentinel${sessionSuffix}`;
            this.item.color = new vscode.ThemeColor('disabledForeground');
            this.item.backgroundColor = undefined;
        } else {
            // Severity-driven icon and colors
            this.item.text = `${SEVERITY_ICONS[highestSeverity]} Sentinel${sessionSuffix}`;
            this.item.color = this.getForegroundColor(highestSeverity);
            this.item.backgroundColor = this.getBackgroundColor(highestSeverity);
        }

        // Dynamic click command based on severity
        if (highestSeverity === 'warning' || highestSeverity === 'critical') {
            this.item.command = 'sentinel.openObservations';
        } else {
            this.item.command = 'sentinel.showInsights';
        }

        // Tooltip
        this.item.tooltip = this.buildTooltip();
    }

    private getForegroundColor(severity: ObservationSeverityLevel): string | vscode.ThemeColor | undefined {
        switch (severity) {
            case 'none':
                return new vscode.ThemeColor('charts.green');
            case 'info':
                return new vscode.ThemeColor('charts.blue');
            case 'warning':
                return undefined; // let background carry the signal
            case 'critical':
                return undefined;
        }
    }

    private getBackgroundColor(severity: ObservationSeverityLevel): vscode.ThemeColor | undefined {
        switch (severity) {
            case 'warning':
                return new vscode.ThemeColor('statusBarItem.warningBackground');
            case 'critical':
                return new vscode.ThemeColor('statusBarItem.errorBackground');
            default:
                return undefined;
        }
    }

    private buildTooltip(): vscode.MarkdownString {
        const { initialized, highestSeverity, sessionCount, severityCounts } = this.info;
        const lines: string[] = [
            `**Agent Sentinel**`,
            ``,
        ];

        if (!initialized) {
            lines.push(`Status: Not Initialized`);
        } else {
            lines.push(`Highest severity: ${SEVERITY_LABELS[highestSeverity]}`);
            lines.push(`Observations: ${severityCounts.critical} critical, ${severityCounts.warning} warning, ${severityCounts.info} info`);
        }

        lines.push(`Active sessions: ${sessionCount}`);

        if (this.info.sessionContext) {
            lines.push(`View: ${this.info.sessionContext}`);
        }
        if (this.info.sessionDetail) {
            lines.push(`Session: ${this.info.sessionDetail}`);
        }

        const clickTarget = (highestSeverity === 'warning' || highestSeverity === 'critical')
            ? 'Observations'
            : 'Insights';
        lines.push(``, `*(click to open ${clickTarget})*`);

        const md = new vscode.MarkdownString(lines.join('\n\n'));
        md.isTrusted = true;
        return md;
    }
}
