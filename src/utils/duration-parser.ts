/**
 * Parse a human-friendly duration string into hours.
 *
 * Supported formats:
 * - `30m` → 0.5 hours
 * - `12h` → 12 hours
 * - `3d` → 72 hours
 * - `2w` → 336 hours
 * - `1mo` → 720 hours (approximate, 30 days)
 * - Plain number → hours (backward compat)
 *
 * Returns null if the input cannot be parsed.
 */
export function parseDurationToHours(input: string): number | null {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) { return null; }

    // Plain number → hours
    const plainNum = Number(trimmed);
    if (!isNaN(plainNum) && plainNum >= 0) {
        return plainNum;
    }

    // Match number + unit
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(mo|m|h|d|w)$/);
    if (!match) { return null; }

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
        case 'm': return value / 60;
        case 'h': return value;
        case 'd': return value * 24;
        case 'w': return value * 7 * 24;
        case 'mo': return value * 30 * 24;
        default: return null;
    }
}
