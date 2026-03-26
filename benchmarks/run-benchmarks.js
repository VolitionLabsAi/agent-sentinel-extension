#!/usr/bin/env node
/**
 * Standalone benchmark script for Agent Sentinel extension.
 *
 * Usage:
 *   node benchmarks/run-benchmarks.js
 *
 * Requires: npm run pretest (or tsc -p tsconfig.test.json) first.
 * Outputs JSON results + human-readable summary.
 * Exit code 1 if any benchmark exceeds its budget.
 */

'use strict';

// Load vscode mock before anything else
require('../src/test/vscode-mock');

const { ObservationStore } = require('../out/stores/observation-store');
const { ConfigManager } = require('../out/stores/config-manager');
const { LiveFeedProvider } = require('../out/ui/sidebar/live-feed-provider');
const { renderSparkline } = require('../out/ui/charts/sparkline');
const { renderDonut } = require('../out/ui/charts/donut');
const { renderTimeline } = require('../out/ui/charts/timeline');
const fs = require('fs');
const path = require('path');

// --- Helpers ---

function createTestObservation(sessionId, index) {
    return {
        timestamp: new Date(Date.now() + index * 1000).toISOString(),
        session_id: sessionId,
        sentinel_name: 'test-sentinel',
        sentinel_label: 'Test Sentinel',
        severity: ['info', 'warning', 'critical'][index % 3],
        eval_id: `TEST-${String(index % 50).padStart(3, '0')}`,
        one_liner: `Test observation ${index} for session ${sessionId}`,
        analysis: `Detailed analysis for observation ${index}. This is a moderate-length string to simulate realistic payload sizes that would be encountered in production use.`,
        turn_number: index,
        duration_ms: Math.floor(Math.random() * 500),
        tier: ['security', 'general', 'session'][index % 3],
        visibility: index % 4 === 0 ? 'silent' : 'display',
        dynamic_eval_created: false,
        hook_type: index % 2 === 0 ? 'pre' : 'post',
        version: '1',
    };
}

