import { HarnessAdapter } from './types.js';

/**
 * Registry of harness adapters.
 *
 * Allows registration of multiple adapters and selection by availability or name.
 * The first available adapter is the default when no specific harness is requested.
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
}
