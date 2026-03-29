import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ObservationStore } from '../../stores/observation-store';
import { ConfigManager } from '../../stores/config-manager';
import { LiveFeedProvider } from '../../ui/sidebar/live-feed-provider';
import { PersistentObservation } from '../../types/observation';
import { renderSparkline } from '../../ui/charts/sparkline';
import { renderDonut } from '../../ui/charts/donut';
import { renderTimeline } from '../../ui/charts/timeline';
import type { DonutSegment, TimelinePoint } from '../../types/health-metrics';
import type { EvalRule } from '../../types/eval-rule';

/** Expose private addObservation for scale testing. */
interface ObservationStoreTestable {
    addObservation(obs: PersistentObservation): void;
}

/** Expose private mergedRules for scale testing. */
interface ConfigManagerTestable {
    mergedRules: EvalRule[];
}

/**
 * Generate a realistic test observation matching the Go sentinel output format.
 */
function createTestObservation(sessionId: string, index: number): PersistentObservation {
    const severities: Array<'info' | 'warning' | 'critical'> = ['info', 'warning', 'critical'];
    const domains = ['GEN', 'SEC'];
    const domain = domains[index % 2];
    return {
        timestamp: new Date(Date.now() - 86400000 + index * 1000).toISOString(),
        session_id: sessionId,
        sentinel_name: `${domain.toLowerCase()}-sentinel`,
        sentinel_label: `${domain} Sentinel`,
        severity: severities[index % 3],
        eval_id: `${domain}-${String((index % 7) + 1).padStart(3, '0')}`,
        one_liner: `Scale test observation #${index}: flagged behavior in agent turn`,
        analysis: `Detailed analysis for scale test observation ${index}. This represents a realistic-length analysis field describing the specific issue found during sentinel evaluation of agent behavior.`,
        turn_number: index,
        duration_ms: Math.floor(10 + Math.random() * 200),
        tier: domain === 'GEN' ? 'general' : 'security',
        visibility: index % 10 === 0 ? 'silent' : 'display',
        dynamic_eval_created: false,
        hook_type: index % 2 === 0 ? 'pre' : 'post',
        version: '1',
    };
}

/**
 * Create a temporary directory for JSONL test data.
 */
function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-scale-'));
}

/**
 * Write JSONL observations to a temp file and return the path.
 */
