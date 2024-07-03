import { PromiseResolver } from "@yume-chan/async";
import { MaybeConsumable, PushReadableStream, StructDeserializeStream, WritableStream, } from "@yume-chan/stream-extra";
import Struct, { placeholder } from "@yume-chan/struct";
import { AdbFeature } from "../../../features.js";
import { encodeUtf8 } from "../../../utils/index.js";
export var AdbShellProtocolId;
(function (AdbShellProtocolId) {
    AdbShellProtocolId[AdbShellProtocolId["Stdin"] = 0] = "Stdin";
    AdbShellProtocolId[AdbShellProtocolId["Stdout"] = 1] = "Stdout";
    AdbShellProtocolId[AdbShellProtocolId["Stderr"] = 2] = "Stderr";
    AdbShellProtocolId[AdbShellProtocolId["Exit"] = 3] = "Exit";
    AdbShellProtocolId[AdbShellProtocolId["CloseStdin"] = 4] = "CloseStdin";
    AdbShellProtocolId[AdbShellProtocolId["WindowSizeChange"] = 5] = "WindowSizeChange";
})(AdbShellProtocolId || (AdbShellProtocolId = {}));
// This packet format is used in both direction.
const AdbShellProtocolPacket = new Struct({ littleEndian: true })
    .uint8("id", placeholder())
    .uint32("length")
    .uint8Array("data", { lengthField: "length" });
/**
 * Shell v2 a.k.a Shell Protocol
 *
 * Features:
 * * `stderr`: Yes
 * * `exit` exit code: Yes
 * * `resize`: Yes
 */
export class AdbSubprocessShellProtocol {
    static isSupported(adb) {
        return adb.canUseFeature(AdbFeature.ShellV2);
    }
    static async pty(adb, command) {
        // TODO: AdbShellSubprocessProtocol: Support setting `XTERM` environment variable
        return new AdbSubprocessShellProtocol(await adb.createSocket(`shell,v2,pty:${command}`));
    }
    static async raw(adb, command) {
        return new AdbSubprocessShellProtocol(await adb.createSocket(`shell,v2,raw:${command}`));
    }
    #socket;
    #writer;
    #stdin;
    get stdin() {
        return this.#stdin;
    }
    #stdout;
    get stdout() {
        return this.#stdout;
    }
    #stderr;
    get stderr() {
        return this.#stderr;
    }
    #exit = new PromiseResolver();
    get exit() {
        return this.#exit.promise;
    }
    constructor(socket) {
        this.#socket = socket;
        let stdoutController;
        let stderrController;
        this.#stdout = new PushReadableStream((controller) => {
            stdoutController = controller;
        });
        this.#stderr = new PushReadableStream((controller) => {
            stderrController = controller;
        });
        socket.readable
            .pipeThrough(new StructDeserializeStream(AdbShellProtocolPacket))
            .pipeTo(new WritableStream({
            write: async (chunk) => {
                switch (chunk.id) {
                    case AdbShellProtocolId.Exit:
                        this.#exit.resolve(chunk.data[0]);
                        break;
                    case AdbShellProtocolId.Stdout:
                        if (!stdoutController.abortSignal.aborted) {
                            await stdoutController.enqueue(chunk.data);
                        }
                        break;
                    case AdbShellProtocolId.Stderr:
                        if (!stderrController.abortSignal.aborted) {
                            await stderrController.enqueue(chunk.data);
                        }
                        break;
                }
            },
        }))
            .then(() => {
            stdoutController.close();
            stderrController.close();
            // If `#exit` has already resolved, this will be a no-op
            this.#exit.reject(new Error("Socket ended without exit message"));
        }, (e) => {
            stdoutController.error(e);
            stderrController.error(e);
            // If `#exit` has already resolved, this will be a no-op
            this.#exit.reject(e);
        });
        this.#writer = this.#socket.writable.getWriter();
        this.#stdin = new MaybeConsumable.WritableStream({
            write: async (chunk) => {
                await this.#writer.write(AdbShellProtocolPacket.serialize({
                    id: AdbShellProtocolId.Stdin,
                    data: chunk,
                }));
            },
        });
    }
    async resize(rows, cols) {
        await this.#writer.write(AdbShellProtocolPacket.serialize({
            id: AdbShellProtocolId.WindowSizeChange,
            // The "correct" format is `${rows}x${cols},${x_pixels}x${y_pixels}`
            // However, according to https://linux.die.net/man/4/tty_ioctl
            // `x_pixels` and `y_pixels` are unused, so always sending `0` should be fine.
            data: encodeUtf8(`${rows}x${cols},0x0\0`),
        }));
    }
    kill() {
        return this.#socket.close();
    }
}
//# sourceMappingURL=shell.js.map