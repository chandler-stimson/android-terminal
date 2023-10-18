import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
import { ConsumableWritableStream, DistributionStream, DuplexStreamFactory, PushReadableStream, pipeFrom, } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import { AdbCommand } from "./packet.js";
export class AdbDaemonSocketController {
    #dispatcher;
    localId;
    remoteId;
    localCreated;
    service;
    #duplex;
    #readable;
    #readableController;
    get readable() {
        return this.#readable;
    }
    #writePromise;
    writable;
    #closed = false;
    /**
     * Whether the socket is half-closed (i.e. the local side initiated the close).
     *
     * It's only used by dispatcher to avoid sending another `CLSE` packet to remote.
     */
    get closed() {
        return this.#closed;
    }
    #socket;
    get socket() {
        return this.#socket;
    }
    constructor(options) {
        this.#dispatcher = options.dispatcher;
        this.localId = options.localId;
        this.remoteId = options.remoteId;
        this.localCreated = options.localCreated;
        this.service = options.service;
        // Check this image to help you understand the stream graph
        // cspell: disable-next-line
        // https://www.plantuml.com/plantuml/png/TL0zoeGm4ErpYc3l5JxyS0yWM6mX5j4C6p4cxcJ25ejttuGX88ZftizxUKmJI275pGhXl0PP_UkfK_CAz5Z2hcWsW9Ny2fdU4C1f5aSchFVxA8vJjlTPRhqZzDQMRB7AklwJ0xXtX0ZSKH1h24ghoKAdGY23FhxC4nS2pDvxzIvxb-8THU0XlEQJ-ZB7SnXTAvc_LhOckhMdLBnbtndpb-SB7a8q2SRD_W00
        this.#duplex = new DuplexStreamFactory({
            close: async () => {
                this.#closed = true;
                await this.#dispatcher.sendPacket(AdbCommand.Close, this.localId, this.remoteId);
                // Don't `dispose` here, we need to wait for `CLSE` response packet.
                return false;
            },
            dispose: () => {
                // Error out the pending writes
                this.#writePromise?.reject(new Error("Socket closed"));
            },
        });
        this.#readable = this.#duplex.wrapReadable(new PushReadableStream((controller) => {
            this.#readableController = controller;
        }, {
            highWaterMark: options.highWaterMark ?? 16 * 1024,
            size(chunk) {
                return chunk.byteLength;
            },
        }));
        this.writable = pipeFrom(this.#duplex.createWritable(new ConsumableWritableStream({
            write: async (chunk) => {
                // Wait for an ack packet
                this.#writePromise = new PromiseResolver();
                await this.#dispatcher.sendPacket(AdbCommand.Write, this.localId, this.remoteId, chunk);
                await this.#writePromise.promise;
            },
        })), new DistributionStream(this.#dispatcher.options.maxPayloadSize));
        this.#socket = new AdbDaemonSocket(this);
    }
    async enqueue(data) {
        // Consumer may abort the `ReadableStream` to close the socket,
        // it's OK to throw away further packets in this case.
        if (this.#readableController.abortSignal.aborted) {
            return;
        }
        await this.#readableController.enqueue(data);
    }
    ack() {
        this.#writePromise?.resolve();
    }
    async close() {
        await this.#duplex.close();
    }
    dispose() {
        return this.#duplex.dispose();
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