function writeJsonlFile(dir: string, observations: PersistentObservation[]): string {
    const filePath = path.join(dir, 'observations.jsonl');
    const content = observations.map(o => JSON.stringify(o)).join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

/**
 * Helper to report measurement vs budget.
 */
function reportMetric(name: string, actual: number, budget: number, unit: string): void {
    const pct = (actual / budget) * 100;
    const status = actual <= budget ? 'PASS' : 'FAIL';
    const warning = pct > 75 && actual <= budget ? ' [NEAR BUDGET]' : '';
    console.log(`  [${status}] ${name}: ${actual.toFixed(2)}${unit} / ${budget}${unit} (${pct.toFixed(0)}%)${warning}`);
}

// ─────────────────────────────────────────────────────────────
// 1. ObservationStore Scale
// ─────────────────────────────────────────────────────────────

suite('Scale: ObservationStore', () => {

    test('50 sessions x 1000 observations = 50K total — load time <500ms, memory <75MB', function () {
        this.timeout(30000);

        if (global.gc) { global.gc(); }
        const heapBefore = process.memoryUsage().heapUsed;

        const store = new ObservationStore(1000);
        const NUM_SESSIONS = 50;
        const OBS_PER_SESSION = 1000;

        const start = performance.now();
        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `scale-50k-session-${s.toString().padStart(3, '0')}`;
            store.addFolder(`folder-${s}`, `/tmp/sentinel-scale-50k-${s}/observations.jsonl`);
            for (let i = 0; i < OBS_PER_SESSION; i++) {
                (store as unknown as ObservationStoreTestable).addObservation(
                    createTestObservation(sessionId, i),
                );
            }
        }
        const elapsed = performance.now() - start;

        if (global.gc) { global.gc(); }
        const heapAfter = process.memoryUsage().heapUsed;
        const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        const total = store.getObservations().length;
        console.log(`\n  50K scale test: ${total} observations loaded`);
        reportMetric('Load time', elapsed, 500, 'ms');
        reportMetric('Memory delta', deltaMB, 75, 'MB');

        assert.strictEqual(total, NUM_SESSIONS * OBS_PER_SESSION);
        assert.ok(elapsed < 500, `Load time ${elapsed.toFixed(1)}ms exceeds 500ms budget`);
        assert.ok(deltaMB < 75, `Memory ${deltaMB.toFixed(1)}MB exceeds 75MB budget`);

        store.dispose();
    });

    test('100 sessions x 1000 observations = 100K total — load time <2000ms, memory <150MB', function () {
        this.timeout(60000);

        if (global.gc) { global.gc(); }
        const heapBefore = process.memoryUsage().heapUsed;

        const store = new ObservationStore(1000);
        const NUM_SESSIONS = 100;
        const OBS_PER_SESSION = 1000;

        const start = performance.now();
        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `scale-100k-session-${s.toString().padStart(3, '0')}`;
            store.addFolder(`folder-${s}`, `/tmp/sentinel-scale-100k-${s}/observations.jsonl`);
            for (let i = 0; i < OBS_PER_SESSION; i++) {
                (store as unknown as ObservationStoreTestable).addObservation(
                    createTestObservation(sessionId, i),
                );
            }
        }
        const elapsed = performance.now() - start;

        if (global.gc) { global.gc(); }
        const heapAfter = process.memoryUsage().heapUsed;
        const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        const total = store.getObservations().length;
        console.log(`\n  100K scale test: ${total} observations loaded`);
        reportMetric('Load time', elapsed, 2000, 'ms');
        reportMetric('Memory delta', deltaMB, 150, 'MB');

        assert.strictEqual(total, NUM_SESSIONS * OBS_PER_SESSION);
        assert.ok(elapsed < 2000, `Load time ${elapsed.toFixed(1)}ms exceeds 2000ms budget`);
        assert.ok(deltaMB < 150, `Memory ${deltaMB.toFixed(1)}MB exceeds 150MB budget`);

        store.dispose();
    });

    test('Single session rapid add: 10K observations — eviction performance', function () {
        this.timeout(15000);

        const MAX_PER_SESSION = 1000;
        const store = new ObservationStore(MAX_PER_SESSION);
        const sessionId = 'eviction-stress';
        store.addFolder('eviction-folder', '/tmp/sentinel-eviction/observations.jsonl');

        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(
                createTestObservation(sessionId, i),
            );
        }
        const elapsed = performance.now() - start;

        const obs = store.getObservations({ sessionId });
        console.log(`\n  Eviction stress: 10K adds, ${obs.length} retained`);
        reportMetric('10K adds with eviction', elapsed, 500, 'ms');

        assert.strictEqual(obs.length, MAX_PER_SESSION, `Expected ${MAX_PER_SESSION} after eviction`);
        // Verify newest observations are retained
        assert.strictEqual(obs[obs.length - 1].turn_number, 9999);
        assert.ok(elapsed < 500, `Eviction time ${elapsed.toFixed(1)}ms exceeds 500ms budget`);

        store.dispose();
    });

    test('Filtered query on 100K observations — by session, severity, eval_id each <100ms', function () {
        this.timeout(60000);

        const store = new ObservationStore(1000);
        const NUM_SESSIONS = 100;
        const OBS_PER_SESSION = 1000;

        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `filter-session-${s.toString().padStart(3, '0')}`;
            store.addFolder(`filter-folder-${s}`, `/tmp/sentinel-filter-${s}/observations.jsonl`);
            for (let i = 0; i < OBS_PER_SESSION; i++) {
                (store as unknown as ObservationStoreTestable).addObservation(
                    createTestObservation(sessionId, i),
                );
            }
        }

        console.log(`\n  Filter tests on ${store.getObservations().length} observations:`);

        // Filter by session
        const startSession = performance.now();
        const bySession = store.getObservations({ sessionId: 'filter-session-050' });
        const elapsedSession = performance.now() - startSession;
        reportMetric('Filter by session', elapsedSession, 100, 'ms');
        assert.ok(bySession.length > 0, 'Session filter returned no results');
        assert.ok(elapsedSession < 100, `Session filter ${elapsedSession.toFixed(1)}ms exceeds 100ms`);

        // Filter by severity
        const startSeverity = performance.now();
        const bySeverity = store.getObservations({ severity: 'critical' });
        const elapsedSeverity = performance.now() - startSeverity;
        reportMetric('Filter by severity', elapsedSeverity, 100, 'ms');
        assert.ok(bySeverity.length > 0, 'Severity filter returned no results');
        assert.ok(elapsedSeverity < 100, `Severity filter ${elapsedSeverity.toFixed(1)}ms exceeds 100ms`);

        // Filter by eval_id
        const startEval = performance.now();
        const byEval = store.getObservations({ evalId: 'GEN-001' });
        const elapsedEval = performance.now() - startEval;
        reportMetric('Filter by eval_id', elapsedEval, 100, 'ms');
        assert.ok(byEval.length > 0, 'Eval filter returned no results');
        assert.ok(elapsedEval < 100, `Eval filter ${elapsedEval.toFixed(1)}ms exceeds 100ms`);

        // Combined filter (session + severity)
        const startCombined = performance.now();
        const combined = store.getObservations({ sessionId: 'filter-session-025', severity: 'warning' });
        const elapsedCombined = performance.now() - startCombined;
        reportMetric('Combined filter (session+severity)', elapsedCombined, 100, 'ms');
        assert.ok(combined.length > 0, 'Combined filter returned no results');
        assert.ok(elapsedCombined < 100, `Combined filter ${elapsedCombined.toFixed(1)}ms exceeds 100ms`);

        store.dispose();
    });
});

