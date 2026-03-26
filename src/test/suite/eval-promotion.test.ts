import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { formatEvalAsYAML, promoteLocalEval } from '../../evals/eval-promotion';
import type { LocalEval } from '../../types/eval-rule';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-eval-promotion-'));
}

function makeLocalEval(overrides: Partial<LocalEval> = {}): LocalEval {
    return {
        id: 'LOCAL-001',
        severity: 'warning',
        rule: 'Never expose secrets in logs.',
        rationale: 'Secrets in logs leak to monitoring systems.',
        created_at: '2026-03-25T00:00:00.000Z',
        session_id: 'test-session-1',
        sentinel_name: 'GEN',
        ...overrides,
    };
}

suite('eval-promotion', () => {
    suite('formatEvalAsYAML', () => {
        test('produces valid YAML with correct structure', () => {
            const localEval = makeLocalEval();
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.startsWith('evals:\n'), 'should start with evals:');
            assert.ok(yaml.includes('  - id: "LOCAL-001"'), 'should contain id');
            assert.ok(yaml.includes('    version: 1'), 'should have version');
            assert.ok(yaml.includes('    severity: "warning"'), 'should have severity');
            assert.ok(yaml.includes('    rule: |'), 'should have rule block scalar');
            assert.ok(yaml.includes('    rationale: |'), 'should have rationale block scalar');
        });

        test('domain mapping: SEC -> security', () => {
            const localEval = makeLocalEval({ sentinel_name: 'SEC' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('domain: "security"'));
        });

        test('domain mapping: GEN -> general', () => {
            const localEval = makeLocalEval({ sentinel_name: 'GEN' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('domain: "general"'));
        });

        test('domain mapping: unknown -> local', () => {
            const localEval = makeLocalEval({ sentinel_name: 'UNKNOWN' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('domain: "local"'));
        });

        test('rule text is included as block scalar content', () => {
            const localEval = makeLocalEval({ rule: 'Check for unused imports' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('      Check for unused imports'));
        });

        test('rationale text is included as block scalar content', () => {
            const localEval = makeLocalEval({ rationale: 'Unused imports clutter the codebase' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('      Unused imports clutter the codebase'));
        });

        test('multi-line rule is formatted correctly', () => {
            const localEval = makeLocalEval({ rule: 'Line one.\nLine two.' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('      Line one.\n      Line two.'));
        });

        test('multi-line rationale is formatted correctly', () => {
            const localEval = makeLocalEval({ rationale: 'First.\nSecond.' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('      First.\n      Second.'));
        });

        test('YAML ends with trailing newline', () => {
            const yaml = formatEvalAsYAML(makeLocalEval());
            assert.ok(yaml.endsWith('\n'));
        });

        test('severity value is preserved', () => {
            const localEval = makeLocalEval({ severity: 'critical' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('severity: "critical"'));
        });

        test('eval id is preserved exactly', () => {
            const localEval = makeLocalEval({ id: 'LOCAL-CUSTOM-999' });
            const yaml = formatEvalAsYAML(localEval);

            assert.ok(yaml.includes('id: "LOCAL-CUSTOM-999"'));
        });
    });

    suite('promoteLocalEval', () => {
        let tmpDir: string;

        setup(() => {
            tmpDir = makeTempDir();
        });

        teardown(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('writes file to correct path for GEN domain', async () => {
            const localEval = makeLocalEval({ id: 'LOCAL-001', sentinel_name: 'GEN' });
            const result = await promoteLocalEval(localEval, tmpDir);

            const expected = path.join(tmpDir, '.volition', 'sentinel', 'evals', 'general', 'local-001.yaml');
            assert.strictEqual(result, expected);
            assert.ok(fs.existsSync(expected), 'file should exist');
        });

        test('writes file to correct path for SEC domain', async () => {
            const localEval = makeLocalEval({ id: 'SEC-LOCAL-001', sentinel_name: 'SEC' });
            const result = await promoteLocalEval(localEval, tmpDir);

            const expected = path.join(tmpDir, '.volition', 'sentinel', 'evals', 'security', 'sec-local-001.yaml');
            assert.strictEqual(result, expected);
            assert.ok(fs.existsSync(expected));
        });

        test('uses local/ directory for unknown domain', async () => {
            const localEval = makeLocalEval({ id: 'LOCAL-002', sentinel_name: 'CUSTOM' });
            const result = await promoteLocalEval(localEval, tmpDir);

            assert.ok(result.includes(path.join('evals', 'local')));
            assert.ok(fs.existsSync(result));
        });

        test('creates directories that do not exist', async () => {
            const localEval = makeLocalEval();
            await promoteLocalEval(localEval, tmpDir);

            const evalsDir = path.join(tmpDir, '.volition', 'sentinel', 'evals', 'general');
            assert.ok(fs.existsSync(evalsDir), 'nested directory should be created');
        });

        test('written file contains valid YAML content', async () => {
            const localEval = makeLocalEval();
            const filePath = await promoteLocalEval(localEval, tmpDir);

            const content = fs.readFileSync(filePath, 'utf-8');
            assert.ok(content.startsWith('evals:\n'));
            assert.ok(content.includes('id: "LOCAL-001"'));
            assert.ok(content.includes('domain: "general"'));
        });

        test('filename is lowercase eval id', async () => {
            const localEval = makeLocalEval({ id: 'LOCAL-ABC-001' });
            const result = await promoteLocalEval(localEval, tmpDir);

            assert.ok(result.endsWith('local-abc-001.yaml'));
        });

        test('returns absolute path', async () => {
            const localEval = makeLocalEval();
            const result = await promoteLocalEval(localEval, tmpDir);

            assert.ok(path.isAbsolute(result));
        });
    });
});
