import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    exportEval,
    exportEvalPack,
    importEval,
    importEvalPack,
} from '../../evals/eval-import-export';
import type { EvalRule } from '../../types/eval-rule';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-import-export-'));
}

function makeEvalRule(overrides: Partial<EvalRule> = {}): EvalRule {
    return {
        id: 'GEN-TEST-001',
        version: 1,
        domainRaw: 'general',
        domain: 'GEN',
        severity: 'warning',
        rule: 'Detect test pattern violations.',
        rationale: 'Test patterns should be consistent.',
        enabled: true,
        ...overrides,
    };
}

suite('eval-import-export', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = makeTempDir();
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── Export tests ────────────────────────────────────────

    suite('exportEval', () => {
        test('writes a valid YAML file with metadata header', async () => {
            const rule = makeEvalRule();
            const outputPath = path.join(tmpDir, 'exported.yaml');

            await exportEval(rule, outputPath);

            assert.ok(fs.existsSync(outputPath), 'file should exist');
            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('# Sentinel Eval Export'), 'should have metadata header');
            assert.ok(content.includes('# Exported:'), 'should have export timestamp');
            assert.ok(content.includes('evals:'), 'should have evals key');
            assert.ok(content.includes('id: "GEN-TEST-001"'), 'should contain eval id');
        });

        test('includes description in metadata when provided', async () => {
            const rule = makeEvalRule();
            const outputPath = path.join(tmpDir, 'exported.yaml');

            await exportEval(rule, outputPath, 'My custom description');

            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('# Description: My custom description'));
        });

        test('creates parent directories if needed', async () => {
            const rule = makeEvalRule();
            const outputPath = path.join(tmpDir, 'nested', 'dir', 'exported.yaml');

            await exportEval(rule, outputPath);

            assert.ok(fs.existsSync(outputPath));
        });

        test('preserves severity and domain', async () => {
            const rule = makeEvalRule({ severity: 'critical', domainRaw: 'security' });
            const outputPath = path.join(tmpDir, 'exported.yaml');

            await exportEval(rule, outputPath);

            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('severity: "critical"'));
            assert.ok(content.includes('domain: "security"'));
        });

        test('formats multi-line rule as block scalar', async () => {
            const rule = makeEvalRule({ rule: 'Line one.\nLine two.\nLine three.' });
            const outputPath = path.join(tmpDir, 'exported.yaml');

            await exportEval(rule, outputPath);

            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('rule: |'));
            assert.ok(content.includes('      Line one.'));
            assert.ok(content.includes('      Line two.'));
        });
    });

    suite('exportEvalPack', () => {
        test('writes multiple evals to a single file', async () => {
            const rules = [
                makeEvalRule({ id: 'GEN-TEST-001' }),
                makeEvalRule({ id: 'GEN-TEST-002', rule: 'Second rule.' }),
            ];
            const outputPath = path.join(tmpDir, 'pack.yaml');

            await exportEvalPack(rules, outputPath);

            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('id: "GEN-TEST-001"'));
            assert.ok(content.includes('id: "GEN-TEST-002"'));
        });

        test('includes pack description in metadata', async () => {
            const rules = [makeEvalRule()];
            const outputPath = path.join(tmpDir, 'pack.yaml');

            await exportEvalPack(rules, outputPath, 'Test pack');

            const content = fs.readFileSync(outputPath, 'utf-8');
            assert.ok(content.includes('# Description: Test pack'));
        });

        test('has single evals: key for all entries', async () => {
            const rules = [
                makeEvalRule({ id: 'A-001' }),
                makeEvalRule({ id: 'A-002' }),
                makeEvalRule({ id: 'A-003' }),
            ];
            const outputPath = path.join(tmpDir, 'pack.yaml');

            await exportEvalPack(rules, outputPath);

            const content = fs.readFileSync(outputPath, 'utf-8');
            const evalsCount = (content.match(/^evals:/gm) ?? []).length;
            assert.strictEqual(evalsCount, 1, 'should have exactly one evals: key');
        });
    });

    // ── Import tests ────────────────────────────────────────

    suite('importEval', () => {
        test('imports a valid single-eval file', async () => {
            // Create a source file
            const sourceYaml = [
                'evals:',
                '  - id: "GEN-IMPORT-001"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "warning"',
                '    rule: |',
                '      Test rule for import.',
                '    rationale: |',
                '      Test rationale.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'source.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const result = await importEval(sourceFile, targetDir);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.evalId, 'GEN-IMPORT-001');
            assert.ok(result.filePath);
            assert.ok(fs.existsSync(result.filePath!));
        });

        test('places eval in correct domain subdirectory', async () => {
            const sourceYaml = [
                'evals:',
                '  - id: "SEC-IMPORT-001"',
                '    version: 1',
                '    domain: "security"',
                '    severity: "critical"',
                '    rule: |',
                '      Security test rule.',
                '    rationale: |',
                '      Security rationale.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'source.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const result = await importEval(sourceFile, targetDir);

            assert.ok(result.filePath!.includes(path.join('evals', 'security')));
        });

        test('detects ID conflict', async () => {
            // Pre-populate target with an existing eval
            const existingDir = path.join(tmpDir, 'evals', 'general');
            fs.mkdirSync(existingDir, { recursive: true });
            fs.writeFileSync(
                path.join(existingDir, 'gen-existing-001.yaml'),
                'evals:\n  - id: "GEN-EXISTING-001"\n    version: 1\n    domain: "general"\n    severity: "info"\n    rule: |\n      Existing rule.\n    rationale: |\n      Existing rationale.\n',
            );

            const sourceYaml = [
                'evals:',
                '  - id: "GEN-EXISTING-001"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "warning"',
                '    rule: |',
                '      Conflicting rule.',
                '    rationale: |',
                '      Conflicting rationale.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'source.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const result = await importEval(sourceFile, targetDir);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.conflict, true);
            assert.strictEqual(result.evalId, 'GEN-EXISTING-001');
        });

        test('rejects invalid YAML', async () => {
            const sourceFile = path.join(tmpDir, 'bad.yaml');
            fs.writeFileSync(sourceFile, 'not valid eval yaml');

            const targetDir = path.join(tmpDir, 'evals');
            const result = await importEval(sourceFile, targetDir);

            assert.strictEqual(result.success, false);
            assert.ok(result.error!.includes('Validation failed'));
        });

        test('handles non-existent source file', async () => {
            const result = await importEval('/nonexistent/file.yaml', path.join(tmpDir, 'evals'));

            assert.strictEqual(result.success, false);
            assert.ok(result.error!.includes('Failed to read'));
        });

        test('strips comment headers before validation', async () => {
            const sourceYaml = [
                '# Sentinel Eval Export',
                '# Exported: 2026-03-25T00:00:00.000Z',
                '# Description: Test export',
                '',
                'evals:',
                '  - id: "GEN-COMMENT-001"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "info"',
                '    rule: |',
                '      Rule with comments in header.',
                '    rationale: |',
                '      Rationale text.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'commented.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const result = await importEval(sourceFile, targetDir);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.evalId, 'GEN-COMMENT-001');
        });
    });

    suite('importEvalPack', () => {
        test('imports multiple evals from a pack file', async () => {
            const sourceYaml = [
                'evals:',
                '  - id: "PACK-001"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "warning"',
                '    rule: |',
                '      First pack rule.',
                '    rationale: |',
                '      First rationale.',
                '',
                '  - id: "PACK-002"',
                '    version: 1',
                '    domain: "security"',
                '    severity: "critical"',
                '    rule: |',
                '      Second pack rule.',
                '    rationale: |',
                '      Second rationale.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'pack.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const results = await importEvalPack(sourceFile, targetDir);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].success, true);
            assert.strictEqual(results[0].evalId, 'PACK-001');
            assert.strictEqual(results[1].success, true);
            assert.strictEqual(results[1].evalId, 'PACK-002');
        });

        test('reports individual failures without blocking others', async () => {
            // Pre-populate with one conflicting eval
            const existingDir = path.join(tmpDir, 'evals', 'general');
            fs.mkdirSync(existingDir, { recursive: true });
            fs.writeFileSync(
                path.join(existingDir, 'pack-001.yaml'),
                'evals:\n  - id: "PACK-001"\n    version: 1\n    domain: "general"\n    severity: "info"\n    rule: |\n      Existing.\n    rationale: |\n      Existing.\n',
            );

            const sourceYaml = [
                'evals:',
                '  - id: "PACK-001"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "warning"',
                '    rule: |',
                '      Conflicting rule.',
                '    rationale: |',
                '      Conflicting rationale.',
                '',
                '  - id: "PACK-NEW-002"',
                '    version: 1',
                '    domain: "general"',
                '    severity: "info"',
                '    rule: |',
                '      New rule.',
                '    rationale: |',
                '      New rationale.',
                '',
            ].join('\n');
            const sourceFile = path.join(tmpDir, 'pack.yaml');
            fs.writeFileSync(sourceFile, sourceYaml);

            const targetDir = path.join(tmpDir, 'evals');
            const results = await importEvalPack(sourceFile, targetDir);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].success, false);
            assert.strictEqual(results[0].conflict, true);
            assert.strictEqual(results[1].success, true);
            assert.strictEqual(results[1].evalId, 'PACK-NEW-002');
        });

        test('handles non-existent file', async () => {
            const results = await importEvalPack('/nonexistent/pack.yaml', path.join(tmpDir, 'evals'));

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].success, false);
        });

        test('handles empty pack', async () => {
            const sourceFile = path.join(tmpDir, 'empty.yaml');
            fs.writeFileSync(sourceFile, 'evals:\n');

            const targetDir = path.join(tmpDir, 'evals');
            const results = await importEvalPack(sourceFile, targetDir);

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].success, false);
            assert.ok(results[0].error!.includes('No eval entries'));
        });
    });

    // ── Round-trip test ─────────────────────────────────────

    suite('round-trip', () => {
        test('export then import preserves eval content', async () => {
            const rule = makeEvalRule({
                id: 'GEN-ROUNDTRIP-001',
                rule: 'Detect round-trip issues.\nMulti-line rule text.',
                rationale: 'Round-trips should preserve content.',
            });

            const exportPath = path.join(tmpDir, 'roundtrip.yaml');
            await exportEval(rule, exportPath);

            const targetDir = path.join(tmpDir, 'imported-evals');
            const result = await importEval(exportPath, targetDir);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.evalId, 'GEN-ROUNDTRIP-001');

            // Verify the imported file contains the correct content
            const content = fs.readFileSync(result.filePath!, 'utf-8');
            assert.ok(content.includes('Detect round-trip issues.'));
            assert.ok(content.includes('Multi-line rule text.'));
            assert.ok(content.includes('Round-trips should preserve content.'));
        });

        test('export pack then import pack round-trips', async () => {
            const rules = [
                makeEvalRule({ id: 'RT-001', rule: 'First rule.' }),
                makeEvalRule({ id: 'RT-002', rule: 'Second rule.', domainRaw: 'security', domain: 'SEC' }),
            ];

            const exportPath = path.join(tmpDir, 'rt-pack.yaml');
            await exportEvalPack(rules, exportPath);

            const targetDir = path.join(tmpDir, 'imported-evals');
            const results = await importEvalPack(exportPath, targetDir);

            assert.strictEqual(results.length, 2);
            assert.ok(results.every((r) => r.success));
            assert.strictEqual(results[0].evalId, 'RT-001');
            assert.strictEqual(results[1].evalId, 'RT-002');

            // Verify domain directories
            assert.ok(results[0].filePath!.includes(path.join('general')));
            assert.ok(results[1].filePath!.includes(path.join('security')));
        });
    });
});
