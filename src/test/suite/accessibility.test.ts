import * as assert from 'assert';
import { getSessionHealthHtml } from '../../ui/webview/session-health/index';
import { STYLES as SESSION_HEALTH_STYLES } from '../../ui/webview/session-health/styles-inline';
import { OBSERVATION_CARD_STYLES } from '../../ui/webview/observation-card/styles';
import { buildObservationCardHtml } from '../../ui/webview/observation-card/template';
import { renderCard, renderBadge } from '../../ui/webview/observation-renderer';
import { renderSparkline } from '../../ui/charts/sparkline';
import { renderDonut } from '../../ui/charts/donut';
import { renderTimeline } from '../../ui/charts/timeline';
import type { PersistentObservation } from '../../types/observation';

function makeObservation(overrides: Partial<PersistentObservation> = {}): PersistentObservation {
    return {
        timestamp: new Date().toISOString(),
        session_id: 'test-session-1',
        sentinel_name: 'test-sentinel',
        sentinel_label: 'Test Sentinel',
        severity: 'warning',
        eval_id: 'GEN-001',
        one_liner: 'Test observation one-liner',
        analysis: 'Detailed analysis text for testing.',
        turn_number: 5,
        duration_ms: 120,
        tier: 'general',
        visibility: 'display',
        dynamic_eval_created: false,
        hook_type: 'post',
        version: '1',
        ...overrides,
    };
}

/**
 * Find hardcoded color values in CSS/HTML that are NOT inside a var() fallback.
 * Allowed: var(--foo, #abc123)  — the fallback inside var() is fine.
 * Disallowed: color: #fff; background: rgb(0,0,0); color: hsl(...)
 *
 * Strategy: strip all var(...) expressions first, then search for raw color literals.
 */
function findHardcodedColors(text: string): string[] {
    // Remove var() expressions (including nested) so their fallbacks don't false-positive
    let stripped = text;
    // Iteratively remove var() — handles nesting like var(--a, var(--b, #fff))
    let prev = '';
    while (prev !== stripped) {
        prev = stripped;
        stripped = stripped.replace(/var\([^()]*\)/g, '');
    }

    const hardcoded: string[] = [];
    // Hex colors: #rgb, #rrggbb, #rrggbbaa
    const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hexMatches) {
        hardcoded.push(...hexMatches);
    }
    // rgb()/rgba()
    const rgbMatches = stripped.match(/rgba?\s*\([^)]+\)/gi);
    if (rgbMatches) {
        hardcoded.push(...rgbMatches);
    }
    // hsl()/hsla()
    const hslMatches = stripped.match(/hsla?\s*\([^)]+\)/gi);
    if (hslMatches) {
        hardcoded.push(...hslMatches);
    }

    return hardcoded;
}

suite('WCAG 2.1 AA Compliance', () => {

    test('session health webview uses VS Code theme variables for all colors', () => {
        const html = getSessionHealthHtml('test-nonce', 'https://test.vscode-resource.vscode-cdn.net');
        const hardcoded = findHardcodedColors(html);

        assert.deepStrictEqual(
            hardcoded,
            [],
            `Session health webview contains hardcoded colors (outside var() fallbacks): ${hardcoded.join(', ')}`,
        );
    });

    test('observation card uses VS Code theme variables for all colors', () => {
        const obs = makeObservation();
        const cardHtml = renderCard(obs);
        const fullHtml = buildObservationCardHtml(cardHtml, 'test-nonce');

        const hardcoded = findHardcodedColors(fullHtml);

        assert.deepStrictEqual(
            hardcoded,
            [],
            `Observation card contains hardcoded colors (outside var() fallbacks): ${hardcoded.join(', ')}`,
        );
    });

    test('all SVG charts have aria-label attributes', () => {
        // Sparkline
        const sparkline = renderSparkline([10, 20, 30, 40, 50]);
        assert.ok(
            sparkline.includes('aria-label='),
            'Sparkline SVG missing aria-label attribute',
        );

        // Sparkline empty state
        const sparklineEmpty = renderSparkline([]);
        assert.ok(
            sparklineEmpty.includes('aria-label='),
            'Empty sparkline SVG missing aria-label attribute',
        );

        // Donut
        const donut = renderDonut([
            { label: 'Critical', value: 3, color: 'var(--vscode-charts-red, #f44747)' },
            { label: 'Warning', value: 5, color: 'var(--vscode-charts-yellow, #cca700)' },
            { label: 'Info', value: 12, color: 'var(--vscode-charts-blue, #3794ff)' },
        ]);
        assert.ok(
            donut.includes('aria-label='),
            'Donut SVG missing aria-label attribute',
        );

        // Donut empty state
        const donutEmpty = renderDonut([]);
        assert.ok(
            donutEmpty.includes('aria-label='),
            'Empty donut SVG missing aria-label attribute',
        );

        // Timeline
        const timeline = renderTimeline([
            { timestamp: new Date().toISOString(), severity: 'info', evalId: 'GEN-001' },
            { timestamp: new Date().toISOString(), severity: 'warning', evalId: 'GEN-002' },
        ]);
        assert.ok(
            timeline.includes('aria-label='),
            'Timeline SVG missing aria-label attribute',
        );

        // Timeline empty state
        const timelineEmpty = renderTimeline([]);
        assert.ok(
            timelineEmpty.includes('aria-label='),
            'Empty timeline SVG missing aria-label attribute',
        );
    });

    test('webviews include prefers-reduced-motion support', () => {
        // Session health styles
        assert.ok(
            SESSION_HEALTH_STYLES.includes('@media (prefers-reduced-motion: reduce)'),
            'Session health CSS missing @media (prefers-reduced-motion: reduce)',
        );

        // Observation card styles
        assert.ok(
            OBSERVATION_CARD_STYLES.includes('prefers-reduced-motion'),
            'Observation card CSS missing prefers-reduced-motion support',
        );
    });

    test('interactive elements have visible focus indicators', () => {
        // Session health styles — metric cards and chart containers are focusable
        assert.ok(
            SESSION_HEALTH_STYLES.includes(':focus-visible'),
            'Session health CSS missing :focus-visible styles',
        );
        assert.ok(
            SESSION_HEALTH_STYLES.includes('--vscode-focusBorder'),
            'Session health CSS focus indicator should use VS Code theme focus border',
        );

        // Observation card styles
        assert.ok(
            OBSERVATION_CARD_STYLES.includes(':focus-visible'),
            'Observation card CSS missing :focus-visible styles',
        );
        assert.ok(
            OBSERVATION_CARD_STYLES.includes('--vscode-focusBorder'),
            'Observation card CSS focus indicator should use VS Code theme focus border',
        );
    });

    test('severity is never communicated by color alone', () => {
        // Each severity level should produce a badge with a text label
        for (const severity of ['critical', 'warning', 'info'] as const) {
            const badge = renderBadge(severity);

            // Badge must contain the severity text in uppercase
            const expectedLabel = severity.toUpperCase();
            assert.ok(
                badge.includes(expectedLabel),
                `Severity badge for "${severity}" missing text label "${expectedLabel}"`,
            );

            // Badge must have an aria-label
            assert.ok(
                badge.includes('aria-label='),
                `Severity badge for "${severity}" missing aria-label`,
            );
        }

        // Full observation card should have severity text visible
        for (const severity of ['critical', 'warning', 'info'] as const) {
            const obs = makeObservation({ severity });
            const html = renderCard(obs);
            const expectedLabel = severity.toUpperCase();

            assert.ok(
                html.includes(expectedLabel),
                `Observation card for "${severity}" missing visible text label "${expectedLabel}"`,
            );
        }
    });
});
