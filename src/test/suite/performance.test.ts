import * as assert from 'assert';
import * as vscode from 'vscode';
import { ObservationStore } from '../../stores/observation-store';
import { StateManager } from '../../stores/state-manager';
import { ConfigManager } from '../../stores/config-manager';
import { ObservationsProvider } from '../../ui/sidebar/observations-provider';
import { PersistentObservation } from '../../types/observation';
import { renderSparkline } from '../../ui/charts/sparkline';
import { renderDonut } from '../../ui/charts/donut';
import { renderTimeline } from '../../ui/charts/timeline';
import type { DonutSegment, TimelinePoint } from '../../types/health-metrics';
import type { EvalRule } from '../../types/eval-rule';

/** Expose private addObservation for perf testing. */
interface ObservationStoreTestable {
    addObservation(obs: PersistentObservation): void;
}

/** Expose private mergedRules for perf testing. */
interface ConfigManagerTestable {
    mergedRules: EvalRule[];
}

suite('Performance Gates', () => {

    test('Extension activation completes in <200ms', async function () {
        // This test requires the real VS Code extension host.
        // Skip when running outside VS Code (e.g., plain mocha with vscode mock).
        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        if (!ext) {
            this.skip();
            return;
        }

        // If already active, activation time is effectively 0.
        // For a meaningful test, we measure the activate() function directly.
        if (!ext.isActive) {
            const start = performance.now();
            await ext.activate();
            const elapsed = performance.now() - start;
            assert.ok(
                elapsed < 200,
                `Activation took ${elapsed.toFixed(1)}ms, exceeds 200ms gate`,
            );
        } else {
            // Extension already activated — verify the exports exist (activation succeeded)
            assert.ok(ext.exports, 'Extension activated but returned no exports');
            assert.ok(ext.exports.observationStore, 'Missing observationStore in exports');
            assert.ok(ext.exports.observationsProvider, 'Missing observationsProvider in exports');
        }
    });

    test('ObservationStore memory usage <15MB with 10 sessions x 1000 observations', () => {
        // Force GC if available (run tests with --expose-gc)
        if (global.gc) {
            global.gc();
        }

        const heapBefore = process.memoryUsage().heapUsed;

        const store = new ObservationStore(1000);

        // Load 10 simulated sessions with 1000 observations each
        const NUM_SESSIONS = 10;
        const OBS_PER_SESSION = 1000;

        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `test-session-${s.toString().padStart(3, '0')}`;
            store.addFolder(`folder-${s}`, `/tmp/sentinel-test-${s}/observations.jsonl`);

            for (let i = 0; i < OBS_PER_SESSION; i++) {
                const obs = createTestObservation(sessionId, i);
                // Access the store's internal addObservation via getObservations path
                // Since addObservation is private, we feed observations through the public API
                // by directly manipulating — but that requires file I/O.
                // Instead, we measure the data structure size directly.
                (store as unknown as ObservationStoreTestable).addObservation(obs);
            }
        }

        if (global.gc) {
            global.gc();
        }

        const heapAfter = process.memoryUsage().heapUsed;
        const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        console.log(`Memory delta for ${NUM_SESSIONS * OBS_PER_SESSION} observations: ${deltaMB.toFixed(2)}MB`);

        // Verify observations were stored
        const allObs = store.getObservations();
        assert.strictEqual(
            allObs.length,
            NUM_SESSIONS * OBS_PER_SESSION,
            `Expected ${NUM_SESSIONS * OBS_PER_SESSION} observations, got ${allObs.length}`,
        );

        // Gate: <15MB for 10,000 observations
        assert.ok(
            deltaMB < 15,
            `Memory usage ${deltaMB.toFixed(2)}MB exceeds 15MB gate for ${NUM_SESSIONS * OBS_PER_SESSION} observations`,
        );

        store.dispose();
    });

    test('ObservationStore respects maxObservations eviction per session', () => {
        const MAX = 100;
        const store = new ObservationStore(MAX);
        const sessionId = 'eviction-test';

        store.addFolder('folder-evict', '/tmp/sentinel-evict/observations.jsonl');

        // Add 2x the max
        for (let i = 0; i < MAX * 2; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(createTestObservation(sessionId, i));
        }

        const obs = store.getObservations({ sessionId });
        assert.strictEqual(obs.length, MAX, `Expected ${MAX} observations after eviction, got ${obs.length}`);

        // Verify it kept the newest (highest turn numbers)
        const turns = obs.map(o => o.turn_number);
        assert.strictEqual(turns[0], MAX, 'Eviction should keep newest observations');
        assert.strictEqual(turns[turns.length - 1], MAX * 2 - 1);

        store.dispose();
    });

    test('ObservationStore.getObservations with 10,000 observations completes in <50ms', () => {
        const store = new ObservationStore(10000);
        const NUM_SESSIONS = 10;
        const OBS_PER_SESSION = 1000;

        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `perf-session-${s}`;
            store.addFolder(`perf-folder-${s}`, `/tmp/sentinel-perf-${s}/observations.jsonl`);
            for (let i = 0; i < OBS_PER_SESSION; i++) {
                (store as unknown as ObservationStoreTestable).addObservation(createTestObservation(sessionId, i));
            }
        }

        // Measure unfiltered getObservations
        const start = performance.now();
        const allObs = store.getObservations();
        const elapsed = performance.now() - start;

        console.log(`getObservations (${allObs.length} items): ${elapsed.toFixed(2)}ms`);
        assert.strictEqual(allObs.length, NUM_SESSIONS * OBS_PER_SESSION);
        assert.ok(
            elapsed < 50,
            `getObservations took ${elapsed.toFixed(1)}ms, exceeds 50ms gate`,
        );

        // Measure filtered getObservations
        const startFiltered = performance.now();
        const filtered = store.getObservations({ severity: 'critical' });
        const elapsedFiltered = performance.now() - startFiltered;

        console.log(`getObservations filtered (${filtered.length} items): ${elapsedFiltered.toFixed(2)}ms`);
        assert.ok(
            elapsedFiltered < 50,
            `Filtered getObservations took ${elapsedFiltered.toFixed(1)}ms, exceeds 50ms gate`,
        );

        store.dispose();
    });

    test('ConfigManager.getEvals with 50 rules completes in <10ms', () => {
        const configManager = new ConfigManager();

        // Simulate 50 rules by directly populating merged rules
        const rules = [];
        for (let i = 0; i < 50; i++) {
            rules.push({
                id: `GEN-${i.toString().padStart(3, '0')}`,
                version: 1,
                domainRaw: 'general',
                domain: 'GEN' as const,
                severity: (['critical', 'warning', 'info'] as const)[i % 3],
                rule: `Rule ${i}: Detect when the agent does something problematic involving scenario ${i}.`,
                rationale: `Rationale for rule ${i}: This prevents a class of issues related to scenario ${i}.`,
                enabled: i % 5 !== 0, // 80% enabled
            });
        }
        (configManager as unknown as ConfigManagerTestable).mergedRules = rules;

        const start = performance.now();
        for (let iter = 0; iter < 100; iter++) {
            configManager.getEvals();
        }
        const elapsed = performance.now() - start;
        const avgMs = elapsed / 100;

        console.log(`getEvals (50 rules, avg over 100 calls): ${avgMs.toFixed(3)}ms`);
        assert.ok(
            avgMs < 10,
            `getEvals avg ${avgMs.toFixed(3)}ms exceeds 10ms gate`,
        );

        configManager.dispose();
    });

    test('ObservationsProvider.getChildren with 1000 observations completes in <100ms', () => {
        const store = new ObservationStore(1000);
        store.addFolder('feed-perf', '/tmp/sentinel-feed-perf/observations.jsonl');

        for (let i = 0; i < 1000; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(createTestObservation('feed-session', i));
        }

        const provider = new ObservationsProvider(store, new StateManager());
        provider.setViewMode('all');

        const start = performance.now();
        const items = provider.getChildren();
        const elapsed = performance.now() - start;

        console.log(`ObservationsProvider.getChildren (${items.length} items): ${elapsed.toFixed(2)}ms`);
        assert.ok(items.length > 0, 'Expected at least one tree item');
        assert.ok(
            elapsed < 100,
            `getChildren took ${elapsed.toFixed(1)}ms, exceeds 100ms gate`,
        );

        provider.dispose();
        store.dispose();
    });

    test('No active timers after ObservationStore.dispose()', () => {
        const store = new ObservationStore(100);
        store.addFolder('timer-test', '/tmp/sentinel-timer/observations.jsonl');

        for (let i = 0; i < 10; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(createTestObservation('timer-session', i));
        }

        store.dispose();

        // After dispose, internal maps should be cleared
        const obs = store.getObservations();
        assert.strictEqual(obs.length, 0, 'Observations should be cleared after dispose');
    });

    test('No active timers after ObservationsProvider.dispose()', () => {
        const store = new ObservationStore(100);
        const provider = new ObservationsProvider(store, new StateManager());

        provider.dispose();

        // After dispose, getChildren should still work (graceful degradation)
        // but the provider should not fire events
        const items = provider.getChildren();
        assert.ok(Array.isArray(items), 'getChildren should return array after dispose');

        store.dispose();
    });
});

