import * as vscode from 'vscode';
import { SentinelCLI } from '../cli/sentinel-cli.js';
import type { HealthState } from '../ui/status-bar.js';

/**
 * Event payload emitted when the health state changes.
 */
export interface HealthChangedEvent {
    state: HealthState;
    message?: string;
}

/**
 * Minimal interface for status bar initialization updates.
 * The health assessor only sets initialized state (not colors/severity).
 */
interface StatusBarInitSink {
    setHealthState(state: HealthState): void;
}

/**
 * Expected shape of `sentinel doctor --format json` output.
 */
interface DoctorOutput {
    status?: string;
    checks?: Array<{
        name: string;
        status: string;
        message?: string;
    }>;
    message?: string;
}

/**
 * Periodically assesses project health by running `sentinel doctor`
 * and updating the StatusBarManager accordingly.
 *
 * Triggers:
 *  - On activation (initial check)
 *  - On config file change
 *  - On `sentinel.runHealthCheck` command
 *  - Periodically (every `sentinel.doctor.backgroundInterval` seconds)
 */
export class HealthAssessor implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly cli: SentinelCLI;
    private readonly statusBar: StatusBarInitSink;

    private readonly _onHealthChanged = new vscode.EventEmitter<HealthChangedEvent>();
    readonly onHealthChanged = this._onHealthChanged.event;

    private currentState: HealthState = 'not-initialized';
    private intervalHandle: ReturnType<typeof setInterval> | undefined;
    private _isRunning = false;

    constructor(cli: SentinelCLI, statusBar: StatusBarInitSink) {
        this.cli = cli;
        this.statusBar = statusBar;
        this.disposables.push(this._onHealthChanged);
    }

    /**
     * Start the periodic background check using the configured interval.
     */
    startPeriodicCheck(): void {
        this.stopPeriodicCheck();

        // Default background interval: 300 seconds (5 minutes)
        const intervalSec = 300;

        this.intervalHandle = setInterval(() => {
            this.runCheckForAllFolders().catch((err) => {
                console.warn('[Agent Sentinel] Periodic health check failed:', err);
            });
        }, intervalSec * 1000);
    }

    /**
     * Stop the periodic background check.
     */
    stopPeriodicCheck(): void {
        if (this.intervalHandle !== undefined) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
        }
    }

    /**
     * Run a health check for the first workspace folder (convenience).
     */
    async runCheckForAllFolders(): Promise<void> {
        if (this._isRunning) { return; }
        this._isRunning = true;
        try {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                this.setState('not-initialized', 'No workspace folder open');
                return;
            }
            await this.runCheck(folder.uri.fsPath);
        } finally {
            this._isRunning = false;
        }
    }

    /**
     * Run `sentinel doctor` for a given project directory and update health state.
     */
    async runCheck(projectDir: string): Promise<HealthState> {
        // First check if binary is available at all
        const available = await this.cli.isBinaryAvailable();
        if (!available) {
            this.setState(
                'not-initialized',
                'sentinel/vl binary not found. Install it to enable health checks.',
            );
            return this.currentState;
        }

        try {
            const result = await this.cli.execSentinel(['doctor'], projectDir);
            const state = this.mapResultToState(result.exitCode, result.json);
            const message = this.extractMessage(result.json);
            this.setState(state, message);
        } catch (err) {
            console.warn('[Agent Sentinel] Health check error:', err);
            this.setState('error', err instanceof Error ? err.message : String(err));
        }

        return this.currentState;
    }

    /**
     * Get the current health state.
     */
    getState(): HealthState {
        return this.currentState;
    }

    dispose(): void {
        this.stopPeriodicCheck();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── Private helpers ────────────────────────────────────────

    private setState(state: HealthState, message?: string): void {
        const changed = state !== this.currentState;
        this.currentState = state;
        this.statusBar.setHealthState(state);

        if (changed) {
            this._onHealthChanged.fire({ state, message });
        }
    }

    /**
     * Map CLI exit code + parsed JSON to a HealthState.
     *
     * Exit codes: 0 = success, 1 = warnings, 2 = errors
     */
    private mapResultToState(exitCode: number, json: unknown): HealthState {
        // If JSON has a status field, prefer it
        if (json && typeof json === 'object' && 'status' in json) {
            const doc = json as DoctorOutput;
            switch (doc.status) {
                case 'ok':
                case 'healthy':
                    return 'idle';
                case 'running':
                    return 'running';
                case 'degraded':
                case 'warning':
                case 'warnings':
                    return 'degraded';
                case 'error':
                case 'unhealthy':
                    return 'error';
                case 'not-initialized':
                case 'not_initialized':
                    return 'not-initialized';
            }
        }

        // Fall back to exit code
        switch (exitCode) {
            case 0:
                return 'idle';
            case 1:
                return 'degraded';
            case 2:
                return 'error';
            default:
                return 'error';
        }
    }

    /**
     * Extract a human-readable message from doctor output.
     */
    private extractMessage(json: unknown): string | undefined {
        if (!json || typeof json !== 'object') {
            return undefined;
        }

        const doc = json as DoctorOutput;

        if (doc.message) {
            return doc.message;
        }

        // Summarise failing checks
        const failing = doc.checks?.filter(
            (c) => c.status !== 'ok' && c.status !== 'pass',
        );
        if (failing && failing.length > 0) {
            return failing.map((c) => `${c.name}: ${c.message ?? c.status}`).join('; ');
        }

        return undefined;
    }
}
