# Performance Baseline

Performance budgets enforced by CI. Benchmarks run on every push and PR.

## Budgets

| Metric | Budget | Category |
|--------|--------|----------|
| Extension activation | <200ms | Startup |
| Memory: 10 sessions x 1000 observations | <15MB | Memory |
| ObservationStore.getObservations (10K obs) | <50ms | Query |
| ConfigManager.getEvalRules (50 rules) | <10ms | Query |
| LiveFeedProvider.getChildren (1000 obs) | <100ms | Rendering |
| Sparkline render (1000 points) | <100ms | Chart |
| Donut render (10 segments) | <100ms | Chart |
| Timeline render (1000 points) | <100ms | Chart |
| JSONL parse (1MB) | <500ms | I/O |
| JSONL throughput | >=2 MB/s | I/O |
| CPU during idle | Near-zero (no active timers) | Resource |

## Running Benchmarks Locally

```bash
# Run the full test suite (includes performance gates)
npm test

# Run standalone benchmarks with detailed output
# Requires: npm run pretest (compiles TS to out/)
node benchmarks/run-benchmarks.js

# Run with GC exposed for accurate memory measurements
node --expose-gc benchmarks/run-benchmarks.js
```

## CI Enforcement

The `.github/workflows/ci.yml` pipeline runs benchmarks after the test suite. If any benchmark exceeds its budget, the pipeline fails.

Benchmark results are uploaded as a CI artifact (`benchmark-results.json`) for historical tracking.

## Baseline Environment

- **CI runner:** Ubuntu latest (GitHub Actions)
- **Node.js:** 20.x
- **Local baseline:** Results will vary by machine; budgets are set with generous headroom to pass reliably on CI

## Notes

- **Activation time** is tested only in the VS Code extension host runner (skipped in plain mocha).
- **CPU idle** is verified structurally (no active timers after dispose) rather than via process monitoring.
- **File watcher latency** (<200ms from write to display) depends on OS-level file system events and is validated in the E2E test suite, not the standalone benchmarks.
