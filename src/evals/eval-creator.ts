/**
 * Eval Creator — generates sentinel eval YAML from natural language descriptions.
 *
 * Uses a template-based approach to produce valid YAML matching the existing
 * eval rule schema. Designed for programmatic use — the webview panel is one
 * consumer, but other features (e.g., steering, CLI) can call this directly.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvalSeverity } from '../types/eval-rule.js';
import type { GeneratedEval, EvalCreationOptions } from '../types/eval-creation.js';

/**
 * Map domain prefix to YAML domain string and subdirectory.
 */
const DOMAIN_MAP: Record<string, { yamlDomain: string; dir: string }> = {
    GEN: { yamlDomain: 'general', dir: 'general' },
    SEC: { yamlDomain: 'security', dir: 'security' },
};

/**
 * Generate a unique eval ID.
 *
 * Format: `<DOMAIN>-USER-<6-char-hex>` where the hex is derived from
 * a timestamp + random bytes to avoid collisions.
 */
function generateEvalId(domain: string): string {
    const prefix = domain.toUpperCase();
    const hash = crypto
        .createHash('sha256')
        .update(`${Date.now()}-${crypto.randomBytes(8).toString('hex')}`)
        .digest('hex')
        .slice(0, 6);
    return `${prefix}-USER-${hash}`;
}

/**
 * Format a multi-line text as a YAML block scalar with the given indent.
 */
function formatBlockScalar(text: string, indent: string): string {
    return text
        .trim()
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n');
}

/**
 * Build eval YAML from structured fields.
 *
 * Produces output matching the format used in .volition/sentinel/evals/*.yaml:
 *
 *   evals:
 *     - id: "GEN-USER-a1b2c3"
 *       version: 1
 *       domain: "general"
 *       severity: "warning"
 *       rule: |
 *         ...
 *       rationale: |
 *         ...
 */
function buildEvalYaml(params: {
    id: string;
    yamlDomain: string;
    severity: EvalSeverity;
    rule: string;
    rationale: string;
}): string {
    const lines: string[] = [];
    lines.push('evals:');
    lines.push(`  - id: "${params.id}"`);
    lines.push('    version: 1');
    lines.push(`    domain: "${params.yamlDomain}"`);
    lines.push(`    severity: "${params.severity}"`);
    lines.push('    rule: |');
    lines.push(formatBlockScalar(params.rule, '      '));
    lines.push('    rationale: |');
    lines.push(formatBlockScalar(params.rationale, '      '));
    lines.push('');
    return lines.join('\n');
}

/**
 * Determine the file path for a new eval rule.
 *
 * Places the file in `.volition/sentinel/evals/<domain-dir>/<eval-id-lower>.yaml`.
 */
function determineFilePath(evalId: string, domain: string): string {
    const mapping = DOMAIN_MAP[domain.toUpperCase()];
    const dir = mapping?.dir ?? domain.toLowerCase();
    return path.join('.volition', 'sentinel', 'evals', dir, `${evalId.toLowerCase()}.yaml`);
}

/**
 * Generate a sentinel eval rule from a natural language description.
 *
 * The description is used as the rule text. A rationale is synthesized
 * from the description to explain why the rule exists. This is the
 * template-based fallback — no LLM required.
 *
 * @param options - Creation parameters (description, domain, severity)
 * @returns A GeneratedEval with YAML, parsed fields, and suggested file path
 */
export function generateEvalFromDescription(options: EvalCreationOptions): GeneratedEval {
    const { description, domain, severity } = options;

    const id = generateEvalId(domain);
    const mapping = DOMAIN_MAP[domain.toUpperCase()];
    const yamlDomain = mapping?.yamlDomain ?? domain.toLowerCase();

    // The description becomes the rule text directly.
    // Rationale explains why this rule was created.
    const rule = description.trim();
    const rationale = `User-created rule to monitor for: ${description.trim()}`;

    const yaml = buildEvalYaml({ id, yamlDomain, severity, rule, rationale });
    const filePath = determineFilePath(id, domain);

    return { yaml, id, severity, domain, rule, rationale, filePath };
}

/**
 * Save a generated eval to disk.
 *
 * Creates the target directory if it doesn't exist, then writes the YAML file.
 * Sentinel picks up new eval files on the next trigger — no restart needed.
 *
 * @param yaml - The YAML content to write
 * @param filePath - Relative path from projectDir (e.g., .volition/sentinel/evals/general/...)
 * @param projectDir - Absolute path to the workspace/project root
 * @returns The absolute path of the written file
 */
export async function saveEval(yaml: string, filePath: string, projectDir: string): Promise<string> {
    const absolutePath = path.join(projectDir, filePath);
    const dir = path.dirname(absolutePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, yaml, 'utf-8');

    return absolutePath;
}
