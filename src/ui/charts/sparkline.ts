import type { SparklineConfig } from '../../types/health-metrics.js';

const DEFAULTS: Required<SparklineConfig> = {
    width: 200,
    height: 40,
    lineColor: 'var(--vscode-charts-blue)',
    fillColor: 'var(--vscode-charts-blue)',
    strokeWidth: 1.5,
};

/**
 * Generate an SVG sparkline from an array of numeric values.
 *
 * Returns a smooth area chart with a filled region below the line.
 * Handles edge cases: empty data, single point, constant values.
 */
export function renderSparkline(data: number[], config?: SparklineConfig): string {
    const cfg = { ...DEFAULTS, ...config };
    const { width, height, lineColor, fillColor, strokeWidth } = cfg;

    if (data.length === 0) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="No latency data available"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central" fill="var(--vscode-descriptionForeground)" font-size="11">No data</text></svg>`;
    }

    const padding = 2;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Avoid division by zero for constant data

    // Map data to SVG coordinates
    const points = data.map((value, index) => {
        const x = padding + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
        const y = padding + plotHeight - ((value - min) / range) * plotHeight;
        return { x, y };
    });

    // Build the polyline path
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Build the filled area path (line + close to bottom)
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(height - padding).toFixed(1)} L${points[0].x.toFixed(1)},${(height - padding).toFixed(1)} Z`;

    const lastValue = data[data.length - 1];
    const ariaLabel = `Latency trend sparkline. ${data.length} points, latest value ${lastValue}ms`;

    return [
        `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">`,
        `  <path d="${areaPath}" fill="${fillColor}" fill-opacity="0.15" />`,
        `  <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
        // Endpoint dot
        `  <circle cx="${points[points.length - 1].x.toFixed(1)}" cy="${points[points.length - 1].y.toFixed(1)}" r="2" fill="${lineColor}" />`,
        `</svg>`,
    ].join('\n');
}