// ─────────────────────────────────────────────────────────────
// 2. JSONL Parsing Scale
// ─────────────────────────────────────────────────────────────

suite('Scale: JSONL Parsing', () => {

    function buildJsonlBlob(targetBytes: number): { blob: string; lineCount: number } {
        const lines: string[] = [];
        let totalBytes = 0;
        let i = 0;
        while (totalBytes < targetBytes) {
            const obs = createTestObservation('jsonl-scale-session', i++);
            const line = JSON.stringify(obs);
            lines.push(line);
            totalBytes += line.length + 1;
        }
        return { blob: lines.join('\n'), lineCount: lines.length };
    }

    function parseJsonlBlob(blob: string): PersistentObservation[] {
        const parsed: PersistentObservation[] = [];
        for (const line of blob.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length === 0) { continue; }
            try {
                parsed.push(JSON.parse(trimmed) as PersistentObservation);
            } catch {
                // skip
            }
        }
        return parsed;
    }

    test('10MB JSONL parse (<1s)', function () {
        this.timeout(30000);
        const target = 10 * 1024 * 1024;
        const { blob, lineCount } = buildJsonlBlob(target);
        console.log(`\n  10MB JSONL: ${(blob.length / (1024 * 1024)).toFixed(1)}MB, ${lineCount} lines`);

        const start = performance.now();
        const parsed = parseJsonlBlob(blob);
        const elapsed = performance.now() - start;

        reportMetric('10MB parse', elapsed, 1000, 'ms');
        assert.strictEqual(parsed.length, lineCount);
        assert.ok(elapsed < 1000, `10MB parse ${elapsed.toFixed(1)}ms exceeds 1000ms budget`);
    });

    test('50MB JSONL parse (<5s)', function () {
        this.timeout(60000);
        const target = 50 * 1024 * 1024;
        const { blob, lineCount } = buildJsonlBlob(target);
        console.log(`\n  50MB JSONL: ${(blob.length / (1024 * 1024)).toFixed(1)}MB, ${lineCount} lines`);

        const start = performance.now();
        const parsed = parseJsonlBlob(blob);
        const elapsed = performance.now() - start;

        reportMetric('50MB parse', elapsed, 5000, 'ms');
        assert.strictEqual(parsed.length, lineCount);
        assert.ok(elapsed < 5000, `50MB parse ${elapsed.toFixed(1)}ms exceeds 5000ms budget`);
    });

    test('100MB JSONL parse (<10s)', function () {
        this.timeout(120000);
        const target = 100 * 1024 * 1024;
        const { blob, lineCount } = buildJsonlBlob(target);
        console.log(`\n  100MB JSONL: ${(blob.length / (1024 * 1024)).toFixed(1)}MB, ${lineCount} lines`);

        const start = performance.now();
        const parsed = parseJsonlBlob(blob);
        const elapsed = performance.now() - start;

        reportMetric('100MB parse', elapsed, 10000, 'ms');
        assert.strictEqual(parsed.length, lineCount);
        assert.ok(elapsed < 10000, `100MB parse ${elapsed.toFixed(1)}ms exceeds 10000ms budget`);
    });
});