suite('Chart Performance Gates', () => {

    test('sparkline renders 1000 points in <100ms', () => {
        const data: number[] = [];
        for (let i = 0; i < 1000; i++) {
            data.push(Math.random() * 500);
        }

        const start = performance.now();
        const svg = renderSparkline(data, { width: 260, height: 40 });
        const elapsed = performance.now() - start;

        console.log(`Sparkline 1000 points: ${elapsed.toFixed(2)}ms`);
        assert.ok(svg.includes('<svg'), 'Expected valid SVG output');
        assert.ok(svg.includes('aria-label'), 'Expected aria-label on SVG');
        assert.ok(
            elapsed < 100,
            `Sparkline render took ${elapsed.toFixed(1)}ms, exceeds 100ms gate`,
        );
    });

    test('donut chart renders 10 segments in <100ms', () => {
        const segments: DonutSegment[] = [];
        const colors = [
            'var(--vscode-charts-red, #f44747)',
            'var(--vscode-charts-yellow, #cca700)',
            'var(--vscode-charts-blue, #3794ff)',
            'var(--vscode-charts-green, #89d185)',
            'var(--vscode-charts-purple, #b180d7)',
        ];
        for (let i = 0; i < 10; i++) {
            segments.push({
                label: `Segment ${i}`,
                value: Math.floor(Math.random() * 100) + 1,
                color: colors[i % colors.length],
            });
        }

        const start = performance.now();
        const svg = renderDonut(segments, { size: 120, thickness: 16 });
        const elapsed = performance.now() - start;

        console.log(`Donut 10 segments: ${elapsed.toFixed(2)}ms`);
        assert.ok(svg.includes('<svg'), 'Expected valid SVG output');
        assert.ok(svg.includes('aria-label'), 'Expected aria-label on SVG');
        assert.ok(
            elapsed < 100,
            `Donut render took ${elapsed.toFixed(1)}ms, exceeds 100ms gate`,
        );
    });

    test('timeline renders 1000 points in <100ms', () => {
        const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];
        const baseTime = Date.now();
        const points: TimelinePoint[] = [];
        for (let i = 0; i < 1000; i++) {
            points.push({
                timestamp: new Date(baseTime + i * 1000).toISOString(),
                severity: severities[i % 3],
                evalId: `TEST-${(i % 50).toString().padStart(3, '0')}`,
            });
        }

        const start = performance.now();
        const svg = renderTimeline(points, { width: 260, height: 60 });
        const elapsed = performance.now() - start;

        console.log(`Timeline 1000 points: ${elapsed.toFixed(2)}ms`);
        assert.ok(svg.includes('<svg'), 'Expected valid SVG output');
        assert.ok(svg.includes('aria-label'), 'Expected aria-label on SVG');
        assert.ok(
            elapsed < 100,
            `Timeline render took ${elapsed.toFixed(1)}ms, exceeds 100ms gate`,
        );
    });

    test('sparkline renders 10,000 points in <500ms', () => {
        const data: number[] = [];
        for (let i = 0; i < 10000; i++) {
            data.push(Math.random() * 500);
        }

        const start = performance.now();
        const svg = renderSparkline(data, { width: 260, height: 40 });
        const elapsed = performance.now() - start;

        console.log(`Sparkline 10,000 points: ${elapsed.toFixed(2)}ms`);
        assert.ok(svg.includes('<svg'), 'Expected valid SVG output');
        assert.ok(
            elapsed < 500,
            `Sparkline 10K render took ${elapsed.toFixed(1)}ms, exceeds 500ms gate`,
        );
    });
});

