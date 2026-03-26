import type { DonutSegment } from '../../types/health-metrics.js';

const DEFAULT_SIZE = 120;
const DEFAULT_THICKNESS = 16;

/**
 * Generate an SVG donut chart with a center label and legend.
 *
 * Each segment is rendered as a circle stroke-dasharray arc.
 * Returns a complete SVG string with embedded legend.
 */
export function renderDonut(
    segments: DonutSegment[],
    options?: { size?: number; thickness?: number },
): string {
    const size = options?.size ?? DEFAULT_SIZE;
    const thickness = options?.thickness ?? DEFAULT_THICKNESS;
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const cx = size / 2;
    const cy = size / 2;

    if (total === 0) {
        return [
            `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="No observations to display">`,
            `  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--vscode-editorWidget-border)" stroke-width="${thickness}" opacity="0.3" />`,
            `  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="var(--vscode-descriptionForeground)" font-size="13" font-weight="bold">0</text>`,
            `</svg>`,
        ].join('\n');
    }

    const arcs: string[] = [];
    let offset = 0;

    for (const segment of segments) {
        if (segment.value === 0) {
            continue;
        }
        const fraction = segment.value / total;
        const dashLength = fraction * circumference;
        const gapLength = circumference - dashLength;
        // rotate -90deg so arcs start at top
        const rotation = (offset / total) * 360 - 90;

        arcs.push(
            `  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none"` +
            ` stroke="${segment.color}" stroke-width="${thickness}"` +
            ` stroke-dasharray="${dashLength.toFixed(2)} ${gapLength.toFixed(2)}"` +
            ` transform="rotate(${rotation.toFixed(1)} ${cx} ${cy})"` +
            ` role="presentation" />`,
        );
        offset += segment.value;
    }

    const ariaLabel = segments
        .filter(s => s.value > 0)
        .map(s => `${s.label}: ${s.value}`)
        .join(', ');

    const legendItems = segments.map((s, i) => {
        const y = size + 18 + i * 18;
        return [
            `  <rect x="0" y="${y}" width="10" height="10" rx="2" fill="${s.color}" />`,
            `  <text x="16" y="${y + 9}" fill="var(--vscode-foreground)" font-size="11">${s.label}: ${s.value}</text>`,
        ].join('\n');
    }).join('\n');

    const totalHeight = size + 18 + segments.length * 18;

    return [
        `<svg width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}" role="img" aria-label="Severity distribution: ${ariaLabel}">`,
        ...arcs,
        `  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="var(--vscode-foreground)" font-size="16" font-weight="bold">${total}</text>`,
        legendItems,
        `</svg>`,
    ].join('\n');
}
