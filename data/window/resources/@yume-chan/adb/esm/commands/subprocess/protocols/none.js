import { ReadableStream } from "@yume-chan/stream-extra";
import { unreachable } from "../../../utils/index.js";
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
    // Legacy shell forwards all data to stdin.
    get stdin() {
        return this.#socket.writable;
    }
    /**
     * Legacy shell mixes stdout and stderr.
     */
    get stdout() {
        return this.#socket.readable;
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
        this.#stderr = new ReadableStream({
            start: (controller) => {
                this.#socket.closed
                    .then(() => controller.close())
                    .catch(unreachable);
            },
        });
        this.#exit = socket.closed.then(() => 0);
    }
    resize() {
        // Not supported, but don't throw.
    }
    async kill() {
        await this.#socket.close();
    }
}
//# sourceMappingURL=none.js.map