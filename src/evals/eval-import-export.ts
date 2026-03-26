/**
 * Eval Import/Export — community sharing infrastructure for sentinel eval rules.
 *
 * Export: serialize eval rules as standalone YAML files or multi-eval pack files.
 * Import: read YAML files, validate schema, detect ID conflicts, copy to target directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvalRule } from '../types/eval-rule.js';
import { validateEvalYaml } from './eval-validator.js';

/** Result of importing a single eval. */
export interface ImportResult {
    /** Whether the import succeeded. */
    success: boolean;
    /** The eval ID that was imported (or attempted). */
    evalId: string;
    /** Absolute path of the written file, if successful. */
    filePath?: string;
    /** Error message if the import failed. */
    error?: string;
    /** True if an eval with this ID already exists in the target directory. */
    conflict?: boolean;
}

/** Metadata header included in exported eval files. */
interface ExportMetadata {
    author?: string;
    exported_at: string;
    description?: string;
}

// ── Domain mapping (mirrors eval-creator.ts / eval-promotion.ts) ────

const DOMAIN_DIR_MAP: Record<string, string> = {
    general: 'general',
    security: 'security',
    local: 'local',
};

function domainToDir(domainRaw: string): string {
    return DOMAIN_DIR_MAP[domainRaw.toLowerCase()] ?? domainRaw.toLowerCase();
}

// ── YAML formatting helpers ─────────────────────────────────────────

function formatBlockScalar(text: string, indent: string): string {
    return text
        .trim()
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n');
}

function formatSingleEvalYaml(rule: EvalRule): string {
    const lines: string[] = [];
    lines.push(`  - id: "${rule.id}"`);
    lines.push(`    version: ${rule.version}`);
    lines.push(`    domain: "${rule.domainRaw}"`);
    lines.push(`    severity: "${rule.severity}"`);
    lines.push('    rule: |');
    lines.push(formatBlockScalar(rule.rule, '      '));
    lines.push('    rationale: |');
    lines.push(formatBlockScalar(rule.rationale, '      '));
    return lines.join('\n');
}

function formatMetadataComment(meta: ExportMetadata): string {
    const lines: string[] = [];
    lines.push('# Sentinel Eval Export');
    if (meta.author) {
        lines.push(`# Author: ${meta.author}`);
    }
    lines.push(`# Exported: ${meta.exported_at}`);
    if (meta.description) {
        lines.push(`# Description: ${meta.description}`);
    }
    lines.push('');
    return lines.join('\n');
}

// ── Export functions ─────────────────────────────────────────────────

/**
 * Export a single eval rule as a standalone YAML file with metadata header.
 *
 * @param rule - The eval rule to export
 * @param outputPath - Absolute path to write the YAML file
 * @param description - Optional description for the export metadata
 */
export async function exportEval(
    rule: EvalRule,
    outputPath: string,
    description?: string,
): Promise<void> {
    const meta: ExportMetadata = {
        exported_at: new Date().toISOString(),
        description: description ?? `Exported eval: ${rule.id}`,
    };

    const yaml = [
        formatMetadataComment(meta),
        'evals:',
        formatSingleEvalYaml(rule),
        '',
    ].join('\n');

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, yaml, 'utf-8');
}

/**
 * Export multiple eval rules as a single YAML pack file.
 *
 * @param rules - Array of eval rules to export
 * @param outputPath - Absolute path to write the YAML pack file
 * @param description - Optional description for the pack metadata
 */
export async function exportEvalPack(
    rules: EvalRule[],
    outputPath: string,
    description?: string,
): Promise<void> {
    const meta: ExportMetadata = {
        exported_at: new Date().toISOString(),
        description: description ?? `Eval pack with ${rules.length} rules`,
    };

    const evalEntries = rules.map(formatSingleEvalYaml).join('\n\n');

    const yaml = [
        formatMetadataComment(meta),
        'evals:',
        evalEntries,
        '',
    ].join('\n');

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, yaml, 'utf-8');
}

// ── Import helpers ──────────────────────────────────────────────────

/**
 * Parse eval entries from raw YAML content.
 * Returns the parsed fields for each eval entry found under `evals:`.
 *
 * Mirrors the config-manager's parseEvalYaml logic.
 */
