import type { HealthViewData } from '../../../types/health-metrics.js';
import { renderSparkline } from '../../charts/sparkline.js';
import { renderDonut } from '../../charts/donut.js';
import { renderTimeline } from '../../charts/timeline.js';
import { STYLES } from './styles-inline.js';

/**
 * Generate the full HTML content for the Session Health webview.
 *
 * @param nonce - CSP nonce for inline scripts
 * @param cspSource - The webview CSP source (`webview.cspSource`)
 */
export function getSessionHealthHtml(nonce: string, cspSource: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">${STYLES}</style>
</head>
<body>
    <div id="health-root" role="region" aria-label="Session Health Dashboard">
        <div class="empty-state" id="empty-state">
            <div class="icon" aria-hidden="true">&#x1F6E1;</div>
            <div>Waiting for observations...</div>
        </div>

        <div id="content" style="display:none;" aria-live="polite" aria-atomic="false">
            <!-- Metrics Summary -->
            <div class="metrics-grid" role="group" aria-label="Summary metrics">
                <div class="metric-card" tabindex="0" aria-label="Evaluation count">
                    <span class="metric-value" id="eval-count">0</span>
                    <span class="metric-label">Evaluations</span>
                </div>
                <div class="metric-card" tabindex="0" aria-label="Failure rate">
                    <span class="metric-value" id="failure-rate">0%</span>
                    <span class="metric-label">Failure Rate</span>
                </div>
                <div class="metric-card" tabindex="0" aria-label="Dynamic rules count">
                    <span class="metric-value" id="dynamic-rules">0</span>
                    <span class="metric-label">Dynamic Rules</span>
                </div>
                <div class="metric-card" tabindex="0" aria-label="Average evaluation duration">
                    <span class="metric-value" id="avg-duration">0ms</span>
                    <span class="metric-label">Avg Duration</span>
                </div>
            </div>

            <!-- Latency Sparkline -->
            <div class="section">
                <div class="section-title">Latency Trend</div>
                <div class="chart-container" id="sparkline-container" tabindex="0" role="img" aria-label="Latency trend chart"></div>
            </div>

            <!-- Severity Donut -->
            <div class="section">
                <div class="section-title">Severity Distribution</div>
                <div class="chart-container" id="donut-container" tabindex="0" role="img" aria-label="Severity distribution chart"></div>
            </div>

            <!-- Observation Timeline -->
            <div class="section">
                <div class="section-title">Observation Timeline</div>
                <div class="chart-container" id="timeline-container" tabindex="0" role="img" aria-label="Observation timeline chart"></div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // Chart renderers are pure functions — we inline their logic
            // via the provider's postMessage which sends pre-rendered SVG.
            window.addEventListener('message', function(event) {
                const data = event.data;
                if (data.type !== 'healthUpdate') return;

                document.getElementById('empty-state').style.display = 'none';
                document.getElementById('content').style.display = 'block';

                // Update metrics
                document.getElementById('eval-count').textContent = String(data.summary.evalCount);

                const rateEl = document.getElementById('failure-rate');
                const rate = data.summary.failureRate;
                rateEl.textContent = Math.round(rate) + '%';
                rateEl.className = 'metric-value ' + (rate === 0 ? 'rate-ok' : rate < 20 ? 'rate-warn' : 'rate-critical');

                document.getElementById('dynamic-rules').textContent = String(data.summary.dynamicRulesCount);
                const ms = data.summary.avgDurationMs;
                document.getElementById('avg-duration').textContent = ms >= 1000
                    ? (ms / 1000).toFixed(1) + 's'
                    : Math.round(ms) + 'ms';

                // Update charts (pre-rendered SVG from provider)
                if (data.sparklineSvg) {
                    document.getElementById('sparkline-container').innerHTML = data.sparklineSvg;
                }
                if (data.donutSvg) {
                    document.getElementById('donut-container').innerHTML = data.donutSvg;
                }
                if (data.timelineSvg) {
                    document.getElementById('timeline-container').innerHTML = data.timelineSvg;
                }
            });
        })();
    </script>
</body>
</html>`;
}

/**
 * Pre-render the chart SVGs on the extension host side.
 * This avoids sending chart rendering code to the webview, keeping the CSP tight.
 */
export function renderHealthCharts(data: HealthViewData) {
    const sparklineSvg = renderSparkline(data.latencyTrend, {
        width: 260,
        height: 40,
    });

    const donutSvg = renderDonut([
        { label: 'Critical', value: data.severity.critical, color: 'var(--vscode-charts-red, #f44747)' },
        { label: 'Warning', value: data.severity.warning, color: 'var(--vscode-charts-yellow, #cca700)' },
        { label: 'Info', value: data.severity.info, color: 'var(--vscode-charts-blue, #3794ff)' },
    ]);

    const timelineSvg = renderTimeline(data.timeline, {
        width: 260,
        height: 60,
    });

    return { sparklineSvg, donutSvg, timelineSvg };
}
