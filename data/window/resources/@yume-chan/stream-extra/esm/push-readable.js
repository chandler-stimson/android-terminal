import { PromiseResolver } from "@yume-chan/async";
import { AbortController, ReadableStream } from "./stream.js";
export class PushReadableStream extends ReadableStream {
    #zeroHighWaterMarkAllowEnqueue = false;
    /**
     * Create a new `PushReadableStream` from a source.
     *
     * @param source If `source` returns a `Promise`, the stream will be closed
     * when the `Promise` is resolved, and be errored when the `Promise` is rejected.
     * @param strategy
     */
    constructor(source, strategy) {
        let waterMarkLow;
        const abortController = new AbortController();
        super({
            start: async (controller) => {
                await Promise.resolve();
                const result = source({
                    abortSignal: abortController.signal,
                    enqueue: async (chunk) => {
                        if (abortController.signal.aborted) {
                            // If the stream is already cancelled,
                            // throw immediately.
                            throw abortController.signal.reason;
                        }
                        if (controller.desiredSize === null) {
                            // `desiredSize` being `null` means the stream is in error state,
                            // `controller.enqueue` will throw an error for us.
                            controller.enqueue(chunk);
                            return;
                        }
                        if (this.#zeroHighWaterMarkAllowEnqueue) {
                            this.#zeroHighWaterMarkAllowEnqueue = false;
                            controller.enqueue(chunk);
                            return;
                        }
                        if (controller.desiredSize <= 0) {
                            waterMarkLow = new PromiseResolver();
                            await waterMarkLow.promise;
                        }
                        // `controller.enqueue` will throw error for us
                        // if the stream is already errored.
                        controller.enqueue(chunk);
                    },
                    close() {
                        controller.close();
                    },
                    error(e) {
                        controller.error(e);
                    },
                });
                if (result && "then" in result) {
                    result.then(() => {
                        try {
                            controller.close();
                        }
                        catch (e) {
                            // controller already closed
                        }
                    }, (e) => {
                        controller.error(e);
                    });
                }
            },
            pull: () => {
                if (waterMarkLow) {
                    waterMarkLow.resolve();
                    return;
                }
                if (strategy?.highWaterMark === 0) {
                    this.#zeroHighWaterMarkAllowEnqueue = true;
                }
            },
            cancel: (reason) => {
                abortController.abort(reason);
                waterMarkLow?.reject(reason);
            },
        }, strategy);
    }
}
//# sourceMappingURL=push-readable.js.map