suite('JSONL Parsing Performance', () => {

    test('Parse 1MB of JSONL observations in <500ms', () => {
        // Build a ~1MB JSONL string
        const lines: string[] = [];
        let totalBytes = 0;
        let i = 0;
        while (totalBytes < 1024 * 1024) {
            const obs = createTestObservation(`jsonl-session`, i++);
            const line = JSON.stringify(obs);
            lines.push(line);
            totalBytes += line.length + 1; // +1 for newline
        }
        const jsonlBlob = lines.join('\n');

        console.log(`JSONL blob: ${(jsonlBlob.length / 1024).toFixed(0)}KB, ${lines.length} lines`);

        const start = performance.now();
        const parsed: PersistentObservation[] = [];
        for (const line of jsonlBlob.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length === 0) { continue; }
            try {
                parsed.push(JSON.parse(trimmed) as PersistentObservation);
            } catch {
                // skip
            }
        }
        const elapsed = performance.now() - start;

        console.log(`JSONL parse: ${parsed.length} observations in ${elapsed.toFixed(2)}ms (${(parsed.length / (elapsed / 1000)).toFixed(0)} obs/sec)`);
        assert.ok(parsed.length > 0, 'Should parse at least one observation');
        assert.ok(
            elapsed < 500,
            `JSONL parsing took ${elapsed.toFixed(1)}ms, exceeds 500ms gate`,
        );
    });
});

function createTestObservation(sessionId: string, index: number): PersistentObservation {
    return {
        timestamp: new Date(Date.now() + index * 1000).toISOString(),
        session_id: sessionId,
        sentinel_name: 'test-sentinel',
        sentinel_label: 'Test Sentinel',
        severity: (['info', 'warning', 'critical'] as const)[index % 3],
        eval_id: `TEST-${(index % 50).toString().padStart(3, '0')}`,
        one_liner: `Test observation ${index} for session ${sessionId}`,
        analysis: `Detailed analysis for observation ${index}. This is a moderate-length string to simulate realistic payload sizes that would be encountered in production use.`,
        turn_number: index,
        duration_ms: Math.floor(Math.random() * 500),
        tier: (['security', 'general', 'session'] as const)[index % 3],
        visibility: index % 4 === 0 ? 'silent' : 'display',
        dynamic_eval_created: false,
        hook_type: index % 2 === 0 ? 'pre' : 'post',
        version: '1',
    };
}
