import { StructEmptyError } from "@yume-chan/struct";
import { BufferedReadableStream } from "./buffered.js";
import { PushReadableStream } from "./push-readable.js";
import { ReadableStream, WritableStream } from "./stream.js";
// TODO: BufferedTransformStream: find better implementation
export class BufferedTransformStream {
    #readable;
    get readable() {
        return this.#readable;
    }
    #writable;
    get writable() {
        return this.#writable;
    }
    constructor(transform) {
        // Convert incoming chunks to a `BufferedReadableStream`
        let sourceStreamController;
        const buffered = new BufferedReadableStream(new PushReadableStream((controller) => {
            sourceStreamController = controller;
        }));
        this.#readable = new ReadableStream({
            async pull(controller) {
                try {
                    const value = await transform(buffered);
                    controller.enqueue(value);
                }
                catch (e) {
                    // Treat `StructEmptyError` as a normal end.
                    // If the `transform` method doesn't have enough data to return a value,
                    // it should throw another error to indicate that.
                    if (e instanceof StructEmptyError) {
                        controller.close();
                        return;
                    }
                    throw e;
                }
            },
            cancel: (reason) => {
                // Propagate cancel to the source stream
                // So future writes will be rejected
                return buffered.cancel(reason);
            },
        });
        this.#writable = new WritableStream({
            async write(chunk) {
                await sourceStreamController.enqueue(chunk);
            },
            abort() {
                sourceStreamController.close();
            },
            close() {
                sourceStreamController.close();
            },
        });
    }
}
//# sourceMappingURL=buffered-transform.js.map