// ─────────────────────────────────────────────────────────────
// 3. LiveFeedProvider Scale
// ─────────────────────────────────────────────────────────────

suite('Scale: LiveFeedProvider', () => {

    test('5K observations — getChildren <200ms', function () {
        this.timeout(15000);

        const store = new ObservationStore(5000);
        store.addFolder('feed-5k', '/tmp/sentinel-feed-5k/observations.jsonl');
        for (let i = 0; i < 5000; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(
                createTestObservation('feed-5k-session', i),
            );
        }

        const provider = new LiveFeedProvider(store);
        provider.setViewMode('all');

        const start = performance.now();
        const items = provider.getChildren();
        const elapsed = performance.now() - start;

        console.log(`\n  LiveFeedProvider 5K: ${items.length} items`);
        reportMetric('5K getChildren', elapsed, 200, 'ms');

        assert.ok(items.length > 0, 'Expected tree items');
        assert.ok(elapsed < 200, `5K getChildren ${elapsed.toFixed(1)}ms exceeds 200ms budget`);

        provider.dispose();
        store.dispose();
    });

    test('10K observations — getChildren <500ms', function () {
        this.timeout(30000);

        const store = new ObservationStore(10000);
        store.addFolder('feed-10k', '/tmp/sentinel-feed-10k/observations.jsonl');
        for (let i = 0; i < 10000; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(
                createTestObservation('feed-10k-session', i),
            );
        }

        const provider = new LiveFeedProvider(store);
        provider.setViewMode('all');

        const start = performance.now();
        const items = provider.getChildren();
        const elapsed = performance.now() - start;

        console.log(`\n  LiveFeedProvider 10K: ${items.length} items`);
        reportMetric('10K getChildren', elapsed, 500, 'ms');

        assert.ok(items.length > 0, 'Expected tree items');
        assert.ok(elapsed < 500, `10K getChildren ${elapsed.toFixed(1)}ms exceeds 500ms budget`);

        provider.dispose();
        store.dispose();
    });

    test('1000 observations with expanded detail items — getChildren per parent', function () {
        this.timeout(15000);

        const store = new ObservationStore(1000);
        store.addFolder('feed-detail', '/tmp/sentinel-feed-detail/observations.jsonl');
        for (let i = 0; i < 1000; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(
                createTestObservation('feed-detail-session', i),
            );
        }

        const provider = new LiveFeedProvider(store);
        provider.setViewMode('all');

        // Get root items
        const rootItems = provider.getChildren();

        // Expand every root item (simulate all nodes expanded)
        const start = performance.now();
        let detailCount = 0;
        for (const item of rootItems) {
            const details = provider.getChildren(item);
            detailCount += details.length;
        }
        const elapsed = performance.now() - start;

        console.log(`\n  Detail expansion: ${rootItems.length} parents, ${detailCount} detail items total`);
        reportMetric('1000 expanded nodes detail items', elapsed, 500, 'ms');

        assert.ok(detailCount > 0, 'Expected detail items');
        assert.ok(elapsed < 500, `Detail expansion ${elapsed.toFixed(1)}ms exceeds 500ms budget`);

        provider.dispose();
        store.dispose();
    });
});

// ─────────────────────────────────────────────────────────────
// 4. Chart Rendering Scale
// ─────────────────────────────────────────────────────────────