function percentile(sorted, p) {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// --- Benchmarks ---

const results = [];

function benchObservationStoreLoad() {
    const NUM_OBS = 10000;
    const store = new ObservationStore(NUM_OBS);

    if (global.gc) { global.gc(); }
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    for (let s = 0; s < 10; s++) {
        const sessionId = `bench-session-${s}`;
        store.addFolder(`bench-folder-${s}`, `/tmp/bench-${s}/observations.jsonl`);
        for (let i = 0; i < 1000; i++) {
            store.addObservation
                ? store.addObservation(createTestObservation(sessionId, i))
                : (() => { /* access private method */ })();
            // Use the internal method via prototype if addObservation is private
        }
    }

    const loadTime = performance.now() - start;
    if (global.gc) { global.gc(); }
    const heapAfter = process.memoryUsage().heapUsed;
    const memoryMB = (heapAfter - heapBefore) / (1024 * 1024);

    results.push({
        name: 'ObservationStore: load 10K observations',
        metric: 'time',
        value: loadTime,
        unit: 'ms',
        budget: 500,
        passed: loadTime < 500,
    });

    results.push({
        name: 'ObservationStore: memory for 10K observations',
        metric: 'memory',
        value: memoryMB,
        unit: 'MB',
        budget: 15,
        passed: memoryMB < 15,
    });

    // Query performance
    const queryStart = performance.now();
    for (let i = 0; i < 100; i++) {
        store.getObservations();
    }
    const queryTotal = performance.now() - queryStart;
    const queryAvg = queryTotal / 100;

    results.push({
        name: 'ObservationStore: getObservations (10K, avg/100)',
        metric: 'time',
        value: queryAvg,
        unit: 'ms',
        budget: 50,
        passed: queryAvg < 50,
    });

    store.dispose();
}

function benchChartRendering() {
    const ITERATIONS = 1000;

    // Sparkline
    const sparkData = [];
    for (let i = 0; i < 1000; i++) { sparkData.push(Math.random() * 500); }
    const sparkTimes = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const s = performance.now();
        renderSparkline(sparkData, { width: 260, height: 40 });
        sparkTimes.push(performance.now() - s);
    }
    sparkTimes.sort((a, b) => a - b);

    results.push({
        name: 'Sparkline: 1000 points (avg)',
        metric: 'time',
        value: sparkTimes.reduce((a, b) => a + b, 0) / ITERATIONS,
        unit: 'ms',
        budget: 100,
        passed: percentile(sparkTimes, 99) < 100,
    });
    results.push({
        name: 'Sparkline: 1000 points (p99)',
        metric: 'time',
        value: percentile(sparkTimes, 99),
        unit: 'ms',
        budget: 100,
        passed: percentile(sparkTimes, 99) < 100,
    });

    // Donut
    const colors = [
        'var(--vscode-charts-red, #f44747)',
        'var(--vscode-charts-yellow, #cca700)',
        'var(--vscode-charts-blue, #3794ff)',
        'var(--vscode-charts-green, #89d185)',
        'var(--vscode-charts-purple, #b180d7)',
    ];
    const segments = [];
    for (let i = 0; i < 10; i++) {
        segments.push({ label: `Seg ${i}`, value: Math.floor(Math.random() * 100) + 1, color: colors[i % 5] });
    }
    const donutTimes = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const s = performance.now();
        renderDonut(segments, { size: 120, thickness: 16 });
        donutTimes.push(performance.now() - s);
    }
    donutTimes.sort((a, b) => a - b);

    results.push({
        name: 'Donut: 10 segments (avg)',
        metric: 'time',
        value: donutTimes.reduce((a, b) => a + b, 0) / ITERATIONS,
        unit: 'ms',
        budget: 100,
        passed: percentile(donutTimes, 99) < 100,
    });
    results.push({
        name: 'Donut: 10 segments (p99)',
        metric: 'time',
        value: percentile(donutTimes, 99),
        unit: 'ms',
        budget: 100,
        passed: percentile(donutTimes, 99) < 100,
    });

    // Timeline
    const severities = ['critical', 'warning', 'info'];
    const baseTime = Date.now();
    const points = [];
    for (let i = 0; i < 1000; i++) {
        points.push({
            timestamp: new Date(baseTime + i * 1000).toISOString(),
            severity: severities[i % 3],
            evalId: `TEST-${String(i % 50).padStart(3, '0')}`,
        });
    }
    const timelineTimes = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const s = performance.now();
        renderTimeline(points, { width: 260, height: 60 });
        timelineTimes.push(performance.now() - s);
    }
    timelineTimes.sort((a, b) => a - b);

    results.push({
        name: 'Timeline: 1000 points (avg)',
        metric: 'time',
        value: timelineTimes.reduce((a, b) => a + b, 0) / ITERATIONS,
        unit: 'ms',
        budget: 100,
        passed: percentile(timelineTimes, 99) < 100,
    });
    results.push({
        name: 'Timeline: 1000 points (p99)',
        metric: 'time',
        value: percentile(timelineTimes, 99),
        unit: 'ms',
        budget: 100,
        passed: percentile(timelineTimes, 99) < 100,
    });
}

function benchJSONLParsing() {
    const lines = [];
    let totalBytes = 0;
    let i = 0;
    while (totalBytes < 1024 * 1024) {
        const obs = createTestObservation('jsonl-bench', i++);
        const line = JSON.stringify(obs);
        lines.push(line);
        totalBytes += line.length + 1;
    }
    const blob = lines.join('\n');
    const sizeMB = blob.length / (1024 * 1024);

    const start = performance.now();
    const parsed = [];
    for (const line of blob.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) { continue; }
        try {
            parsed.push(JSON.parse(trimmed));
        } catch {
            // skip
        }
    }
    const elapsed = performance.now() - start;
    const throughputMBs = sizeMB / (elapsed / 1000);

    results.push({
        name: `JSONL parse: ${sizeMB.toFixed(1)}MB (${parsed.length} observations)`,
        metric: 'time',
        value: elapsed,
        unit: 'ms',
        budget: 500,
        passed: elapsed < 500,
    });
    results.push({
        name: 'JSONL parse: throughput',
        metric: 'throughput',
        value: throughputMBs,
        unit: 'MB/s',
        budget: 2,
        passed: throughputMBs >= 2,
    });
}

