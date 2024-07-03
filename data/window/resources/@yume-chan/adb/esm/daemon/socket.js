import { PromiseResolver } from "@yume-chan/async";
import { MaybeConsumable, PushReadableStream } from "@yume-chan/stream-extra";
import { EMPTY_UINT8_ARRAY } from "@yume-chan/struct";
import { AdbCommand } from "./packet.js";
export class AdbDaemonSocketController {
    #dispatcher;
    localId;
    remoteId;
    localCreated;
    service;
    #readable;
    #readableController;
    get readable() {
        return this.#readable;
    }
    #writableController;
    writable;
    #closed = false;
    #closedPromise = new PromiseResolver();
    get closed() {
        return this.#closedPromise.promise;
    }
    #socket;
    get socket() {
        return this.#socket;
    }
    #availableWriteBytesChanged;
    /**
     * When delayed ack is disabled, returns `Infinity` if the socket is ready to write
     * (exactly one packet can be written no matter how large it is), or `-1` if the socket
     * is waiting for ack message.
     *
     * When delayed ack is enabled, returns a non-negative finite number indicates the number of
     * bytes that can be written to the socket before waiting for ack message.
     */
    #availableWriteBytes = 0;
    constructor(options) {
        this.#dispatcher = options.dispatcher;
        this.localId = options.localId;
        this.remoteId = options.remoteId;
        this.localCreated = options.localCreated;
        this.service = options.service;
        this.#readable = new PushReadableStream((controller) => {
            this.#readableController = controller;
        });
        this.writable = new MaybeConsumable.WritableStream({
            start: (controller) => {
                this.#writableController = controller;
                controller.signal.addEventListener("abort", () => {
                    this.#availableWriteBytesChanged?.reject(controller.signal.reason);
                });
            },
            write: async (data) => {
                const size = data.length;
                const chunkSize = this.#dispatcher.options.maxPayloadSize;
                for (let start = 0, end = chunkSize; start < size; start = end, end += chunkSize) {
                    const chunk = data.subarray(start, end);
                    await this.#writeChunk(chunk);
                }
            },
        });
        this.#socket = new AdbDaemonSocket(this);
        this.#availableWriteBytes = options.availableWriteBytes;
    }
    async #writeChunk(data) {
        const length = data.length;
        while (this.#availableWriteBytes < length) {
            // Only one lock is required because Web Streams API guarantees
            // that `write` is not reentrant.
            const resolver = new PromiseResolver();
            this.#availableWriteBytesChanged = resolver;
            await resolver.promise;
        }
        if (this.#availableWriteBytes === Infinity) {
            this.#availableWriteBytes = -1;
        }
        else {
            this.#availableWriteBytes -= length;
        }
        await this.#dispatcher.sendPacket(AdbCommand.Write, this.localId, this.remoteId, data);
    }
    async enqueue(data) {
        // Consumers can `cancel` the `readable` if they are not interested in future data.
        // Throw away the data if that happens.
        if (this.#readableController.abortSignal.aborted) {
            return;
        }
        try {
            await this.#readableController.enqueue(data);
        }
        catch (e) {
            if (this.#readableController.abortSignal.aborted) {
                return;
            }
            throw e;
        }
    }
    ack(bytes) {
        this.#availableWriteBytes += bytes;
        this.#availableWriteBytesChanged?.resolve();
    }
    async close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#availableWriteBytesChanged?.reject(new Error("Socket closed"));
        try {
            this.#writableController.error(new Error("Socket closed"));
        }
        catch {
            // ignore
        }
        await this.#dispatcher.sendPacket(AdbCommand.Close, this.localId, this.remoteId, EMPTY_UINT8_ARRAY);
    }
    dispose() {
        try {
            this.#readableController.close();
        }
        catch {
            // ignore
        }
        this.#closedPromise.resolve();
    }
}
/**
 * A duplex stream representing a socket to ADB daemon.
 *
 * To close it, call either `socket.close()`,
 * `socket.readable.cancel()`, `socket.readable.getReader().cancel()`,
 * `socket.writable.abort()`, `socket.writable.getWriter().abort()`,
 * `socket.writable.close()` or `socket.writable.getWriter().close()`.
 */
export class AdbDaemonSocket {
    #controller;
    get localId() {
        return this.#controller.localId;
    }
    get remoteId() {
        return this.#controller.remoteId;
    }
    get localCreated() {
        return this.#controller.localCreated;
    }
    get service() {
        return this.#controller.service;
    }
    get readable() {
        return this.#controller.readable;
    }
    get writable() {
        return this.#controller.writable;
    }
    get closed() {
        return this.#controller.closed;
    }
    constructor(controller) {
        this.#controller = controller;
    }
    close() {
        return this.#controller.close();
    }
}
//# sourceMappingURL=socket.js.map