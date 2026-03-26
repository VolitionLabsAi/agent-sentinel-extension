import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateEvalFromDescription, saveEval } from '../../evals/eval-creator';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-eval-creator-'));
}

suite('eval-creator', () => {
    suite('generateEvalFromDescription', () => {
        test('produces valid YAML with all required fields', () => {
            const result = generateEvalFromDescription({
                description: 'Never expose API keys in log output',
                domain: 'SEC',
                severity: 'warning',
            });

            assert.ok(result.yaml.includes('evals:'), 'should have top-level evals key');
            assert.ok(result.yaml.includes(`id: "${result.id}"`), 'should contain eval id');
            assert.ok(result.yaml.includes('version: 1'), 'should have version');
            assert.ok(result.yaml.includes('domain: "security"'), 'should have domain');
            assert.ok(result.yaml.includes('severity: "warning"'), 'should have severity');
            assert.ok(result.yaml.includes('rule: |'), 'should have rule block scalar');
            assert.ok(result.yaml.includes('rationale: |'), 'should have rationale block scalar');
        });

        test('generated eval ID follows <DOMAIN>-USER-<hex> pattern', () => {
            const result = generateEvalFromDescription({
                description: 'Test rule',
                domain: 'GEN',
                severity: 'info',
            });

            assert.match(result.id, /^GEN-USER-[0-9a-f]{6}$/, 'ID should match GEN-USER-<6hex>');
        });

        test('SEC domain produces SEC-USER-<hex> ID', () => {
            const result = generateEvalFromDescription({
                description: 'Test rule',
                domain: 'SEC',
                severity: 'critical',
            });

            assert.match(result.id, /^SEC-USER-[0-9a-f]{6}$/, 'ID should match SEC-USER-<6hex>');
        });

        test('domain mapping: GEN -> general', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'GEN',
                severity: 'info',
            });

            assert.ok(result.yaml.includes('domain: "general"'));
        });

        test('domain mapping: SEC -> security', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'SEC',
                severity: 'info',
            });

            assert.ok(result.yaml.includes('domain: "security"'));
        });

        test('domain mapping: custom domain passes through lowercase', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'PERF',
                severity: 'info',
            });

            assert.ok(result.yaml.includes('domain: "perf"'));
            assert.match(result.id, /^PERF-USER-[0-9a-f]{6}$/);
        });

        test('default severity is used as-is', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'GEN',
                severity: 'warning',
            });

            assert.strictEqual(result.severity, 'warning');
            assert.ok(result.yaml.includes('severity: "warning"'));
        });

        test('rule text comes from description', () => {
            const result = generateEvalFromDescription({
                description: 'Never commit secrets to git',
                domain: 'SEC',
                severity: 'critical',
            });

            assert.strictEqual(result.rule, 'Never commit secrets to git');
            assert.ok(result.yaml.includes('Never commit secrets to git'));
        });

        test('rationale is synthesized from description', () => {
            const result = generateEvalFromDescription({
                description: 'Check for unused imports',
                domain: 'GEN',
                severity: 'info',
            });

            assert.strictEqual(result.rationale, 'User-created rule to monitor for: Check for unused imports');
        });

        test('filePath uses correct directory structure', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'GEN',
                severity: 'info',
            });

            const expected = path.join('.volition', 'sentinel', 'evals', 'general', `${result.id.toLowerCase()}.yaml`);
            assert.strictEqual(result.filePath, expected);
        });

        test('filePath for SEC domain uses security directory', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'SEC',
                severity: 'warning',
            });

            assert.ok(result.filePath.includes(path.join('evals', 'security')));
        });

        test('filePath for custom domain uses lowercase domain directory', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'PERF',
                severity: 'info',
            });

            assert.ok(result.filePath.includes(path.join('evals', 'perf')));
        });

        test('description whitespace is trimmed', () => {
            const result = generateEvalFromDescription({
                description: '  spaces around  ',
                domain: 'GEN',
                severity: 'info',
            });

            assert.strictEqual(result.rule, 'spaces around');
        });

        test('unique IDs on successive calls', () => {
            const r1 = generateEvalFromDescription({ description: 'A', domain: 'GEN', severity: 'info' });
            const r2 = generateEvalFromDescription({ description: 'B', domain: 'GEN', severity: 'info' });

            assert.notStrictEqual(r1.id, r2.id, 'sequential calls should produce different IDs');
        });

        test('YAML ends with trailing newline', () => {
            const result = generateEvalFromDescription({
                description: 'Test',
                domain: 'GEN',
                severity: 'info',
            });

            assert.ok(result.yaml.endsWith('\n'), 'YAML should end with newline');
        });
    });

    suite('saveEval', () => {
        let tmpDir: string;

        setup(() => {
            tmpDir = makeTempDir();
        });

        teardown(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('writes YAML to correct path and creates directories', async () => {
            const yaml = 'evals:\n  - id: "TEST-001"\n';
            const relPath = path.join('.volition', 'sentinel', 'evals', 'general', 'test-001.yaml');

            const result = await saveEval(yaml, relPath, tmpDir);

            const expected = path.join(tmpDir, relPath);
            assert.strictEqual(result, expected);
            assert.ok(fs.existsSync(expected), 'file should exist');
            assert.strictEqual(fs.readFileSync(expected, 'utf-8'), yaml);
        });

        test('creates nested directories that do not exist', async () => {
            const yaml = 'test content';
            const relPath = path.join('deep', 'nested', 'dir', 'file.yaml');

            await saveEval(yaml, relPath, tmpDir);

            const fullPath = path.join(tmpDir, relPath);
            assert.ok(fs.existsSync(fullPath));
        });

        test('returns absolute path', async () => {
            const yaml = 'content';
            const relPath = 'simple.yaml';

            const result = await saveEval(yaml, relPath, tmpDir);

            assert.ok(path.isAbsolute(result), 'should return absolute path');
            assert.strictEqual(result, path.join(tmpDir, relPath));
        });
    });
});