suite('Scale: Chart Rendering', () => {

    test('Sparkline: 10K data points', function () {
        this.timeout(10000);
        const data: number[] = [];
        for (let i = 0; i < 10000; i++) { data.push(Math.random() * 500); }

        const start = performance.now();
        const svg = renderSparkline(data, { width: 260, height: 40 });
        const elapsed = performance.now() - start;

        console.log(`\n  Sparkline 10K points`);
        reportMetric('Sparkline 10K', elapsed, 500, 'ms');

        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 500, `Sparkline 10K ${elapsed.toFixed(1)}ms exceeds 500ms budget`);
    });

    test('Sparkline: 50K data points', function () {
        this.timeout(15000);
        const data: number[] = [];
        for (let i = 0; i < 50000; i++) { data.push(Math.random() * 500); }

        // Note: Math.min/max(...data) may stack overflow for very large arrays.
        // This test validates whether the renderer handles it gracefully.
        let svg: string;
        let elapsed: number;
        try {
            const start = performance.now();
            svg = renderSparkline(data, { width: 260, height: 40 });
            elapsed = performance.now() - start;
        } catch (err) {
            // If it throws RangeError (stack overflow from spread), report it
            if (err instanceof RangeError) {
                console.log('\n  Sparkline 50K: STACK OVERFLOW — Math.min/max(...data) cannot handle 50K elements');
                console.log('  BOTTLENECK: renderSparkline uses spread operator with Math.min/max which has ~65K arg limit');
                // Still fail the test to flag the issue
                assert.fail(`Sparkline 50K threw RangeError: ${err.message}. Fix: use iterative min/max instead of spread.`);
            }
            throw err;
        }

        reportMetric('Sparkline 50K', elapsed, 500, 'ms');
        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 500, `Sparkline 50K ${elapsed.toFixed(1)}ms exceeds 500ms budget`);
    });

    test('Sparkline: 100K data points', function () {
        this.timeout(30000);
        const data: number[] = [];
        for (let i = 0; i < 100000; i++) { data.push(Math.random() * 500); }

        let svg: string;
        let elapsed: number;
        try {
            const start = performance.now();
            svg = renderSparkline(data, { width: 260, height: 40 });
            elapsed = performance.now() - start;
        } catch (err) {
            if (err instanceof RangeError) {
                console.log('\n  Sparkline 100K: STACK OVERFLOW — Math.min/max(...data) limit exceeded');
                assert.fail(`Sparkline 100K threw RangeError: ${err.message}. Fix: use iterative min/max.`);
            }
            throw err;
        }

        reportMetric('Sparkline 100K', elapsed, 2000, 'ms');
        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 2000, `Sparkline 100K ${elapsed.toFixed(1)}ms exceeds 2000ms budget`);
    });

    test('Timeline: 10K data points', function () {
        this.timeout(15000);
        const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];
        const baseTime = Date.now();
        const points: TimelinePoint[] = [];
        for (let i = 0; i < 10000; i++) {
            points.push({
                timestamp: new Date(baseTime + i * 1000).toISOString(),
                severity: severities[i % 3],
                evalId: `TEST-${(i % 50).toString().padStart(3, '0')}`,
            });
        }

        let svg: string;
        let elapsed: number;
        try {
            const start = performance.now();
            svg = renderTimeline(points, { width: 260, height: 60 });
            elapsed = performance.now() - start;
        } catch (err) {
            if (err instanceof RangeError) {
                console.log('\n  Timeline 10K: STACK OVERFLOW — Math.min/max(...timestamps) limit exceeded');
                assert.fail(`Timeline 10K threw RangeError: ${err.message}. Fix: use iterative min/max.`);
            }
            throw err;
        }

        console.log(`\n  Timeline 10K points`);
        reportMetric('Timeline 10K', elapsed, 500, 'ms');

        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 500, `Timeline 10K ${elapsed.toFixed(1)}ms exceeds 500ms budget`);
    });

    test('Timeline: 50K data points', function () {
        this.timeout(30000);
        const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];
        const baseTime = Date.now();
        const points: TimelinePoint[] = [];
        for (let i = 0; i < 50000; i++) {
            points.push({
                timestamp: new Date(baseTime + i * 1000).toISOString(),
                severity: severities[i % 3],
                evalId: `TEST-${(i % 50).toString().padStart(3, '0')}`,
            });
        }

        let svg: string;
        let elapsed: number;
        try {
            const start = performance.now();
            svg = renderTimeline(points, { width: 260, height: 60 });
            elapsed = performance.now() - start;
        } catch (err) {
            if (err instanceof RangeError) {
                console.log('\n  Timeline 50K: STACK OVERFLOW — Math.min/max(...timestamps) limit exceeded');
                assert.fail(`Timeline 50K threw RangeError: ${err.message}. Fix: use iterative min/max.`);
            }
            throw err;
        }

        reportMetric('Timeline 50K', elapsed, 500, 'ms');
        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 500, `Timeline 50K ${elapsed.toFixed(1)}ms exceeds 500ms budget`);
    });

    test('Donut: 20 segments', function () {
        const colors = [
            'var(--vscode-charts-red, #f44747)',
            'var(--vscode-charts-yellow, #cca700)',
            'var(--vscode-charts-blue, #3794ff)',
            'var(--vscode-charts-green, #89d185)',
            'var(--vscode-charts-purple, #b180d7)',
        ];
        const segments: DonutSegment[] = [];
        for (let i = 0; i < 20; i++) {
            segments.push({
                label: `Segment ${i}`,
                value: Math.floor(Math.random() * 100) + 1,
                color: colors[i % colors.length],
            });
        }

        const start = performance.now();
        const svg = renderDonut(segments, { size: 120, thickness: 16 });
        const elapsed = performance.now() - start;

        console.log(`\n  Donut 20 segments`);
        reportMetric('Donut 20', elapsed, 50, 'ms');

        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 50, `Donut 20 ${elapsed.toFixed(1)}ms exceeds 50ms budget`);
    });

    test('Donut: 50 segments', function () {
        const colors = [
            'var(--vscode-charts-red, #f44747)',
            'var(--vscode-charts-yellow, #cca700)',
            'var(--vscode-charts-blue, #3794ff)',
            'var(--vscode-charts-green, #89d185)',
            'var(--vscode-charts-purple, #b180d7)',
        ];
        const segments: DonutSegment[] = [];
        for (let i = 0; i < 50; i++) {
            segments.push({
                label: `Segment ${i}`,
                value: Math.floor(Math.random() * 100) + 1,
                color: colors[i % colors.length],
            });
        }

        const start = performance.now();
        const svg = renderDonut(segments, { size: 120, thickness: 16 });
        const elapsed = performance.now() - start;

        reportMetric('Donut 50', elapsed, 50, 'ms');

        assert.ok(svg.includes('<svg'), 'Expected valid SVG');
        assert.ok(elapsed < 50, `Donut 50 ${elapsed.toFixed(1)}ms exceeds 50ms budget`);
    });
});

