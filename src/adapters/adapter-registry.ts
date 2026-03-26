import type * as vscode from 'vscode';
import { HarnessAdapter } from './types.js';

/**
 * Registry of harness adapters.
 *
 * Allows registration of multiple adapters and selection by availability or name.
 * The first available adapter is the default when no specific harness is requested.
 *
 * Also provides aggregate tab-detection across all registered adapters, so
 * consumers like SessionCorrelator don't need to iterate adapters themselves.
 */
export class HarnessAdapterRegistry {
    private readonly adapters: Map<string, HarnessAdapter> = new Map();

    /**
     * Register a harness adapter. Replaces any existing adapter with the same name.
     */
    register(adapter: HarnessAdapter): void {
        this.adapters.set(adapter.name, adapter);
    }

    /**
     * Returns the first available harness adapter, or undefined if none are available.
     */
    getAvailable(): HarnessAdapter | undefined {
        for (const adapter of this.adapters.values()) {
            if (adapter.isAvailable) {
                return adapter;
            }
        }
        return undefined;
    }

    /**
     * Returns a specific adapter by name, or undefined if not registered.
     */
    getByName(name: string): HarnessAdapter | undefined {
        return this.adapters.get(name);
    }

    /**
     * Returns all registered adapters.
     */
    getAll(): HarnessAdapter[] {
        return [...this.adapters.values()];
    }

    /**
     * Check whether a VS Code tab belongs to ANY registered harness.
     * Returns true if any adapter claims the tab.
     */
    isHarnessTab(tab: vscode.Tab): boolean {
        for (const adapter of this.adapters.values()) {
            if (adapter.capabilities.canDetectTabs && adapter.isHarnessTab(tab)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find the adapter that owns a given tab, or undefined if no adapter claims it.
     */
    getAdapterForTab(tab: vscode.Tab): HarnessAdapter | undefined {
        for (const adapter of this.adapters.values()) {
            if (adapter.capabilities.canDetectTabs && adapter.isHarnessTab(tab)) {
                return adapter;
            }
        }
        return undefined;
    }
}