function parseEvalsFromYaml(content: string): Array<{
    id: string;
    version: number;
    domain: string;
    severity: string;
    rule: string;
    rationale: string;
}> {
    const results: Array<{
        id: string;
        version: number;
        domain: string;
        severity: string;
        rule: string;
        rationale: string;
    }> = [];

    const lines = content.split('\n');
    let i = 0;

    // Find the 'evals:' key
    while (i < lines.length && !lines[i].match(/^evals:\s*$/)) {
        i++;
    }
    i++; // skip 'evals:' line

    while (i < lines.length) {
        const idMatch = lines[i].match(/^\s+-\s+id:\s*"?([^"]+)"?\s*$/);
        if (!idMatch) {
            i++;
            continue;
        }

        const entry: Record<string, string> = { id: idMatch[1] };
        i++;

        while (i < lines.length) {
            const line = lines[i];

            if (line.match(/^\s+-\s+id:/)) { break; }

            const scalarMatch = line.match(/^\s{4,}(\w+):\s*"?([^"|]+)"?\s*$/);
            if (scalarMatch && !['positive', 'negative'].includes(scalarMatch[1])) {
                entry[scalarMatch[1]] = scalarMatch[2].trim();
                i++;
                continue;
            }

            const blockMatch = line.match(/^\s{4,}(\w+):\s*\|\s*$/);
            if (blockMatch) {
                const key = blockMatch[1];
                i++;
                const blockLines: string[] = [];
                while (i < lines.length) {
                    const blockLine = lines[i];
                    if (blockLine.trim() === '') {
                        blockLines.push('');
                        i++;
                        continue;
                    }
                    if (blockLine.match(/^\s{6,}/)) {
                        blockLines.push(blockLine.trimStart());
                        i++;
                    } else {
                        break;
                    }
                }
                entry[key] = blockLines.join('\n').trim();
                continue;
            }

            if (line.match(/^\s{4,}(examples|positive|negative):/)) {
                i++;
                while (i < lines.length && (lines[i].match(/^\s{6,}/) || lines[i].trim() === '')) {
                    i++;
                }
                continue;
            }

            i++;
        }

        results.push({
            id: entry.id ?? '',
            version: parseInt(entry.version ?? '1', 10),
            domain: entry.domain ?? 'general',
            severity: entry.severity ?? 'info',
            rule: entry.rule ?? '',
            rationale: entry.rationale ?? '',
        });
    }

    return results;
}

/**
 * Check whether an eval with the given ID already exists in the target directory.
 */
async function evalExistsInDir(evalId: string, targetDir: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(targetDir, { recursive: true }) as string[];
        for (const entry of entries) {
            const entryStr = String(entry);
            if (!entryStr.endsWith('.yaml') && !entryStr.endsWith('.yml')) {
                continue;
            }
            try {
                const content = await fs.readFile(path.join(targetDir, entryStr), 'utf-8');
                if (content.includes(`id: "${evalId}"`) || content.includes(`id: ${evalId}`)) {
                    return true;
                }
            } catch {
                // skip unreadable files
            }
        }
    } catch {
        // directory doesn't exist yet — no conflict
    }
    return false;
}

/**
 * Write a single parsed eval to the target evals directory.
 */
function buildEvalFileContent(parsed: {
    id: string;
    version: number;
    domain: string;
    severity: string;
    rule: string;
    rationale: string;
}): string {
    const lines: string[] = [];
    lines.push('evals:');
    lines.push(`  - id: "${parsed.id}"`);
    lines.push(`    version: ${parsed.version}`);
    lines.push(`    domain: "${parsed.domain}"`);
    lines.push(`    severity: "${parsed.severity}"`);
    lines.push('    rule: |');
    lines.push(formatBlockScalar(parsed.rule, '      '));
    lines.push('    rationale: |');
    lines.push(formatBlockScalar(parsed.rationale, '      '));
    lines.push('');
    return lines.join('\n');
}

// ── Import functions ────────────────────────────────────────────────

