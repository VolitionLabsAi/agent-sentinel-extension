import { Disposable } from 'vscode';

/**
 * Generic debouncer that coalesces rapid calls into a single callback
 * invocation after the specified delay.
 */
export class Debouncer implements Disposable {
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly callback: () => void,
        private readonly delayMs: number,
    ) {}

    /** Reset the timer and schedule the callback after delayMs. */
    trigger(): void {
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.callback();
        }, this.delayMs);
    }

    dispose(): void {
        this.clearTimer();
    }

    private clearTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
