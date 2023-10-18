import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
import { ConsumableTransformStream, ConsumableWritableStream, PushReadableStream, StructDeserializeStream, WritableStream, pipeFrom, } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import Struct, { placeholder } from "/data/window/resources/@yume-chan/struct/esm/index.js";
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
class StdinSerializeStream extends ConsumableTransformStream {
    constructor() {
        super({
            async transform(chunk, controller) {
                await controller.enqueue({
                    id: AdbShellProtocolId.Stdin,
                    data: chunk,
                });
            },
            flush() {
                // TODO: AdbShellSubprocessProtocol: support closing stdin
            },
        });
    }
}
class MultiplexStream {
    #readable;
    #readableController;
    get readable() {
        return this.#readable;
    }
    #activeCount = 0;
    constructor() {
        this.#readable = new PushReadableStream((controller) => {
            this.#readableController = controller;
        });
    }
    createWriteable() {
        return new WritableStream({
            start: () => {
                this.#activeCount += 1;
            },
            write: async (chunk) => {
                await this.#readableController.enqueue(chunk);
            },
            abort: () => {
                this.#activeCount -= 1;
                if (this.#activeCount === 0) {
                    this.#readableController.close();
                }
            },
            close: () => {
                this.#activeCount -= 1;
                if (this.#activeCount === 0) {
                    this.#readableController.close();
                }
            },
        });
    }
}
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
        return adb.supportsFeature(AdbFeature.ShellV2);
    }
    static async pty(adb, command) {
        // TODO: AdbShellSubprocessProtocol: Support setting `XTERM` environment variable
        return new AdbSubprocessShellProtocol(await adb.createSocket(`shell,v2,pty:${command}`));
    }
    static async raw(adb, command) {
        return new AdbSubprocessShellProtocol(await adb.createSocket(`shell,v2,raw:${command}`));
    }
    #socket;
    #socketWriter;
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
        // Check this image to help you understand the stream graph
        // cspell: disable-next-line
        // https://www.plantuml.com/plantuml/png/bL91QiCm4Bpx5SAdv90lb1JISmiw5XzaQKf5PIkiLZIqzEyLSg8ks13gYtOykpFhiOw93N6UGjVDqK7rZsxKqNw0U_NTgVAy4empOy2mm4_olC0VEVEE47GUpnGjKdgXoD76q4GIEpyFhOwP_m28hW0NNzxNUig1_JdW0bA7muFIJDco1daJ_1SAX9bgvoPJPyIkSekhNYctvIGXrCH6tIsPL5fs-s6J5yc9BpWXhKtNdF2LgVYPGM_6GlMwfhWUsIt4lbScANrwlgVVUifPSVi__t44qStnwPvZwobdSmHHlL57p2vFuHS0
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
                        await stdoutController.enqueue(chunk.data);
                        break;
                    case AdbShellProtocolId.Stderr:
                        await stderrController.enqueue(chunk.data);
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
        const multiplexer = new MultiplexStream();
        void multiplexer.readable
            .pipeThrough(new ConsumableTransformStream({
            async transform(chunk, controller) {
                await controller.enqueue(AdbShellProtocolPacket.serialize(chunk));
            },
        }))
            .pipeTo(socket.writable);
        this.#stdin = pipeFrom(multiplexer.createWriteable(), new StdinSerializeStream());
        this.#socketWriter = multiplexer.createWriteable().getWriter();
    }
    async resize(rows, cols) {
        await ConsumableWritableStream.write(this.#socketWriter, {
            id: AdbShellProtocolId.WindowSizeChange,
            data: encodeUtf8(
            // The "correct" format is `${rows}x${cols},${x_pixels}x${y_pixels}`
            // However, according to https://linux.die.net/man/4/tty_ioctl
            // `x_pixels` and `y_pixels` are unused, so always sending `0` should be fine.
            `${rows}x${cols},0x0\0`),
        });
    }
    kill() {
        return this.#socket.close();
    }
}
//# sourceMappingURL=shell.js.map
