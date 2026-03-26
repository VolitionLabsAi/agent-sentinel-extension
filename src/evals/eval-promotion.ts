import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalEval } from '../types/eval-rule.js';

/**
 * Domain directory mapping: sentinel_name prefix → subdirectory under evals/.
 */
const DOMAIN_DIRS: Record<string, string> = {
    SEC: 'security',
    GEN: 'general',
};

/**
 * Format a LocalEval as YAML matching the sentinel eval rule schema.
 *
 * Pure function — no side effects.
 */
export function formatEvalAsYAML(localEval: LocalEval): string {
    const lines: string[] = [];
    lines.push('evals:');
    lines.push(`  - id: "${localEval.id}"`);
    lines.push('    version: 1');

    // Map sentinel_name to the YAML domain string
    const domainRaw = DOMAIN_DIRS[localEval.sentinel_name] ?? 'local';
    lines.push(`    domain: "${domainRaw}"`);
    lines.push(`    severity: "${localEval.severity}"`);

    // Rule as block scalar
    lines.push('    rule: |');
    for (const ruleLine of localEval.rule.trim().split('\n')) {
        lines.push(`      ${ruleLine}`);
    }

    // Rationale as block scalar
    lines.push('    rationale: |');
    for (const ratLine of localEval.rationale.trim().split('\n')) {
        lines.push(`      ${ratLine}`);
    }

    lines.push('');
    return lines.join('\n');
}

/**
 * Promote a LOCAL dynamic eval to a permanent YAML rule file.
 *
 * - Formats the eval as YAML matching the existing eval rule schema
 * - Determines the domain directory from sentinel_name
 * - Creates the directory if needed under `.volition/sentinel/evals/<domain>/`
 * - Writes the YAML file as `<eval-id>.yaml`
 *
 * @returns The absolute file path of the promoted eval file.
 */
export async function promoteLocalEval(
    localEval: LocalEval,
    workspaceRoot: string,
): Promise<string> {
    // Determine target directory
    const domainDir = DOMAIN_DIRS[localEval.sentinel_name] ?? 'local';
    const evalsDir = path.join(workspaceRoot, '.volition', 'sentinel', 'evals', domainDir);

    // Create directory if needed
    await fs.mkdir(evalsDir, { recursive: true });

    // Generate filename from eval ID (lowercase, e.g. LOCAL-001.yaml)
    const filename = `${localEval.id.toLowerCase()}.yaml`;
    const filePath = path.join(evalsDir, filename);

    // Format and write
    const yaml = formatEvalAsYAML(localEval);
    await fs.writeFile(filePath, yaml, 'utf-8');

    return filePath;
}
