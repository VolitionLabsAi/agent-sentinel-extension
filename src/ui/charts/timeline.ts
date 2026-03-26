import type { TimelinePoint, TimelineConfig } from '../../types/health-metrics.js';

const DEFAULTS: Required<TimelineConfig> = {
    width: 280,
    height: 60,
    dotRadius: 4,
};

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'var(--vscode-charts-red, #f44747)',
    warning: 'var(--vscode-charts-yellow, #cca700)',
    info: 'var(--vscode-charts-blue, #3794ff)',
};

/**
 * Generate an SVG timeline chart showing observations as colored dots
 * positioned along a time axis.
 *
 * The x-axis maps timestamps linearly. Severity is encoded by color
 * and y-position (critical at top, info at bottom).
 */
export function renderTimeline(points: TimelinePoint[], config?: TimelineConfig): string {
    const cfg = { ...DEFAULTS, ...config };
    const { width, height, dotRadius } = cfg;

    if (points.length === 0) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="No observations on timeline"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central" fill="var(--vscode-descriptionForeground)" font-size="11">No observations yet</text></svg>`;
    }

    const paddingX = dotRadius + 2;
    const paddingY = dotRadius + 2;
    const plotWidth = width - paddingX * 2;
    const plotHeight = height - paddingY * 2;

    // Time range
    const timestamps = points.map(p => new Date(p.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeRange = maxTime - minTime || 1;

    // Severity -> y position (critical at top, warning middle, info bottom)
    const severityY: Record<string, number> = {
        critical: paddingY,
        warning: paddingY + plotHeight / 2,
        info: paddingY + plotHeight,
    };

    const dots = points.map((point) => {
        const t = new Date(point.timestamp).getTime();
        const x = paddingX + ((t - minTime) / timeRange) * plotWidth;
        const y = severityY[point.severity] ?? paddingY + plotHeight / 2;
        const color = SEVERITY_COLORS[point.severity] ?? SEVERITY_COLORS.info;
        const time = new Date(point.timestamp).toLocaleTimeString();

        return `  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius}" fill="${color}" opacity="0.85" role="presentation"><title>${point.evalId} (${point.severity}) at ${time}</title></circle>`;
    });

    // Time axis line
    const axisY = height - 1;
    const axis = `  <line x1="${paddingX}" y1="${axisY}" x2="${width - paddingX}" y2="${axisY}" stroke="var(--vscode-editorWidget-border)" stroke-width="1" opacity="0.5" />`;

    // Time labels (start and end)
    const startLabel = new Date(minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endLabel = minTime === maxTime ? '' : new Date(maxTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const labels = [
        `  <text x="${paddingX}" y="${axisY - 2}" fill="var(--vscode-descriptionForeground)" font-size="9" text-anchor="start">${startLabel}</text>`,
    ];
    if (endLabel) {
        labels.push(
            `  <text x="${width - paddingX}" y="${axisY - 2}" fill="var(--vscode-descriptionForeground)" font-size="9" text-anchor="end">${endLabel}</text>`,
        );
    }

    const ariaLabel = `Observation timeline with ${points.length} events`;

    return [
        `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">`,
        axis,
        ...labels,
        ...dots,
        `</svg>`,
    ].join('\n');
}