// ─────────────────────────────────────────────────────────────
// 5. ConfigManager Scale
// ─────────────────────────────────────────────────────────────

suite('Scale: ConfigManager', () => {

    test('200 eval rules — getEvalRules <10ms', function () {
        const configManager = new ConfigManager();
        const rules: EvalRule[] = [];
        for (let i = 0; i < 200; i++) {
            rules.push({
                id: `GEN-${i.toString().padStart(3, '0')}`,
                version: 1,
                domainRaw: 'general',
                domain: 'GEN' as const,
                severity: (['critical', 'warning', 'info'] as const)[i % 3],
                rule: `Rule ${i}: Detect scenario ${i} involving agent behavior patterns.`,
                rationale: `Rationale for rule ${i}.`,
                enabled: i % 5 !== 0,
            });
        }
        (configManager as unknown as ConfigManagerTestable).mergedRules = rules;

        // Warm up
        configManager.getEvalRules();

        const iterations = 1000;
        const start = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
            configManager.getEvalRules();
        }
        const elapsed = performance.now() - start;
        const avgMs = elapsed / iterations;

        console.log(`\n  ConfigManager 200 rules`);
        reportMetric('200 rules getEvalRules (avg)', avgMs, 10, 'ms');

        assert.ok(avgMs < 10, `200 rules avg ${avgMs.toFixed(3)}ms exceeds 10ms budget`);

        configManager.dispose();
    });

    test('500 eval rules — getEvalRules <10ms', function () {
        const configManager = new ConfigManager();
        const rules: EvalRule[] = [];
        for (let i = 0; i < 500; i++) {
            rules.push({
                id: `${['GEN', 'SEC', 'LOCAL'][i % 3]}-${i.toString().padStart(3, '0')}`,
                version: 1,
                domainRaw: ['general', 'security', 'local'][i % 3],
                domain: (['GEN', 'SEC', 'LOCAL'] as const)[i % 3],
                severity: (['critical', 'warning', 'info'] as const)[i % 3],
                rule: `Rule ${i}: Complex detection pattern for scenario ${i}.`,
                rationale: `Rationale explaining why rule ${i} exists.`,
                enabled: i % 5 !== 0,
            });
        }
        (configManager as unknown as ConfigManagerTestable).mergedRules = rules;

        configManager.getEvalRules();

        const iterations = 1000;
        const start = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
            configManager.getEvalRules();
        }
        const elapsed = performance.now() - start;
        const avgMs = elapsed / iterations;

        console.log(`\n  ConfigManager 500 rules`);
        reportMetric('500 rules getEvalRules (avg)', avgMs, 10, 'ms');

        assert.ok(avgMs < 10, `500 rules avg ${avgMs.toFixed(3)}ms exceeds 10ms budget`);

        configManager.dispose();
    });

    test('1000 rule overrides — config write simulation <50ms', function () {
        // Simulate the overhead of maintaining 1000 ruleOverrides in memory
        // We can't test actual disk write without a real config file, but we
        // can test the in-memory operations that precede it.

        const overrides: Record<string, { enabled: boolean }> = {};
        const start = performance.now();
        for (let i = 0; i < 1000; i++) {
            const evalId = `GEN-${i.toString().padStart(3, '0')}`;
            overrides[evalId] = { enabled: i % 3 !== 0 };
        }
        // Simulate JSON serialization (the bottleneck in write path)
        const config = { ruleOverrides: overrides, sentinels: [] };
        const json = JSON.stringify(config, null, 2);
        const elapsed = performance.now() - start;

        console.log(`\n  1000 rule overrides: ${(json.length / 1024).toFixed(0)}KB JSON`);
        reportMetric('1000 overrides serialize', elapsed, 50, 'ms');

        assert.ok(elapsed < 50, `Serialization ${elapsed.toFixed(1)}ms exceeds 50ms budget`);
    });
});

