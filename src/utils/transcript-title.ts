import * as fs from 'fs/promises';

/**
 * Head and tail buffer sizes for transcript title extraction.
 * Matches the Go core's approach: search the first 64KB, then the last 64KB
 * as a fallback for sessions where the title appears late in the transcript.
 */
const HEAD_BUFFER_SIZE = 64 * 1024; // 64KB
const TAIL_BUFFER_SIZE = 64 * 1024; // 64KB

/**
 * Extract a session title from a Claude Code transcript JSONL file.
 *
 * Checks title fields in priority order:
 *   customTitle (user-set) > title > aiTitle (auto-generated) > summary
 *
 * Strategy:
 *   1. Read first 64KB (head) and scan for title fields.
 *   2. If not found and the file is larger than the head buffer,
 *      read the last 64KB (tail) and scan again.
 *
 * Returns null if no title can be found.
 */
export async function extractTranscriptTitle(transcriptPath: string): Promise<string | null> {
    let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        fileHandle = await fs.open(transcriptPath, 'r');
        const stat = await fileHandle.stat();

        if (stat.size === 0) {
            return null;
        }

        // --- Head pass ---
        const headSize = Math.min(HEAD_BUFFER_SIZE, stat.size);
        const headBuffer = Buffer.alloc(headSize);
        const { bytesRead: headRead } = await fileHandle.read(headBuffer, 0, headSize, 0);
        const headChunk = headBuffer.toString('utf-8', 0, headRead);
        const headTitle = scanChunkForTitle(headChunk);
        if (headTitle) {
            return headTitle;
        }

        // --- Tail pass (only if the file is larger than the head buffer) ---
        if (stat.size > HEAD_BUFFER_SIZE) {
            const tailOffset = Math.max(0, stat.size - TAIL_BUFFER_SIZE);
            const tailSize = stat.size - tailOffset;
            const tailBuffer = Buffer.alloc(tailSize);
            const { bytesRead: tailRead } = await fileHandle.read(tailBuffer, 0, tailSize, tailOffset);
            const tailChunk = tailBuffer.toString('utf-8', 0, tailRead);

            // For tail buffer, skip first line (likely partial/truncated at the read boundary)
            const tailLines = tailChunk.split('\n');
            tailLines.shift(); // remove potentially truncated first line
            const tailTitle = scanChunkForTitle(tailLines.join('\n'));
            if (tailTitle) {
                return tailTitle;
            }
        }

        return null;
    } catch {
        // File doesn't exist or read error — not fatal
        return null;
    } finally {
        await fileHandle?.close();
    }
}

/**
 * Scan a text chunk (potentially partial JSONL lines) for title fields.
 * Skips the first and last lines since they may be incomplete due to buffer boundaries.
 */
function scanChunkForTitle(chunk: string): string | null {
    const lines = chunk.split('\n');

    // Skip the first line (may be incomplete at buffer start) and last line (may be incomplete at buffer end)
    const start = lines.length > 2 ? 1 : 0;
    const end = lines.length > 2 ? lines.length - 1 : lines.length;

    // Also try the first line from head (offset 0 is always a complete line start)
    const candidates = lines.length > 2
        ? [lines[0], ...lines.slice(start, end)]
        : lines;

    for (const line of candidates) {
        const trimmed = line.trim();
        if (!trimmed) { continue; }
        try {
            const entry = JSON.parse(trimmed) as Record<string, unknown>;
            // Check title fields in priority order
            if (typeof entry.customTitle === 'string' && entry.customTitle) {
                return entry.customTitle;
            }
            if (typeof entry.title === 'string' && entry.title) {
                return entry.title;
            }
            if (typeof entry.aiTitle === 'string' && entry.aiTitle) {
                return entry.aiTitle;
            }
            if (typeof entry.summary === 'string' && entry.summary) {
                return entry.summary;
            }
        } catch {
            // Malformed line — skip
        }
    }

    return null;
}
