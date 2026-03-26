import * as assert from 'assert';
import { validateEvalYaml } from '../../evals/eval-validator';

suite('eval-validator', () => {
    const VALID_YAML = [
        'evals:',
        '  - id: "GEN-001"',
        '    version: 1',
        '    domain: "general"',
        '    severity: "warning"',
        '    rule: |',
        '      Never expose secrets in logs.',
        '    rationale: |',
        '      Secrets in logs leak to monitoring systems.',
        '',
    ].join('\n');

    test('valid YAML passes validation', () => {
        const result = validateEvalYaml(VALID_YAML);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.errors.length, 0);
    });

    test('missing evals: top-level key fails', () => {
        const yaml = 'rules:\n  - id: "GEN-001"\n';
        const result = validateEvalYaml(yaml);

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors.length, 1);
        assert.ok(result.errors[0].message.includes('evals:'));
        assert.strictEqual(result.errors[0].line, 1);
    });

    test('missing id field fails', () => {
        const yaml = [
            'evals:',
            '  - id: ""',
            '    domain: "general"',
            '    severity: "warning"',
            '    rule: |',
            '      Some rule text.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const idError = result.errors.find(e => e.message.includes('id'));
        assert.ok(idError, 'should have an id error');
    });

    test('missing severity field fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    rule: |',
            '      Some rule.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const sevError = result.errors.find(e => e.message.includes('severity'));
        assert.ok(sevError, 'should report missing severity');
    });

    test('missing domain field fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    severity: "warning"',
            '    rule: |',
            '      Some rule.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const domError = result.errors.find(e => e.message.includes('domain'));
        assert.ok(domError, 'should report missing domain');
    });

    test('missing rule field fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    severity: "warning"',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const ruleError = result.errors.find(e => e.message.includes('rule'));
        assert.ok(ruleError, 'should report missing rule');
    });

    test('invalid severity value fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    severity: "extreme"',
            '    rule: |',
            '      Some rule.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const sevError = result.errors.find(e => e.message.includes('Invalid severity'));
        assert.ok(sevError, 'should report invalid severity');
        assert.ok(sevError!.message.includes('extreme'));
    });

    test('empty domain fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: ""',
            '    severity: "warning"',
            '    rule: |',
            '      Some rule.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const domError = result.errors.find(e => e.message.includes('domain'));
        assert.ok(domError);
    });

    test('empty rule fails', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    severity: "warning"',
            '    rule: |',
            '',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        const ruleError = result.errors.find(e => e.message.includes('rule'));
        assert.ok(ruleError, 'should report empty rule');
    });

    test('multiple errors in one file are all reported', () => {
        // Missing severity, domain, and rule
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        // Should report at least severity, domain, and rule missing
        assert.ok(result.errors.length >= 3, `expected >= 3 errors, got ${result.errors.length}`);

        const messages = result.errors.map(e => e.message);
        assert.ok(messages.some(m => m.includes('severity')), 'should report severity');
        assert.ok(messages.some(m => m.includes('domain')), 'should report domain');
        assert.ok(messages.some(m => m.includes('rule')), 'should report rule');
    });

    test('error line numbers are 1-based and point to entry start', () => {
        const yaml = [
            'evals:',          // line 1
            '  - id: "GEN-001"', // line 2
            '    domain: "general"',
            '    severity: "warning"',
            // missing rule
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        for (const error of result.errors) {
            assert.ok(error.line >= 1, 'line numbers should be 1-based');
        }
    });

    test('no entries under evals: fails', () => {
        const yaml = 'evals:\n';

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors[0].message.includes('No eval entries'));
    });

    test('valid severity values are accepted', () => {
        for (const severity of ['critical', 'warning', 'info']) {
            const yaml = [
                'evals:',
                '  - id: "GEN-001"',
                '    domain: "general"',
                `    severity: "${severity}"`,
                '    rule: |',
                '      Some rule.',
            ].join('\n');

            const result = validateEvalYaml(yaml);
            const sevErrors = result.errors.filter(e => e.message.includes('severity'));
            assert.strictEqual(sevErrors.length, 0, `${severity} should be valid`);
        }
    });

    test('severity validation is case-insensitive', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    severity: "WARNING"',
            '    rule: |',
            '      Some rule.',
        ].join('\n');

        const result = validateEvalYaml(yaml);
        const sevErrors = result.errors.filter(e => e.message.includes('severity'));
        assert.strictEqual(sevErrors.length, 0, 'WARNING (uppercase) should be accepted');
    });

    test('multiple entries are each validated', () => {
        const yaml = [
            'evals:',
            '  - id: "GEN-001"',
            '    domain: "general"',
            '    severity: "warning"',
            '    rule: |',
            '      First rule.',
            '  - id: "SEC-001"',
            // missing domain, severity, rule for second entry
        ].join('\n');

        const result = validateEvalYaml(yaml);
        assert.strictEqual(result.valid, false);
        // First entry is valid; second is missing fields
        assert.ok(result.errors.length >= 1, 'should have errors from second entry');
    });
});
