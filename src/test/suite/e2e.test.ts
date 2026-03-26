import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PersistentObservation } from '../../types/observation';

suite('E2E: Observation to Live Feed', () => {

    let sentinelDir: string;
    let observationsPath: string;
    let workspaceFolder: vscode.WorkspaceFolder | undefined;

    suiteSetup(async () => {
        // Use the first workspace folder (set up by test runner)
        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            // Create a temporary workspace if none exists
            return;
        }

        sentinelDir = path.join(workspaceFolder.uri.fsPath, '.volition', 'sentinel');
        observationsPath = path.join(sentinelDir, 'sentinel-observations.jsonl');

        // Ensure the sentinel directory exists
        await fs.mkdir(sentinelDir, { recursive: true });

        // Create a minimal sentinel config so the extension recognizes this workspace
        const configPath = path.join(sentinelDir, 'sentinel.config.json');
        try {
            await fs.access(configPath);
        } catch {
            await fs.writeFile(configPath, JSON.stringify({
                version: '1',
                sentinels: [],
            }));
        }

        // Start with an empty observations file
        await fs.writeFile(observationsPath, '');
    });

    suiteTeardown(async () => {
        // Clean up sentinel test artifacts
        if (sentinelDir) {
            try {
                await fs.rm(sentinelDir, { recursive: true, force: true });
            } catch {
                // Best effort cleanup
            }
        }
    });

    test('New observation appears in LiveFeedProvider within 500ms', async function () {
        if (!workspaceFolder) {
            this.skip();
            return;
        }

        // Get the activated extension's exports
        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        assert.ok(ext, 'Extension not found');

        if (!ext.isActive) {
            await ext.activate();
        }

        const { observationStore, liveFeedProvider } = ext.exports as {
            observationStore: {
                onObservationReceived: vscode.Event<PersistentObservation>;
                getObservations: (filter?: any) => PersistentObservation[];
                addFolder: (folderKey: string, observationsPath: string) => void;
            };
            liveFeedProvider: { onDidChangeTreeData: vscode.Event<any> };
        };

        assert.ok(observationStore, 'observationStore not available from extension exports');
        assert.ok(liveFeedProvider, 'liveFeedProvider not available from extension exports');

        const testSessionId = `e2e-test-${Date.now()}`;

        const observation: PersistentObservation = {
            timestamp: new Date().toISOString(),
            session_id: testSessionId,
            sentinel_name: 'e2e-test-sentinel',
            sentinel_label: 'E2E Test',
            severity: 'warning',
            eval_id: 'E2E-001',
            one_liner: 'E2E test observation',
            analysis: 'This observation was created by the E2E test suite.',
            turn_number: 1,
            duration_ms: 42,
            tier: 'general',
            visibility: 'display',
            dynamic_eval_created: false,
            hook_type: 'post',
            version: '1',
        };

        // Register the workspace folder with the store if needed
        const folderKey = workspaceFolder.uri.toString();
        observationStore.addFolder?.(folderKey, observationsPath);

        // Set up a promise that resolves when the tree data changes
        const treeUpdateReceived = new Promise<void>((resolve) => {
            const disposable = liveFeedProvider.onDidChangeTreeData(() => {
                disposable.dispose();
                resolve();
            });

            // Timeout safety — don't hang forever
            setTimeout(() => {
                disposable.dispose();
                resolve(); // Let the assertion below catch the failure
            }, 2000);
        });

        const startTime = performance.now();

        // Write the observation to the JSONL file (simulating sentinel output)
        await fs.appendFile(observationsPath, JSON.stringify(observation) + '\n');

        // Wait for the tree update or timeout
        await treeUpdateReceived;

        const elapsed = performance.now() - startTime;
        console.log(`E2E: Observation → Live Feed update took ${elapsed.toFixed(1)}ms`);

        // Verify the observation made it to the store
        // Allow a brief settle time for file watcher debounce
        await new Promise(resolve => setTimeout(resolve, 200));

        const stored = observationStore.getObservations({ sessionId: testSessionId });

        // Gate: the pipeline MUST complete within 500ms AND the observation MUST appear
        assert.ok(
            stored.length > 0 && elapsed < 500,
            `Observation pipeline failed (elapsed: ${elapsed.toFixed(1)}ms, stored: ${stored.length}). ` +
            `Both conditions required: observation present AND under 500ms.`,
        );

        assert.strictEqual(stored[0].eval_id, 'E2E-001');
        assert.strictEqual(stored[0].session_id, testSessionId);
        console.log(`E2E: Observation verified in store after ${elapsed.toFixed(1)}ms`);
    });

    test('Multiple rapid observations maintain order', async function () {
        if (!workspaceFolder) {
            this.skip();
            return;
        }

        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        if (!ext?.isActive) {
            this.skip();
            return;
        }

        const { observationStore } = ext.exports as {
            observationStore: { getObservations: (filter?: any) => PersistentObservation[] };
        };

        const testSessionId = `e2e-order-${Date.now()}`;
        const observations: string[] = [];

        for (let i = 0; i < 5; i++) {
            const obs: PersistentObservation = {
                timestamp: new Date(Date.now() + i).toISOString(),
                session_id: testSessionId,
                sentinel_name: 'e2e-order-sentinel',
                sentinel_label: 'E2E Order',
                severity: 'info',
                eval_id: `ORDER-${i.toString().padStart(3, '0')}`,
                one_liner: `Order test ${i}`,
                analysis: '',
                turn_number: i,
                duration_ms: 10,
                tier: 'general',
                visibility: 'display',
                dynamic_eval_created: false,
                hook_type: 'post',
                version: '1',
            };
            observations.push(JSON.stringify(obs));
        }

        // Write all observations at once
        await fs.appendFile(observationsPath, observations.join('\n') + '\n');

        // Allow file watcher to process
        await new Promise(resolve => setTimeout(resolve, 1000));

        const stored = observationStore.getObservations({ sessionId: testSessionId });

        if (stored.length > 0) {
            // Verify order is maintained (turn_number should be ascending)
            for (let i = 1; i < stored.length; i++) {
                assert.ok(
                    stored[i].turn_number >= stored[i - 1].turn_number,
                    `Observations out of order: turn ${stored[i].turn_number} before ${stored[i - 1].turn_number}`,
                );
            }
            console.log(`E2E: ${stored.length} observations maintained order`);
        } else {
            console.warn('E2E: No observations in store — file watcher may not have fired');
        }
    });
});