/**
 * Import a single eval from a YAML file into the target evals directory.
 *
 * Reads the file, validates its schema, checks for ID conflicts, and
 * writes each eval to the appropriate domain subdirectory.
 *
 * If the file contains multiple evals, only the first is imported.
 * Use `importEvalPack` for multi-eval files.
 *
 * @param filePath - Absolute path to the YAML file to import
 * @param targetDir - Absolute path to the evals directory (e.g., `.volition/sentinel/evals`)
 * @returns Import result with success status and details
 */
export async function importEval(
    filePath: string,
    targetDir: string,
): Promise<ImportResult> {
    let content: string;
    try {
        content = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
        return {
            success: false,
            evalId: '',
            error: `Failed to read file: ${err}`,
        };
    }

    // Strip comment lines before validation (metadata headers)
    const yamlContent = content
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('\n');

    // Validate schema
    const validation = validateEvalYaml(yamlContent);
    if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => `Line ${e.line}: ${e.message}`).join('; ');
        return {
            success: false,
            evalId: '',
            error: `Validation failed: ${errorMessages}`,
        };
    }

    // Parse evals
    const parsed = parseEvalsFromYaml(yamlContent);
    if (parsed.length === 0) {
        return {
            success: false,
            evalId: '',
            error: 'No eval entries found in file',
        };
    }

    const eval_ = parsed[0];

    // Check for ID conflict
    const conflict = await evalExistsInDir(eval_.id, targetDir);
    if (conflict) {
        return {
            success: false,
            evalId: eval_.id,
            error: `Eval with ID "${eval_.id}" already exists in target directory`,
            conflict: true,
        };
    }

    // Write to domain subdirectory
    const domainDir = domainToDir(eval_.domain);
    const outputDir = path.join(targetDir, domainDir);
    await fs.mkdir(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, `${eval_.id.toLowerCase()}.yaml`);
    const yamlOutput = buildEvalFileContent(eval_);
    await fs.writeFile(outputFile, yamlOutput, 'utf-8');

    return {
        success: true,
        evalId: eval_.id,
        filePath: outputFile,
    };
}

/**
 * Import all evals from a pack file into the target evals directory.
 *
 * Each eval in the pack is imported independently — one failure does not
 * block the others. Results are returned per-eval.
 *
 * @param filePath - Absolute path to the YAML pack file to import
 * @param targetDir - Absolute path to the evals directory
 * @returns Array of import results, one per eval in the pack
 */
export async function importEvalPack(
    filePath: string,
    targetDir: string,
): Promise<ImportResult[]> {
    let content: string;
    try {
        content = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
        return [{
            success: false,
            evalId: '',
            error: `Failed to read file: ${err}`,
        }];
    }

    // Strip comment lines before validation
    const yamlContent = content
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('\n');

    // Validate schema
    const validation = validateEvalYaml(yamlContent);
    if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => `Line ${e.line}: ${e.message}`).join('; ');
        return [{
            success: false,
            evalId: '',
            error: `Validation failed: ${errorMessages}`,
        }];
    }

    // Parse all evals
    const parsed = parseEvalsFromYaml(yamlContent);
    if (parsed.length === 0) {
        return [{
            success: false,
            evalId: '',
            error: 'No eval entries found in file',
        }];
    }

    // Import each eval independently
    const results: ImportResult[] = [];
    for (const eval_ of parsed) {
        // Check for ID conflict
        const conflict = await evalExistsInDir(eval_.id, targetDir);
        if (conflict) {
            results.push({
                success: false,
                evalId: eval_.id,
                error: `Eval with ID "${eval_.id}" already exists in target directory`,
                conflict: true,
            });
            continue;
        }

        // Write to domain subdirectory
        const domainDir = domainToDir(eval_.domain);
        const outputDir = path.join(targetDir, domainDir);
        await fs.mkdir(outputDir, { recursive: true });

        const outputFile = path.join(outputDir, `${eval_.id.toLowerCase()}.yaml`);
        const yamlOutput = buildEvalFileContent(eval_);

        try {
            await fs.writeFile(outputFile, yamlOutput, 'utf-8');
            results.push({
                success: true,
                evalId: eval_.id,
                filePath: outputFile,
            });
        } catch (err) {
            results.push({
                success: false,
                evalId: eval_.id,
                error: `Failed to write file: ${err}`,
            });
        }
    }

    return results;
}
