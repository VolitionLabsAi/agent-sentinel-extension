import * as assert from 'assert';
import { highlightYaml } from '../../evals/yaml-highlighter';

suite('yaml-highlighter', () => {
    test('keys are wrapped in yaml-key spans', () => {
        const result = highlightYaml('name: value');
        assert.ok(result.includes('<span class="yaml-key">name</span>'));
    });

    test('string values are wrapped in yaml-value spans', () => {
        const result = highlightYaml('key: some text');
        assert.ok(result.includes('<span class="yaml-value">some text</span>'));
    });

    test('quoted string values are wrapped in yaml-string spans', () => {
        const result = highlightYaml('key: "quoted value"');
        assert.ok(result.includes('<span class="yaml-string">&quot;quoted value&quot;</span>'));
    });

    test('single-quoted strings are wrapped in yaml-string spans', () => {
        const result = highlightYaml("key: 'single quoted'");
        assert.ok(result.includes('<span class="yaml-string">'));
    });

    test('full-line comments are wrapped in yaml-comment spans', () => {
        const result = highlightYaml('# this is a comment');
        assert.ok(result.includes('<span class="yaml-comment">'));
        assert.ok(result.includes('# this is a comment'));
    });

    test('indented comments are wrapped in yaml-comment spans', () => {
        const result = highlightYaml('  # indented comment');
        assert.ok(result.includes('<span class="yaml-comment">'));
    });

    test('block scalar indicators (|) are highlighted', () => {
        const result = highlightYaml('rule: |');
        assert.ok(result.includes('<span class="yaml-scalar">|</span>'));
    });

    test('block scalar indicators (>) are highlighted', () => {
        const result = highlightYaml('rule: >');
        assert.ok(result.includes('<span class="yaml-scalar">&gt;</span>'));
    });

    test('numbers are highlighted with yaml-number class', () => {
        const result = highlightYaml('version: 1');
        assert.ok(result.includes('<span class="yaml-number">1</span>'));
    });

    test('negative numbers are highlighted', () => {
        const result = highlightYaml('offset: -5');
        assert.ok(result.includes('<span class="yaml-number">-5</span>'));
    });

    test('decimal numbers are highlighted', () => {
        const result = highlightYaml('ratio: 3.14');
        assert.ok(result.includes('<span class="yaml-number">3.14</span>'));
    });

    test('booleans are highlighted with yaml-boolean class', () => {
        const result = highlightYaml('enabled: true');
        assert.ok(result.includes('<span class="yaml-boolean">true</span>'));
    });

    test('false is highlighted as boolean', () => {
        const result = highlightYaml('enabled: false');
        assert.ok(result.includes('<span class="yaml-boolean">false</span>'));
    });

    test('yes/no are highlighted as booleans', () => {
        const resultYes = highlightYaml('active: yes');
        assert.ok(resultYes.includes('<span class="yaml-boolean">yes</span>'));

        const resultNo = highlightYaml('active: no');
        assert.ok(resultNo.includes('<span class="yaml-boolean">no</span>'));
    });

    test('empty input returns empty string', () => {
        const result = highlightYaml('');
        assert.strictEqual(result, '');
    });

    test('empty lines are preserved', () => {
        const result = highlightYaml('key: val\n\nother: val2');
        const lines = result.split('\n');
        assert.strictEqual(lines.length, 3);
        assert.strictEqual(lines[1], '');
    });

    test('list item markers are highlighted', () => {
        const result = highlightYaml('  - id: "test"');
        assert.ok(result.includes('<span class="yaml-list">'));
    });

    test('HTML special characters are escaped', () => {
        const result = highlightYaml('key: <script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'), 'should not contain raw <script>');
        assert.ok(result.includes('&lt;script&gt;'));
    });

    test('complex YAML with mixed elements highlights correctly', () => {
        const yaml = [
            '# Eval file',
            'evals:',
            '  - id: "GEN-001"',
            '    version: 1',
            '    enabled: true',
            '    rule: |',
            '      Multi-line rule text.',
        ].join('\n');

        const result = highlightYaml(yaml);

        // Comment line
        assert.ok(result.includes('<span class="yaml-comment">'));
        // Keys
        assert.ok(result.includes('<span class="yaml-key">evals</span>'));
        assert.ok(result.includes('<span class="yaml-key">id</span>'));
        assert.ok(result.includes('<span class="yaml-key">version</span>'));
        // Number
        assert.ok(result.includes('<span class="yaml-number">1</span>'));
        // Boolean
        assert.ok(result.includes('<span class="yaml-boolean">true</span>'));
        // Block scalar
        assert.ok(result.includes('<span class="yaml-scalar">|</span>'));
        // Quoted string
        assert.ok(result.includes('<span class="yaml-string">'));
    });

    test('inline comments are highlighted', () => {
        const result = highlightYaml('key: value # comment');
        assert.ok(result.includes('<span class="yaml-comment"># comment</span>'));
    });

    test('multiline output preserves line count', () => {
        const yaml = 'line1: a\nline2: b\nline3: c';
        const result = highlightYaml(yaml);
        assert.strictEqual(result.split('\n').length, 3);
    });

    test('indentation is preserved', () => {
        const result = highlightYaml('    key: val');
        // The indent should be present in the output
        assert.ok(result.startsWith('    '));
    });
});
