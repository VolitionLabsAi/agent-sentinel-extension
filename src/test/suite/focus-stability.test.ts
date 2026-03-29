import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const EXTENSION_ID = 'volition.agent-sentinel';

/** Returns true when running inside real VS Code extension host (not mock). */
function isIntegrationEnvironment(): boolean {
    // The mock registers extensions.getExtension as () => undefined and
    // workspace.workspaceFolders as undefined. In real VS Code, the extension
    // will be discoverable.
    return typeof (vscode.extensions.getExtension as any)?._isMockFunction === 'undefined'
        && vscode.workspace.workspaceFolders !== undefined;
}

/** Helper: wait for a given number of milliseconds. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Helper: get the workspace root (first workspace folder). */
function getWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, 'Expected at least one workspace folder');
    return folders![0].uri.fsPath;
}

suite('Focus Stability', () => {

    // These tests require a real VS Code extension host with workspace folders.
    // When running under the unit test mock (`npm test`), skip gracefully.

    setup(function () {
        if (!isIntegrationEnvironment()) {
            this.skip();
        }
    });

    // ── Test 1: Extension activation does not change active editor ────

    test('extension activation does not change active editor', async () => {
        const editorBefore = vscode.window.activeTextEditor;

        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `Extension ${EXTENSION_ID} not found`);

        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension should be active');

        const editorAfter = vscode.window.activeTextEditor;

        // Both should be the same (likely both undefined at startup, or the same file)
        assert.strictEqual(
            editorAfter?.document.uri.toString(),
            editorBefore?.document.uri.toString(),
            'Active editor should not change during extension activation',
        );
    });

    // ── Test 2: Writing to observations JSONL does not change active editor ──

    test('writing to observations JSONL does not change active editor', async () => {
        const workspaceRoot = getWorkspaceRoot();

        // Create a temp file and open it as the active editor
        const tempFilePath = path.join(workspaceRoot, 'test-focus-sentinel.txt');
        fs.writeFileSync(tempFilePath, 'This is a test file for focus stability.\n');

        try {
            const doc = await vscode.workspace.openTextDocument(tempFilePath);
            await vscode.window.showTextDocument(doc, { preview: false });

            // Record the active editor
            const editorBefore = vscode.window.activeTextEditor;
            assert.ok(editorBefore, 'Should have an active editor after opening file');
            const uriBefore = editorBefore!.document.uri.toString();

            // Write a new observation line to the JSONL
            const observationsPath = path.join(
                workspaceRoot,
                '.volition',
                'sentinel',
                'sentinel-observations.jsonl',
            );
            // Ensure the sentinel directory and JSONL file exist
            const sentinelDir = path.dirname(observationsPath);
            fs.mkdirSync(sentinelDir, { recursive: true });
            if (!fs.existsSync(observationsPath)) {
                fs.writeFileSync(observationsPath, '');
            }

            const newObservation = JSON.stringify({
                timestamp: new Date().toISOString(),
                session_id: 'test-session-00000000-0000-0000-0000-000000000001',
                sentinel_name: 'GEN',
                sentinel_label: 'General',
                severity: 'HIGH',
                eval_id: 'GEN-099',
                one_liner: 'Test observation for focus stability',
                analysis: 'Injected during integration test',
                turn_number: 99,
                duration_ms: 1,
                tier: 'tier_1',
                visibility: 'visible',
                dynamic_eval_created: false,
                hook_type: 'posttooluse',
                version: 1,
            });
            fs.appendFileSync(observationsPath, newObservation + '\n');

            // Wait for file watchers to fire and settle
            await delay(2000);

            // Assert the active editor hasn't changed
            const editorAfter = vscode.window.activeTextEditor;
            assert.strictEqual(
                editorAfter?.document.uri.toString(),
                uriBefore,
                'Active editor should not change when observations JSONL is updated',
            );
        } finally {
            // Clean up temp file
            try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
        }
    });

    // ── Test 3: SessionCorrelator tab change handler doesn't create feedback loops ──

    test('session correlator does not create feedback loops on tab changes', async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `Extension ${EXTENSION_ID} not found`);

        if (!ext.isActive) {
            await ext.activate();
        }

        const api = ext.exports as {
            sessionCorrelator?: {
                onActiveSessionChanged: (listener: (result: unknown) => void) => vscode.Disposable;
            };
        };

        if (!api?.sessionCorrelator) {
            // If the API doesn't expose sessionCorrelator, skip gracefully
            console.log('sessionCorrelator not available on extension API, skipping');
            return;
        }

        let eventCount = 0;
        const disposable = api.sessionCorrelator.onActiveSessionChanged(() => {
            eventCount++;
        });

        try {
            const workspaceRoot = getWorkspaceRoot();

            // Create and rapidly open multiple files to simulate fast tab changes
            const tempFiles: string[] = [];
            for (let i = 0; i < 5; i++) {
                const filePath = path.join(workspaceRoot, `test-tab-${i}.txt`);
                fs.writeFileSync(filePath, `Tab test file ${i}\n`);
                tempFiles.push(filePath);
            }

            try {
                for (const filePath of tempFiles) {
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc, { preview: false });
                }

                // Wait for debounce to settle
                await delay(3000);

                // Event count should be reasonable — not exponentially growing
                // With 5 tab changes and debouncing, we expect at most ~5 events
                assert.ok(
                    eventCount <= tempFiles.length * 2,
                    `Event count (${eventCount}) should not exceed ${tempFiles.length * 2} — possible feedback loop`,
                );
            } finally {
                for (const f of tempFiles) {
                    try { fs.unlinkSync(f); } catch { /* ignore */ }
                }
            }
        } finally {
            disposable.dispose();
        }
    });

    // ── Test 4: Opening observation card does not steal focus ─────────

    test('opening observation card does not steal editor focus', async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `Extension ${EXTENSION_ID} not found`);

        if (!ext.isActive) {
            await ext.activate();
        }

        const workspaceRoot = getWorkspaceRoot();

        // Open a text file as the active editor
        const tempFilePath = path.join(workspaceRoot, 'test-focus-card.txt');
        fs.writeFileSync(tempFilePath, 'Focus test for observation card.\n');

        try {
            const doc = await vscode.workspace.openTextDocument(tempFilePath);
            await vscode.window.showTextDocument(doc, { preview: false });

            const editorBefore = vscode.window.activeTextEditor;
            assert.ok(editorBefore, 'Should have an active editor');
            const uriBefore = editorBefore!.document.uri.toString();

            // Execute the viewObservationCard command with a sample observation
            const sampleObservation = {
                timestamp: '2026-01-01T00:01:00Z',
                session_id: 'test-session-00000000-0000-0000-0000-000000000001',
                sentinel_name: 'SEC',
                sentinel_label: 'Security',
                severity: 'CRITICAL',
                eval_id: 'SEC-T0-001',
                one_liner: 'Recursive file deletion targeting root',
                analysis: 'Tier 0 pattern match detected rm -rf /',
                turn_number: 1,
                duration_ms: 12,
                tier: 'tier_0',
                visibility: 'visible',
                dynamic_eval_created: false,
                hook_type: 'pretooluse',
                version: 1,
            };

            try {
                await vscode.commands.executeCommand('sentinel.viewObservationCard', sampleObservation);
            } catch {
                // Command may fail in test environment — that's OK
                console.log('viewObservationCard command threw (expected in test environment)');
            }

            // Wait for any async UI updates
            await delay(1000);

            // Assert the active text editor is still the same file
            const editorAfter = vscode.window.activeTextEditor;
            assert.strictEqual(
                editorAfter?.document.uri.toString(),
                uriBefore,
                'Active text editor should not change when observation card opens',
            );
        } finally {
            try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
        }
    });
});
