import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
import { AbortController } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
export class AdbServerTransport {
    #client;
    serial;
    transportId;
    maxPayloadSize = 1 * 1024 * 1024;
    banner;
    #closed = new PromiseResolver();
    #waitAbortController = new AbortController();
    disconnected;
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
        return await this.#client.connectDevice({
            transportId: this.transportId,
        }, service);
    }
    async addReverseTunnel(handler, address) {
        return await this.#client.connection.addReverseTunnel(handler, address);
    }
    async removeReverseTunnel(address) {
        await this.#client.connection.removeReverseTunnel(address);
    }
    async clearReverseTunnels() {
        await this.#client.connection.clearReverseTunnels();
    }
    close() {
        this.#closed.resolve();
        this.#waitAbortController.abort();
    }
}
//# sourceMappingURL=transport.js.map
