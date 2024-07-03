import { PromiseResolver } from "@yume-chan/async";
import { AbortController } from "@yume-chan/stream-extra";
import { AdbFeature } from "../features.js";
export const ADB_SERVER_DEFAULT_FEATURES = [
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
];
export class AdbServerTransport {
    #client;
    serial;
    transportId;
    maxPayloadSize = 1 * 1024 * 1024;
    banner;
    #closed = new PromiseResolver();
    #waitAbortController = new AbortController();
    disconnected;
    get clientFeatures() {
        // No need to get host features (features supported by ADB server)
        // Because we create all ADB packets ourselves
        return ADB_SERVER_DEFAULT_FEATURES;
    }
    constructor(client, serial, banner, transportId) {
        this.#client = client;
        this.serial = serial;
        this.banner = banner;
        this.transportId = transportId;
        this.disconnected = Promise.race([
            this.#closed.promise,
            client.waitFor({ transportId }, "disconnect", {
                signal: this.#waitAbortController.signal,
                unref: true,
            }),
        ]);
    }
    async connect(service) {
        return await this.#client.createDeviceConnection({
            transportId: this.transportId,
        }, service);
    }
    async addReverseTunnel(handler, address) {
        return await this.#client.connector.addReverseTunnel(handler, address);
    }
    async removeReverseTunnel(address) {
        await this.#client.connector.removeReverseTunnel(address);
    }
    async clearReverseTunnels() {
        await this.#client.connector.clearReverseTunnels();
    }
    close() {
        this.#closed.resolve();
        this.#waitAbortController.abort();
    }
}
//# sourceMappingURL=transport.js.map