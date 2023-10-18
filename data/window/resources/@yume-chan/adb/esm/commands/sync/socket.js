import { BufferCombiner, BufferedReadableStream, ConsumableWritableStream, } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import { AutoResetEvent } from "../../utils/index.js";
export class AdbSyncSocketLocked {
    #writer;
    #readable;
    #socketLock;
    #writeLock = new AutoResetEvent();
    #combiner;
    get position() {
        return this.#readable.position;
    }
    constructor(writer, readable, bufferSize, lock) {
        this.#writer = writer;
        this.#readable = readable;
        this.#socketLock = lock;
        this.#combiner = new BufferCombiner(bufferSize);
    }
    async #writeInnerStream(buffer) {
        await ConsumableWritableStream.write(this.#writer, buffer);
    }
    async flush() {
        try {
            await this.#writeLock.wait();
            const buffer = this.#combiner.flush();
            if (buffer) {
                await this.#writeInnerStream(buffer);
            }
        }
        finally {
            this.#writeLock.notifyOne();
        }
    }
    async write(data) {
        try {
            await this.#writeLock.wait();
            for (const buffer of this.#combiner.push(data)) {
                await this.#writeInnerStream(buffer);
            }
        }
        finally {
            this.#writeLock.notifyOne();
        }
    }
    async readExactly(length) {
        await this.flush();
        return await this.#readable.readExactly(length);
    }
    release() {
        this.#combiner.flush();
        this.#socketLock.notifyOne();
    }
}
export class AdbSyncSocket {
    #lock = new AutoResetEvent();
    #socket;
    #locked;
    constructor(socket, bufferSize) {
        this.#socket = socket;
        this.#locked = new AdbSyncSocketLocked(socket.writable.getWriter(), new BufferedReadableStream(socket.readable), bufferSize, this.#lock);
    }
    async lock() {
        await this.#lock.wait();
        return this.#locked;
    }
    async close() {
        await this.#socket.close();
    }
}
//# sourceMappingURL=socket.js.map
