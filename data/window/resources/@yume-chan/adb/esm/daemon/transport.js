import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
import { AbortController, ConsumableWritableStream, WritableStream, } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import { decodeUtf8, encodeUtf8 } from "/data/window/resources/@yume-chan/struct/esm/index.js";
import { AdbBanner } from "../banner.js";
import { AdbFeature } from "../features.js";
import { ADB_DEFAULT_AUTHENTICATORS, AdbAuthenticationProcessor, } from "./auth.js";
import { AdbPacketDispatcher } from "./dispatcher.js";
import { AdbCommand, calculateChecksum } from "./packet.js";
export const ADB_DAEMON_VERSION_OMIT_CHECKSUM = 0x01000001;
export class AdbDaemonTransport {
    /**
     * Authenticates the connection and creates an `AdbDaemonTransport` instance
     * that can be used by `Adb` class.
     *
     * If an authentication process failed, it's possible to call `authenticate` again
     * on the same connection. Because every time the device receives a `CNXN` packet,
     * it resets all internal state, and starts a new authentication process.
     */
    static async authenticate({ serial, connection, credentialStore, authenticators = ADB_DEFAULT_AUTHENTICATORS, preserveConnection, }) {
        // Initially, set to highest-supported version and payload size.
        let version = 0x01000001;
        // Android 4: 4K, Android 7: 256K, Android 9: 1M
        let maxPayloadSize = 1024 * 1024;
        const resolver = new PromiseResolver();
        const authProcessor = new AdbAuthenticationProcessor(authenticators, credentialStore);
        // Here is similar to `AdbPacketDispatcher`,
        // But the received packet types and send packet processing are different.
        const abortController = new AbortController();
        const pipe = connection.readable
            .pipeTo(new WritableStream({
            async write(packet) {
                switch (packet.command) {
                    case AdbCommand.Connect:
                        version = Math.min(version, packet.arg0);
                        maxPayloadSize = Math.min(maxPayloadSize, packet.arg1);
                        resolver.resolve(decodeUtf8(packet.payload));
                        break;
                    case AdbCommand.Auth: {
                        const response = await authProcessor.process(packet);
                        await sendPacket(response);
                        break;
                    }
                    default:
                        // Maybe the previous ADB client exited without reading all packets,
                        // so they are still waiting in OS internal buffer.
                        // Just ignore them.
                        // Because a `Connect` packet will reset the device,
                        // Eventually there will be `Connect` and `Auth` response packets.
                        break;
                }
            },
        }), {
            // Don't cancel the source ReadableStream on AbortSignal abort.
            preventCancel: true,
            signal: abortController.signal,
        })
            .then(() => {
            if (resolver.state === "running") {
                resolver.reject(new Error("Connection closed unexpectedly"));
            }
        }, (e) => {
            resolver.reject(e);
        });
        const writer = connection.writable.getWriter();
        async function sendPacket(init) {
            // Always send checksum in auth steps
            // Because we don't know if the device needs it or not.
            init.checksum = calculateChecksum(init.payload);
            init.magic = init.command ^ 0xffffffff;
            await ConsumableWritableStream.write(writer, init);
        }
        let banner;
        try {
            // https://android.googlesource.com/platform/packages/modules/adb/+/79010dc6d5ca7490c493df800d4421730f5466ca/transport.cpp#1252
            // There are some other feature constants, but some of them are only used by ADB server, not devices (daemons).
            const features = [
                AdbFeature.ShellV2,
                AdbFeature.Cmd,
                AdbFeature.StatV2,
                AdbFeature.ListV2,
                AdbFeature.FixedPushMkdir,
                "apex",
                AdbFeature.Abb,
                // only tells the client the symlink timestamp issue in `adb push --sync` has been fixed.
                // No special handling required.
                "fixed_push_symlink_timestamp",
                AdbFeature.AbbExec,
                "remount_shell",
                "track_app",
                AdbFeature.SendReceiveV2,
                "sendrecv_v2_brotli",
                "sendrecv_v2_lz4",
                "sendrecv_v2_zstd",
                "sendrecv_v2_dry_run_send",
            ].join(",");
            await sendPacket({
                command: AdbCommand.Connect,
                arg0: version,
                arg1: maxPayloadSize,
                // The terminating `;` is required in formal definition
                // But ADB daemon (all versions) can still work without it
                payload: encodeUtf8(`host::features=${features}`),
            });
            banner = await resolver.promise;
        }
        finally {
            // When failed, release locks on `connection` so the caller can try again.
            // When success, also release locks so `AdbPacketDispatcher` can use them.
            abortController.abort();
            writer.releaseLock();
            // Wait until pipe stops (`ReadableStream` lock released)
            await pipe;
        }
        return new AdbDaemonTransport({
            serial,
            connection,
            version,
            maxPayloadSize,
            banner,
            preserveConnection,
        });
    }
    #dispatcher;
    #serial;
    get serial() {
        return this.#serial;
    }
    #protocolVersion;
    get protocolVersion() {
        return this.#protocolVersion;
    }
    #maxPayloadSize;
    get maxPayloadSize() {
        return this.#maxPayloadSize;
    }
    #banner;
    get banner() {
        return this.#banner;
    }
    get disconnected() {
        return this.#dispatcher.disconnected;
    }
    constructor({ serial, connection, version, maxPayloadSize, banner, preserveConnection, }) {
        this.#serial = serial;
        this.#banner = AdbBanner.parse(banner);
        let calculateChecksum;
        let appendNullToServiceString;
        if (version >= ADB_DAEMON_VERSION_OMIT_CHECKSUM) {
            calculateChecksum = false;
            appendNullToServiceString = false;
        }
        else {
            calculateChecksum = true;
            appendNullToServiceString = true;
        }
        this.#dispatcher = new AdbPacketDispatcher(connection, {
            calculateChecksum,
            appendNullToServiceString,
            maxPayloadSize,
            preserveConnection,
        });
        this.#protocolVersion = version;
        this.#maxPayloadSize = maxPayloadSize;
    }
    connect(service) {
        return this.#dispatcher.createSocket(service);
    }
    addReverseTunnel(handler, address) {
        if (!address) {
            const id = Math.random().toString().substring(2);
            address = `localabstract:reverse_${id}`;
        }
        this.#dispatcher.addReverseTunnel(address, handler);
        return address;
    }
    removeReverseTunnel(address) {
        this.#dispatcher.removeReverseTunnel(address);
    }
    clearReverseTunnels() {
        this.#dispatcher.clearReverseTunnels();
    }
    close() {
        return this.#dispatcher.close();
    }
}
//# sourceMappingURL=transport.js.map
