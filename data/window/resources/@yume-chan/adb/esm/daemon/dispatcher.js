import { AsyncOperationManager, PromiseResolver, delay, } from "@yume-chan/async";
import { getUint32LittleEndian, setUint32LittleEndian, } from "@yume-chan/no-data-view";
import { AbortController, Consumable, WritableStream, } from "@yume-chan/stream-extra";
import { EMPTY_UINT8_ARRAY, decodeUtf8, encodeUtf8 } from "@yume-chan/struct";
import { AdbCommand, calculateChecksum } from "./packet.js";
import { AdbDaemonSocketController } from "./socket.js";
/**
 * The dispatcher is the "dumb" part of the connection handling logic.
 *
 * Except some options to change some minor behaviors,
 * its only job is forwarding packets between authenticated underlying streams
 * and abstracted socket objects.
 *
 * The `Adb` class is responsible for doing the authentication,
 * negotiating the options, and has shortcuts to high-level services.
 */
export class AdbPacketDispatcher {
    // ADB socket id starts from 1
    // (0 means open failed)
    #initializers = new AsyncOperationManager(1);
    /**
     * Socket local ID to the socket controller.
     */
    #sockets = new Map();
    #writer;
    options;
    #closed = false;
    #disconnected = new PromiseResolver();
    get disconnected() {
        return this.#disconnected.promise;
    }
    #incomingSocketHandlers = new Map();
    #readAbortController = new AbortController();
    constructor(connection, options) {
        this.options = options;
        // Don't allow negative values in dispatcher
        if (this.options.initialDelayedAckBytes < 0) {
            this.options.initialDelayedAckBytes = 0;
        }
        connection.readable
            .pipeTo(new WritableStream({
            write: async (packet) => {
                switch (packet.command) {
                    case AdbCommand.Close:
                        await this.#handleClose(packet);
                        break;
                    case AdbCommand.Okay:
                        this.#handleOkay(packet);
                        break;
                    case AdbCommand.Open:
                        await this.#handleOpen(packet);
                        break;
                    case AdbCommand.Write:
                        await this.#handleWrite(packet);
                        break;
                    default:
                        // Junk data may only appear in the authentication phase,
                        // since the dispatcher only works after authentication,
                        // all packets should have a valid command.
                        // (although it's possible that Adb added new commands in the future)
                        throw new Error(`Unknown command: ${packet.command.toString(16)}`);
                }
            },
        }), {
            preventCancel: options.preserveConnection ?? false,
            signal: this.#readAbortController.signal,
        })
            .then(() => {
            this.#dispose();
        }, (e) => {
            if (!this.#closed) {
                this.#disconnected.reject(e);
            }
            this.#dispose();
        });
        this.#writer = connection.writable.getWriter();
    }
    async #handleClose(packet) {
        // If the socket is still pending
        if (packet.arg0 === 0 &&
            this.#initializers.reject(packet.arg1, new Error("Socket open failed"))) {
            // Device failed to create the socket
            // (unknown service string, failed to execute command, etc.)
            // it doesn't break the connection,
            // so only reject the socket creation promise,
            // don't throw an error here.
            return;
        }
        // From https://android.googlesource.com/platform/packages/modules/adb/+/65d18e2c1cc48b585811954892311b28a4c3d188/adb.cpp#459
        /* According to protocol.txt, p->msg.arg0 might be 0 to indicate
         * a failed OPEN only. However, due to a bug in previous ADB
         * versions, CLOSE(0, remote-id, "") was also used for normal
         * CLOSE() operations.
         */
        // Ignore `arg0` and search for the socket
        const socket = this.#sockets.get(packet.arg1);
        if (socket) {
            await socket.close();
            socket.dispose();
            this.#sockets.delete(packet.arg1);
            return;
        }
        // TODO: adb: is double closing an socket a catastrophic error?
        // If the client sends two `CLSE` packets for one socket,
        // the device may also respond with two `CLSE` packets.
    }
    #handleOkay(packet) {
        let ackBytes;
        if (this.options.initialDelayedAckBytes !== 0) {
            if (packet.payload.length !== 4) {
                throw new Error("Invalid OKAY packet. Payload size should be 4");
            }
            ackBytes = getUint32LittleEndian(packet.payload, 0);
        }
        else {
            if (packet.payload.length !== 0) {
                throw new Error("Invalid OKAY packet. Payload size should be 0");
            }
            ackBytes = Infinity;
        }
        if (this.#initializers.resolve(packet.arg1, {
            remoteId: packet.arg0,
            availableWriteBytes: ackBytes,
        })) {
            // Device successfully created the socket
            return;
        }
        const socket = this.#sockets.get(packet.arg1);
        if (socket) {
            // When delayed ack is enabled, `ackBytes` is a positive number represents
            // how many bytes the device has received from this socket.
            // When delayed ack is disabled, `ackBytes` is always `Infinity` represents
            // the device has received last `WRTE` packet from the socket.
            socket.ack(ackBytes);
            return;
        }
        // Maybe the device is responding to a packet of last connection
        // Tell the device to close the socket
        void this.sendPacket(AdbCommand.Close, packet.arg1, packet.arg0, EMPTY_UINT8_ARRAY);
    }
    #sendOkay(localId, remoteId, ackBytes) {
        let payload;
        if (this.options.initialDelayedAckBytes !== 0) {
            // TODO: try reusing this buffer to reduce memory allocation
            // However, that requires blocking reentrance of `sendOkay`, which might be more expensive
            payload = new Uint8Array(4);
            setUint32LittleEndian(payload, 0, ackBytes);
        }
        else {
            payload = EMPTY_UINT8_ARRAY;
        }
        return this.sendPacket(AdbCommand.Okay, localId, remoteId, payload);
    }
    async #handleOpen(packet) {
        // Allocate a local ID for the socket from `#initializers`.
        // `AsyncOperationManager` doesn't directly support returning the next ID,
        // so use `add` + `resolve` to simulate this
        const [localId] = this.#initializers.add();
        this.#initializers.resolve(localId, undefined);
        const remoteId = packet.arg0;
        let availableWriteBytes = packet.arg1;
        let service = decodeUtf8(packet.payload);
        // ADB Daemon still adds a null character to the service string
        if (service.endsWith("\0")) {
            service = service.substring(0, service.length - 1);
        }
        // Check remote delayed ack enablement is consistent with local
        if (this.options.initialDelayedAckBytes === 0) {
            if (availableWriteBytes !== 0) {
                throw new Error("Invalid OPEN packet. arg1 should be 0");
            }
            availableWriteBytes = Infinity;
        }
        else {
            if (availableWriteBytes === 0) {
                throw new Error("Invalid OPEN packet. arg1 should be greater than 0");
            }
        }
        const handler = this.#incomingSocketHandlers.get(service);
        if (!handler) {
            await this.sendPacket(AdbCommand.Close, 0, remoteId, EMPTY_UINT8_ARRAY);
            return;
        }
        const controller = new AdbDaemonSocketController({
            dispatcher: this,
            localId,
            remoteId,
            localCreated: false,
            service,
            availableWriteBytes,
        });
        try {
            await handler(controller.socket);
            this.#sockets.set(localId, controller);
            await this.#sendOkay(localId, remoteId, this.options.initialDelayedAckBytes);
        }
        catch (e) {
            await this.sendPacket(AdbCommand.Close, 0, remoteId, EMPTY_UINT8_ARRAY);
        }
    }
    async #handleWrite(packet) {
        const socket = this.#sockets.get(packet.arg1);
        if (!socket) {
            throw new Error(`Unknown local socket id: ${packet.arg1}`);
        }
        let handled = false;
        const promises = [
            (async () => {
                await socket.enqueue(packet.payload);
                await this.#sendOkay(packet.arg1, packet.arg0, packet.payload.length);
                handled = true;
            })(),
        ];
        if (this.options.readTimeLimit) {
            promises.push((async () => {
                await delay(this.options.readTimeLimit);
                if (!handled) {
                    throw new Error(`readable of \`${socket.service}\` has stalled for ${this.options.readTimeLimit} milliseconds`);
                }
            })());
        }
        await Promise.race(promises);
    }
    async createSocket(service) {
        if (this.options.appendNullToServiceString) {
            service += "\0";
        }
        const [localId, initializer] = this.#initializers.add();
        await this.sendPacket(AdbCommand.Open, localId, this.options.initialDelayedAckBytes, service);
        // Fulfilled by `handleOkay`
        const { remoteId, availableWriteBytes } = await initializer;
        const controller = new AdbDaemonSocketController({
            dispatcher: this,
            localId,
            remoteId,
            localCreated: true,
            service,
            availableWriteBytes,
        });
        this.#sockets.set(localId, controller);
        return controller.socket;
    }
    addReverseTunnel(service, handler) {
        this.#incomingSocketHandlers.set(service, handler);
    }
    removeReverseTunnel(address) {
        this.#incomingSocketHandlers.delete(address);
    }
    clearReverseTunnels() {
        this.#incomingSocketHandlers.clear();
    }
    async sendPacket(command, arg0, arg1, 
    // PERF: It's slightly faster to not use default parameter values
    payload) {
        if (typeof payload === "string") {
            payload = encodeUtf8(payload);
        }
        if (payload.length > this.options.maxPayloadSize) {
            throw new TypeError("payload too large");
        }
        await Consumable.WritableStream.write(this.#writer, {
            command,
            arg0,
            arg1,
            payload,
            checksum: this.options.calculateChecksum
                ? calculateChecksum(payload)
                : 0,
            magic: command ^ 0xffffffff,
        });
    }
    async close() {
        // Send `CLSE` packets for all sockets
        await Promise.all(Array.from(this.#sockets.values(), (socket) => socket.close()));
        // Stop receiving
        // It's possible that we haven't received all `CLSE` confirm packets,
        // but it doesn't matter, the next connection can cope with them.
        this.#closed = true;
        this.#readAbortController.abort();
        if (this.options.preserveConnection) {
            this.#writer.releaseLock();
        }
        else {
            await this.#writer.close();
        }
        // `pipe().then()` will call `dispose`
    }
    #dispose() {
        for (const socket of this.#sockets.values()) {
            socket.dispose();
        }
        this.#disconnected.resolve();
    }
}
//# sourceMappingURL=dispatcher.js.map