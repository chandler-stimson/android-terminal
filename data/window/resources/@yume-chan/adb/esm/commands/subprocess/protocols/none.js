import { DuplexStreamFactory, ReadableStream } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
/**
 * The legacy shell
 *
 * Features:
 * * `stderr`: No
 * * `exit` exit code: No
 * * `resize`: No
 */
export class AdbSubprocessNoneProtocol {
    static isSupported() {
        return true;
    }
    static async pty(adb, command) {
        return new AdbSubprocessNoneProtocol(await adb.createSocket(`shell:${command}`));
    }
    static async raw(adb, command) {
        // `shell,raw:${command}` also triggers raw mode,
        // But is not supported on Android version <7.
        return new AdbSubprocessNoneProtocol(await adb.createSocket(`exec:${command}`));
    }
    #socket;
    #duplex;
    // Legacy shell forwards all data to stdin.
    get stdin() {
        return this.#socket.writable;
    }
    #stdout;
    /**
     * Legacy shell mixes stdout and stderr.
     */
    get stdout() {
        return this.#stdout;
    }
    #stderr;
    /**
     * `stderr` will always be empty.
     */
    get stderr() {
        return this.#stderr;
    }
    #exit;
    get exit() {
        return this.#exit;
    }
    constructor(socket) {
        this.#socket = socket;
        // Link `stdout`, `stderr` and `stdin` together,
        // so closing any of them will close the others.
        this.#duplex = new DuplexStreamFactory({
            close: async () => {
                await this.#socket.close();
            },
        });
        this.#stdout = this.#duplex.wrapReadable(this.#socket.readable);
        this.#stderr = this.#duplex.wrapReadable(new ReadableStream());
        this.#exit = this.#duplex.closed.then(() => 0);
    }
    resize() {
        // Not supported, but don't throw.
    }
    kill() {
        return this.#duplex.close();
    }
}
//# sourceMappingURL=none.js.map
