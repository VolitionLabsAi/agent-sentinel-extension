import * as vscode from 'vscode';

/**
 * Health states for the sentinel status bar.
 */
export type HealthState = 'not-initialized' | 'idle' | 'running' | 'degraded' | 'error';

/**
 * Visibility mode cycled on click: auto → show → hide.
 */
type VisibilityMode = 'auto' | 'show' | 'hide';

interface StatusInfo {
    healthState: HealthState;
    sessionCount: number;
    lastObservationSeverity: string | undefined;
    sessionContext: string | undefined;
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
 * Manages the sentinel status bar item, including health state display,
 * click-to-cycle visibility, and tooltip information.
 */
export class StatusBarManager implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    private visibilityMode: VisibilityMode = 'auto';
    private info: StatusInfo = {
        healthState: 'not-initialized',
        sessionCount: 0,
        lastObservationSeverity: undefined,
        sessionContext: undefined,
    };

    constructor(_context: vscode.ExtensionContext) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );
        this.item.command = 'sentinel.cycleVisibility';

        // Register the cycle-visibility command
        const cmd = vscode.commands.registerCommand(
            'sentinel.cycleVisibility',
            () => this.cycleVisibility(),
        );
        this.disposables.push(cmd);

        // Listen for config changes
        const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('sentinel.statusBar.enabled')) {
                this.applyEnabledSetting();
            }
        });
        this.disposables.push(configWatcher);

        // Initial render
        this.render();
        this.applyEnabledSetting();
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
    setSessionContext(context: string | undefined): void {
        this.info.sessionContext = context;
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

    private cycleVisibility(): void {
        const order: VisibilityMode[] = ['auto', 'show', 'hide'];
        const idx = order.indexOf(this.visibilityMode);
        this.visibilityMode = order[(idx + 1) % order.length];
        this.render();
        this.applyEnabledSetting();
    }

    private applyEnabledSetting(): void {
        const enabled = vscode.workspace
            .getConfiguration('sentinel.statusBar')
            .get<boolean>('enabled', true);

        if (this.visibilityMode === 'hide') {
            this.item.hide();
        } else if (this.visibilityMode === 'show') {
            this.item.show();
        } else {
            // auto – respect the setting
            if (enabled) {
                this.item.show();
            } else {
                this.item.hide();
            }
        }
    }

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
            lines.push(`Session: ${this.info.sessionContext}`);
        }

        lines.push(``, `Visibility: ${this.visibilityMode} *(click to cycle)*`);

        const md = new vscode.MarkdownString(lines.join('\n\n'));
        md.isTrusted = true;
        return md;
    }
}