// ─────────────────────────────────────────────────────────────
// 6. Historical Pagination Stress
// ─────────────────────────────────────────────────────────────

suite('Scale: Historical Pagination Stress', () => {

    test('50 rapid getHistoricalObservations calls — <5s total, no memory leak', async function () {
        this.timeout(60000);

        // Create a temp JSONL file with 50K observations for a single session
        const tmpDir = makeTempDir();
        const sessionId = 'pagination-stress-session';
        const observations: PersistentObservation[] = [];
        for (let i = 0; i < 50000; i++) {
            observations.push(createTestObservation(sessionId, i));
        }
        const filePath = writeJsonlFile(tmpDir, observations);

        // Set up store with low maxObservations so most data is on disk
        const store = new ObservationStore(500);
        store.addFolder('pagination-folder', filePath);
        await store.load();

        // Verify data loaded correctly
        const inMemory = store.getObservations({ sessionId });
        assert.strictEqual(inMemory.length, 500, `Expected 500 in-memory, got ${inMemory.length}`);
        assert.ok(store.hasMoreHistory(sessionId), 'Expected more history on disk');

        if (global.gc) { global.gc(); }
        const heapBefore = process.memoryUsage().heapUsed;

        // Rapid pagination: 50 calls
        const start = performance.now();
        let beforeIndex = store.getOldestInMemoryIndex(sessionId);
        for (let page = 0; page < 50; page++) {
            const batch = await store.getHistoricalObservations(sessionId, beforeIndex, 100);
            if (batch.length === 0) { break; }
            beforeIndex = Math.max(0, beforeIndex - batch.length);
        }
        const elapsed = performance.now() - start;

        if (global.gc) { global.gc(); }
        const heapAfter = process.memoryUsage().heapUsed;
        const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        console.log(`\n  Pagination stress: 50 rapid pages`);
        reportMetric('50 rapid pages total', elapsed, 5000, 'ms');
        reportMetric('Memory growth', deltaMB, 50, 'MB');

        assert.ok(elapsed < 5000, `Pagination ${elapsed.toFixed(1)}ms exceeds 5000ms budget`);
        assert.ok(deltaMB < 50, `Memory growth ${deltaMB.toFixed(1)}MB exceeds 50MB budget`);

        store.dispose();

        // Cleanup
        try { fs.unlinkSync(filePath); fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    });
});

// ─────────────────────────────────────────────────────────────
// 7. Concurrent Operations
// ─────────────────────────────────────────────────────────────

suite('Scale: Concurrent Operations', () => {

    test('Simultaneous add and query — no lost observations', function () {
        this.timeout(15000);

        const store = new ObservationStore(10000);
        store.addFolder('concurrent-folder', '/tmp/sentinel-concurrent/observations.jsonl');

        const NUM_OBS = 5000;
        let queryResults: PersistentObservation[] = [];
        let queriesRun = 0;

        // Add observations, querying periodically during the adds
        for (let i = 0; i < NUM_OBS; i++) {
            (store as unknown as ObservationStoreTestable).addObservation(
                createTestObservation('concurrent-session', i),
            );

            // Query every 500 adds
            if (i % 500 === 499) {
                queryResults = store.getObservations({ sessionId: 'concurrent-session' });
                queriesRun++;
                // Each query should return at least the number added so far
                assert.ok(
                    queryResults.length >= i,
                    `Query at iteration ${i}: expected >= ${i} obs, got ${queryResults.length}`,
                );
            }
        }

        // Final count check
        const final = store.getObservations({ sessionId: 'concurrent-session' });
        console.log(`\n  Concurrent add+query: ${final.length} final, ${queriesRun} intermediate queries`);
        assert.strictEqual(final.length, NUM_OBS, `Expected ${NUM_OBS} observations, got ${final.length}`);

        store.dispose();
    });

    test('Simultaneous file-backed load and in-memory query', async function () {
        this.timeout(30000);

        // Pre-populate a JSONL file
        const tmpDir = makeTempDir();
        const sessionId = 'file-concurrent-session';
        const observations: PersistentObservation[] = [];
        for (let i = 0; i < 5000; i++) {
            observations.push(createTestObservation(sessionId, i));
        }
        const filePath = writeJsonlFile(tmpDir, observations);

        const store = new ObservationStore(5000);
        store.addFolder('file-concurrent', filePath);

        // Start load and query in parallel
        const loadPromise = store.load();

        // Query during load (may get partial results)
        const midLoadResults = store.getObservations();

        await loadPromise;

        // After load completes, all observations should be present
        const final = store.getObservations({ sessionId });
        console.log(`\n  File concurrent: mid-load=${midLoadResults.length}, final=${final.length}`);
        assert.strictEqual(final.length, 5000, `Expected 5000 after load, got ${final.length}`);

        store.dispose();

        // Cleanup
        try { fs.unlinkSync(filePath); fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    });

    test('Multiple sessions concurrent add — correctness check', function () {
        this.timeout(15000);

        const store = new ObservationStore(2000);
        const NUM_SESSIONS = 10;
        const OBS_PER_SESSION = 1000;

        for (let s = 0; s < NUM_SESSIONS; s++) {
            store.addFolder(`multi-${s}`, `/tmp/sentinel-multi-${s}/observations.jsonl`);
        }

        // Interleave adds across sessions
        for (let i = 0; i < OBS_PER_SESSION; i++) {
            for (let s = 0; s < NUM_SESSIONS; s++) {
                const sessionId = `multi-session-${s}`;
                (store as unknown as ObservationStoreTestable).addObservation(
                    createTestObservation(sessionId, i),
                );
            }
        }

        // Verify each session has the right count
        let totalVerified = 0;
        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `multi-session-${s}`;
            const obs = store.getObservations({ sessionId });
            assert.strictEqual(
                obs.length, OBS_PER_SESSION,
                `Session ${sessionId}: expected ${OBS_PER_SESSION}, got ${obs.length}`,
            );
            totalVerified += obs.length;
        }

        const allObs = store.getObservations();
        console.log(`\n  Multi-session interleaved: ${allObs.length} total, ${totalVerified} verified`);
        assert.strictEqual(allObs.length, NUM_SESSIONS * OBS_PER_SESSION);

        store.dispose();
    });
});
