import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import type { HealthViewData, TimelinePoint } from '../../types/health-metrics.js';
import { getSessionHealthHtml, renderHealthCharts } from '../webview/session-health/index.js';
import { Debouncer } from '../../utils/debouncer.js';

const SPARKLINE_WINDOW = 20;
const MAX_CHART_POINTS = 200;

/**
 * WebviewViewProvider for the Session Health panel.
 *
 * Computes health metrics from the ObservationStore and renders them
 * as SVG charts in a sidebar webview. Updates automatically when
 * new observations arrive.
 */
export class SessionHealthProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'sentinel.sessionHealth';

    private view: vscode.WebviewView | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private sessionFilter: string | undefined;
    private maxAgeMs: number | undefined;
    private readonly updateDebouncer: Debouncer;

    constructor(
        private readonly store: ObservationStore,
        private readonly stateManager: StateManager,
    ) {
        this.updateDebouncer = new Debouncer(() => this.doUpdate(), 500);

        // Re-render when new observations arrive
        this.disposables.push(
            store.onObservationReceived(() => this.update()),
        );
    }

    /** Set session filter (undefined = all sessions). */
    setSessionFilter(sessionId: string | undefined): void {
        this.sessionFilter = sessionId;
        this.update();
    }

    /** Set a recency window so the panel matches the status bar's time filter. */
    setMaxAge(maxAgeMs: number | undefined): void {
        this.maxAgeMs = maxAgeMs;
        this.update();
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        const nonce = crypto.randomBytes(16).toString('hex');
        webviewView.webview.html = getSessionHealthHtml(nonce, webviewView.webview.cspSource);

        // Send initial data
        this.update();

        // Re-send when the view becomes visible again
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.update();
            }
        }, null, this.disposables);
    }

    /**
     * Debounced entry point — batches rapid observation arrivals.
     */
    private update(): void {
        if (!this.view?.visible) {
            return;
        }
        this.updateDebouncer.trigger();
    }

    /**
     * Downsample an array to at most maxPoints entries, preserving first and last.
     */
    private static downsample<T>(data: T[], maxPoints: number): T[] {
        if (data.length <= maxPoints) return data;
        const step = Math.ceil(data.length / maxPoints);
        return data.filter((_, i) => i % step === 0 || i === data.length - 1);
    }

    /**
     * Compute metrics from the observation store and push to the webview.
     */
    private doUpdate(): void {
        if (!this.view?.visible) {
            return;
        }

        const filter: import('../../stores/observation-store.js').ObservationFilter = {};
        if (this.sessionFilter) filter.sessionId = this.sessionFilter;
        if (this.maxAgeMs) filter.since = new Date(Date.now() - this.maxAgeMs).toISOString();
        const observations = this.store.getObservations(
            Object.keys(filter).length > 0 ? filter : undefined,
        );

        const evalCount = observations.length;

        // Single pass for severity counts and duration sum
        let failures = 0;
        let critical = 0;
        let warning = 0;
        let info = 0;
        let dynamicRulesCount = 0;
        let totalDuration = 0;
        for (const o of observations) {
            totalDuration += o.duration_ms;
            if (o.dynamic_eval_created) dynamicRulesCount++;
            switch (o.severity) {
                case 'critical':
                    critical++;
                    failures++;
                    break;
                case 'warning':
                    warning++;
                    failures++;
                    break;
                case 'info':
                    info++;
                    break;
            }
        }

        const failureRate = evalCount > 0 ? (failures / evalCount) * 100 : 0;
        const avgDurationMs = evalCount > 0 ? totalDuration / evalCount : 0;

        // Latency trend (last N observations, chronological order)
        const sorted = [...observations].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const latencyTrend = sorted.slice(-SPARKLINE_WINDOW).map(o => o.duration_ms);

        // Timeline points — downsample for chart rendering
        const timelineAll: TimelinePoint[] = sorted.map(o => ({
            timestamp: o.timestamp,
            severity: o.severity,
            evalId: o.eval_id,
        }));
        const timeline = SessionHealthProvider.downsample(timelineAll, MAX_CHART_POINTS);

        const data: HealthViewData = {
            type: 'healthUpdate',
            summary: { evalCount, failureRate, dynamicRulesCount, avgDurationMs },
            severity: { critical, warning, info },
            latencyTrend,
            timeline,
        };

        // Pre-render charts on extension host side (keeps webview CSP tight)
        const charts = renderHealthCharts(data);

        void this.view.webview.postMessage({
            ...data,
            sparklineSvg: charts.sparklineSvg,
            donutSvg: charts.donutSvg,
            timelineSvg: charts.timelineSvg,
        });
    }

    dispose(): void {
        this.updateDebouncer.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
