import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ObservationStore } from '../../stores/observation-store.js';
import { StateManager } from '../../stores/state-manager.js';
import type { HealthViewData, TimelinePoint } from '../../types/health-metrics.js';
import { getSessionHealthHtml, renderHealthCharts } from '../webview/session-health/index.js';

const SPARKLINE_WINDOW = 20;

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

    constructor(
        private readonly store: ObservationStore,
        private readonly stateManager: StateManager,
    ) {
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
     * Compute metrics from the observation store and push to the webview.
     */
    private update(): void {
        if (!this.view?.visible) {
            return;
        }

        const observations = this.store.getObservations(
            this.sessionFilter ? { sessionId: this.sessionFilter } : undefined,
        );

        const evalCount = observations.length;

        // Failure = critical or warning
        const failures = observations.filter(o => o.severity === 'critical' || o.severity === 'warning').length;
        const failureRate = evalCount > 0 ? (failures / evalCount) * 100 : 0;

        // Dynamic rules
        const dynamicRulesCount = observations.filter(o => o.dynamic_eval_created).length;

        // Average duration
        const totalDuration = observations.reduce((sum, o) => sum + o.duration_ms, 0);
        const avgDurationMs = evalCount > 0 ? totalDuration / evalCount : 0;

        // Severity distribution
        const critical = observations.filter(o => o.severity === 'critical').length;
        const warning = observations.filter(o => o.severity === 'warning').length;
        const info = observations.filter(o => o.severity === 'info').length;

        // Latency trend (last N observations, chronological order)
        const sorted = [...observations].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const latencyTrend = sorted.slice(-SPARKLINE_WINDOW).map(o => o.duration_ms);

        // Timeline points
        const timeline: TimelinePoint[] = sorted.map(o => ({
            timestamp: o.timestamp,
            severity: o.severity,
            evalId: o.eval_id,
        }));

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
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
