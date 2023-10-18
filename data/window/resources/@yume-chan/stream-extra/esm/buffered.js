import { ExactReadableEndedError } from "/data/window/resources/@yume-chan/struct/esm/index.js";
import { PushReadableStream } from "./push-readable.js";
const NOOP = () => {
    // no-op
};
export class BufferedReadableStream {
    #buffered;
    #bufferedOffset = 0;
    #bufferedLength = 0;
    #position = 0;
    get position() {
        return this.#position;
    }
    stream;
    reader;
    constructor(stream) {
        this.stream = stream;
        this.reader = stream.getReader();
    }
    async #readSource() {
        const { done, value } = await this.reader.read();
        if (done) {
            throw new ExactReadableEndedError();
        }
        this.#position += value.byteLength;
        return value;
    }
    async #readAsync(length, initial) {
        let result;
        let index;
        if (initial) {
            result = new Uint8Array(length);
            result.set(initial);
            index = initial.byteLength;
            length -= initial.byteLength;
        }
        else {
            const array = await this.#readSource();
            if (array.byteLength === length) {
                return array;
            }
            if (array.byteLength > length) {
                this.#buffered = array;
                this.#bufferedOffset = length;
                this.#bufferedLength = array.byteLength - length;
                return array.subarray(0, length);
            }
            result = new Uint8Array(length);
            result.set(array);
            index = array.byteLength;
            length -= array.byteLength;
        }
        while (length > 0) {
            const array = await this.#readSource();
            if (array.byteLength === length) {
                result.set(array, index);
                return result;
            }
            if (array.byteLength > length) {
                this.#buffered = array;
                this.#bufferedOffset = length;
                this.#bufferedLength = array.byteLength - length;
                result.set(array.subarray(0, length), index);
                return result;
            }
            result.set(array, index);
            index += array.byteLength;
            length -= array.byteLength;
        }
        return result;
    }
    /**
     *
     * @param length
     * @returns
     */
    readExactly(length) {
        // PERF: Add a synchronous path for reading from internal buffer
        if (this.#buffered) {
            const array = this.#buffered;
            const offset = this.#bufferedOffset;
            if (this.#bufferedLength > length) {
                // PERF: `subarray` is slow
                // don't use it until absolutely necessary
                this.#bufferedOffset += length;
                this.#bufferedLength -= length;
                return array.subarray(offset, offset + length);
            }
            this.#buffered = undefined;
            this.#bufferedLength = 0;
            this.#bufferedOffset = 0;
            return this.#readAsync(length, array.subarray(offset));
        }
        return this.#readAsync(length);
    }
    /**
     * Return a readable stream with unconsumed data (if any) and
     * all data from the wrapped stream.
     * @returns A `ReadableStream`
     */
    release() {
        if (this.#bufferedLength > 0) {
            return new PushReadableStream(async (controller) => {
                // Put the remaining data back to the stream
                const buffered = this.#buffered.subarray(this.#bufferedOffset);
                await controller.enqueue(buffered);
                controller.abortSignal.addEventListener("abort", () => {
                    // NOOP: the reader might already be released
                    this.reader.cancel().catch(NOOP);
                });
                // Manually pipe the stream
                while (true) {
                    const { done, value } = await this.reader.read();
                    if (done) {
                        return;
                    }
                    else {
                        await controller.enqueue(value);
                    }
                }
            });
        }
        else {
            // Simply release the reader and return the stream
            this.reader.releaseLock();
            return this.stream;
        }
    }
    cancel(reason) {
        return this.reader.cancel(reason);
    }
}
//# sourceMappingURL=buffered.js.map
