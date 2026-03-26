/**
 * Schema validation for eval YAML files.
 *
 * Validates that eval YAML content conforms to the sentinel eval rule schema:
 * required fields (id, severity, domain, rule), valid severity values, and
 * structural correctness. Uses the same line-by-line parsing approach as
 * the config-manager's parseEvalYaml.
 */

/** A single validation error with location info. */
export interface ValidationError {
    /** 1-based line number where the error was detected. */
    line: number;
    /** Human-readable error message. */
    message: string;
}

/** Result of validating eval YAML content. */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

const VALID_SEVERITIES = ['critical', 'warning', 'info'];

/**
 * Validate eval YAML content against the sentinel eval rule schema.
 *
 * Checks:
 * - The document contains an `evals:` top-level key
 * - Each entry has required fields: id, severity, domain, rule
 * - severity is one of: critical, warning, info
 * - domain is a non-empty string
 * - rule is a non-empty string
 *
 * @param yaml  Raw YAML string to validate
 * @returns Validation result with any errors found
 */
export function validateEvalYaml(yaml: string): ValidationResult {
    const errors: ValidationError[] = [];
    const lines = yaml.split('\n');

    // Find the 'evals:' key
    let evalsLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^evals:\s*$/)) {
            evalsLine = i;
            break;
        }
    }

    if (evalsLine === -1) {
        errors.push({
            line: 1,
            message: 'Missing required top-level "evals:" key',
        });
        return { valid: false, errors };
    }

    // Parse entries and validate each one
    const entries = parseEntries(lines, evalsLine + 1);

    if (entries.length === 0) {
        errors.push({
            line: evalsLine + 1,
            message: 'No eval entries found under "evals:"',
        });
        return { valid: false, errors };
    }

    for (const entry of entries) {
        // Required: id
        if (!entry.fields.id || entry.fields.id.trim() === '') {
            errors.push({
                line: entry.startLine,
                message: 'Missing required field: id',
            });
        }

        // Required: severity (must be valid value)
        if (!entry.fields.severity || entry.fields.severity.trim() === '') {
            errors.push({
                line: entry.fieldLines.severity ?? entry.startLine,
                message: 'Missing required field: severity',
            });
        } else if (!VALID_SEVERITIES.includes(entry.fields.severity.trim().toLowerCase())) {
            errors.push({
                line: entry.fieldLines.severity ?? entry.startLine,
                message: `Invalid severity "${entry.fields.severity.trim()}". Must be one of: ${VALID_SEVERITIES.join(', ')}`,
            });
        }

        // Required: domain (non-empty)
        if (!entry.fields.domain || entry.fields.domain.trim() === '') {
            errors.push({
                line: entry.fieldLines.domain ?? entry.startLine,
                message: 'Missing required field: domain',
            });
        }

        // Required: rule (non-empty)
        if (!entry.fields.rule || entry.fields.rule.trim() === '') {
            errors.push({
                line: entry.fieldLines.rule ?? entry.startLine,
                message: 'Missing required field: rule',
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ── Internal parsing ─────────────────────────────────────

interface ParsedEntry {
    /** 1-based line number where the entry starts (the `- id:` line). */
    startLine: number;
    /** Field name -> value. */
    fields: Record<string, string>;
    /** Field name -> 1-based line number where it was found. */
    fieldLines: Record<string, number>;
}

/**
 * Parse eval entries from lines, starting after the `evals:` line.
 * Mirrors the config-manager's parseEvalYaml logic.
 */
function parseEntries(lines: string[], startIdx: number): ParsedEntry[] {
    const entries: ParsedEntry[] = [];
    let i = startIdx;

    while (i < lines.length) {
        // Look for '  - id:' to start a new entry
        const idMatch = lines[i].match(/^\s+-\s+id:\s*"?([^"]*)"?\s*$/);
        if (!idMatch) {
            i++;
            continue;
        }

        const entry: ParsedEntry = {
            startLine: i + 1, // 1-based
            fields: { id: idMatch[1] },
            fieldLines: { id: i + 1 },
        };
        i++;

        // Parse remaining fields of this entry
        while (i < lines.length) {
            const line = lines[i];

            // Next entry — stop
            if (line.match(/^\s+-\s+id:/)) { break; }

            // Scalar field: key: value or key: "value"
            const scalarMatch = line.match(/^\s{4,}(\w+):\s*"?([^"|]+)"?\s*$/);
            if (scalarMatch && !['positive', 'negative'].includes(scalarMatch[1])) {
                entry.fields[scalarMatch[1]] = scalarMatch[2].trim();
                entry.fieldLines[scalarMatch[1]] = i + 1;
                i++;
                continue;
            }

            // Block scalar field (key: |)
            const blockMatch = line.match(/^\s{4,}(\w+):\s*\|\s*$/);
            if (blockMatch) {
                const key = blockMatch[1];
                entry.fieldLines[key] = i + 1;
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
                entry.fields[key] = blockLines.join('\n').trim();
                continue;
            }

            // Skip examples and nested content
            if (line.match(/^\s{4,}(examples|positive|negative):/)) {
                i++;
                while (i < lines.length && (lines[i].match(/^\s{6,}/) || lines[i].trim() === '')) {
                    i++;
                }
                continue;
            }

            i++;
        }

        entries.push(entry);
    }

    return entries;
}