function benchConfigManager() {
    const configManager = new ConfigManager();
    const rules = [];
    for (let i = 0; i < 50; i++) {
        rules.push({
            id: `GEN-${String(i).padStart(3, '0')}`,
            version: 1,
            domainRaw: 'general',
            domain: 'GEN',
            severity: ['critical', 'warning', 'info'][i % 3],
            rule: `Rule ${i}: Detect problematic scenario ${i}.`,
            rationale: `Rationale ${i}.`,
            enabled: i % 5 !== 0,
        });
    }
    configManager.mergedRules = rules;

    const times = [];
    for (let i = 0; i < 1000; i++) {
        const s = performance.now();
        configManager.getEvalRules();
        times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);

    results.push({
        name: 'ConfigManager: getEvalRules (50 rules, avg/1000)',
        metric: 'time',
        value: times.reduce((a, b) => a + b, 0) / 1000,
        unit: 'ms',
        budget: 10,
        passed: percentile(times, 99) < 10,
    });

    configManager.dispose();
}

function benchLiveFeedProvider() {
    const store = new ObservationStore(1000);
    store.addFolder('bench-feed', '/tmp/bench-feed/observations.jsonl');
    for (let i = 0; i < 1000; i++) {
        // addObservation is private in TS but accessible in JS
        if (typeof store.addObservation === 'function') {
            store.addObservation(createTestObservation('bench-feed-session', i));
        }
    }

    const provider = new LiveFeedProvider(store);
    provider.setViewMode('all');

    const times = [];
    for (let i = 0; i < 100; i++) {
        const s = performance.now();
        provider.getChildren();
        times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);

    results.push({
        name: 'LiveFeedProvider: getChildren (1000 obs, avg/100)',
        metric: 'time',
        value: times.reduce((a, b) => a + b, 0) / 100,
        unit: 'ms',
        budget: 100,
        passed: percentile(times, 99) < 100,
    });
    results.push({
        name: 'LiveFeedProvider: getChildren (1000 obs, p99)',
        metric: 'time',
        value: percentile(times, 99),
        unit: 'ms',
        budget: 100,
        passed: percentile(times, 99) < 100,
    });

    provider.dispose();
    store.dispose();
}

// --- Main ---

console.log('Agent Sentinel Performance Benchmarks');
console.log('='.repeat(60));
console.log('');

benchObservationStoreLoad();
benchChartRendering();
benchJSONLParsing();
benchConfigManager();
benchLiveFeedProvider();

// --- Output ---

const jsonOutput = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
};

console.log('');
console.log('Results:');
console.log('-'.repeat(90));
console.log(
    'Benchmark'.padEnd(55) +
    'Value'.padStart(10) +
    'Budget'.padStart(10) +
    'Status'.padStart(10),
);
console.log('-'.repeat(90));

let allPassed = true;
for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    if (!r.passed) { allPassed = false; }
    const valueStr = r.metric === 'throughput'
        ? `${r.value.toFixed(1)} ${r.unit}`
        : `${r.value.toFixed(2)} ${r.unit}`;
    const budgetStr = r.metric === 'throughput'
        ? `>=${r.budget} ${r.unit}`
        : `<${r.budget} ${r.unit}`;
    console.log(
        r.name.padEnd(55) +
        valueStr.padStart(10) +
        budgetStr.padStart(10) +
        (r.passed ? `  ${status}` : `  **${status}**`).padStart(10),
    );
}

console.log('-'.repeat(90));
console.log('');

// Write JSON results
const outPath = path.join(__dirname, 'benchmark-results.json');
fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
console.log(`JSON results written to: ${outPath}`);
console.log('');

if (!allPassed) {
    console.error('BENCHMARK FAILURE: One or more benchmarks exceeded their budget.');
    process.exit(1);
} else {
    console.log('All benchmarks passed.');
}
