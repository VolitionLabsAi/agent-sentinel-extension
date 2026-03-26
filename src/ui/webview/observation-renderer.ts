/**
 * Shared renderer for observation cards.
 *
 * Pure functions that convert PersistentObservation data into HTML fragments.
 * Designed for reuse across webview contexts (card panel, sidebar live feed, etc.).
 */

import { PersistentObservation } from '../../types/observation.js';

/** Map tier identifiers to display labels. */
const TIER_LABELS: Record<string, string> = {
    security: 'Tier 0',
    general: 'Tier 1',
    session: 'Tier 2',
};

/**
 * Escape HTML special characters to prevent injection.
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format an ISO timestamp for display.
 */
function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch {
        return iso;
    }
}

/**
 * Render a severity badge (CRITICAL / WARNING / INFO).
 */
export function renderBadge(severity: string): string {
    const level = severity.toLowerCase();
    const label = severity.toUpperCase();
    return `<span class="severity-badge ${escapeHtml(level)}" role="img" aria-label="${escapeHtml(label)} severity">${escapeHtml(label)}</span>`;
}

/**
 * Render a hook-type badge (PREVENTED for pre, OBSERVED for post).
 */
export function renderHookTypeBadge(hookType: string): string {
    const isPrevented = hookType === 'pre';
    const label = isPrevented ? 'PREVENTED' : 'OBSERVED';
    const cls = isPrevented ? 'hook-badge prevented' : 'hook-badge';
    return `<span class="${cls}" role="img" aria-label="Action: ${label}">${label}</span>`;
}

/**
 * Render a tier badge (Tier 0 / Tier 1 / Tier 2).
 */
export function renderTierBadge(tier: string): string {
    const display = TIER_LABELS[tier] ?? tier;
    return `<span class="tier-badge" role="img" aria-label="Evaluation tier: ${escapeHtml(display)}">(${escapeHtml(display)})</span>`;
}

/**
 * Render a full observation card as an HTML fragment.
 *
 * The returned string is a card element — not a full document.
 * Wrap with buildObservationCardHtml() for a complete webview page.
 */
export function renderCard(observation: PersistentObservation): string {
    const severityBadge = renderBadge(observation.severity);
    const hookBadge = renderHookTypeBadge(observation.hook_type);
    const tierBadge = renderTierBadge(observation.tier);
    const evalId = escapeHtml(observation.eval_id);
    const oneLiner = escapeHtml(observation.one_liner);
    const analysis = escapeHtml(observation.analysis);
    const timestamp = formatTimestamp(observation.timestamp);
    const sentinelLabel = escapeHtml(observation.sentinel_label);
    const sentinelName = escapeHtml(observation.sentinel_name);

    return `
<div class="observation-card">
    <div class="card-header">
        ${severityBadge}
        ${hookBadge}
        ${tierBadge}
        <span class="eval-id">${evalId}</span>
    </div>
    <div class="card-body">
        <div class="one-liner">${oneLiner}</div>
        <div class="analysis" aria-label="Analysis details">${analysis}</div>
    </div>
    <div class="card-footer">
        <div class="footer-left">
            <span><span class="footer-label">Sentinel:</span> <span class="footer-value">${sentinelLabel}</span></span>
            <span><span class="footer-label">Instance:</span> <span class="footer-value">${sentinelName}</span></span>
        </div>
        <div class="footer-right">
            <span class="footer-value">${escapeHtml(timestamp)}</span>
        </div>
    </div>
</div>
<div class="metadata-grid" aria-label="Observation metadata">
    <div class="metadata-item">
        <span class="meta-label">Turn:</span>
        <span class="meta-value">${observation.turn_number}</span>
    </div>
    <div class="metadata-item">
        <span class="meta-label">Duration:</span>
        <span class="meta-value">${observation.duration_ms}ms</span>
    </div>
    <div class="metadata-item">
        <span class="meta-label">Session:</span>
        <span class="meta-value">${escapeHtml(observation.session_id)}</span>
    </div>
    <div class="metadata-item">
        <span class="meta-label">Visibility:</span>
        <span class="meta-value">${escapeHtml(observation.visibility)}</span>
    </div>
    <div class="metadata-item">
        <span class="meta-label">Version:</span>
        <span class="meta-value">${escapeHtml(observation.version)}</span>
    </div>
    ${observation.dynamic_eval_created ? `<div class="metadata-item">
        <span class="meta-label">Dynamic eval:</span>
        <span class="meta-value">created</span>
    </div>` : ''}
</div>`;
}
