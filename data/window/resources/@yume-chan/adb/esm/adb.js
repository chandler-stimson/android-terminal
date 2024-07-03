import { ConcatStringStream, TextDecoderStream } from "@yume-chan/stream-extra";
import { AdbPower, AdbReverseCommand, AdbSubprocess, AdbSync, AdbTcpIpCommand, escapeArg, framebuffer, } from "./commands/index.js";
export class Adb {
    transport;
    get serial() {
        return this.transport.serial;
    }
    get maxPayloadSize() {
        return this.transport.maxPayloadSize;
    }
    get banner() {
        return this.transport.banner;
    }
    get disconnected() {
        return this.transport.disconnected;
    }
    get clientFeatures() {
        return this.transport.clientFeatures;
    }
    get deviceFeatures() {
        return this.banner.features;
    }
    subprocess;
    power;
    reverse;
    tcpip;
    constructor(transport) {
        this.transport = transport;
        this.subprocess = new AdbSubprocess(this);
        this.power = new AdbPower(this);
        this.reverse = new AdbReverseCommand(this);
        this.tcpip = new AdbTcpIpCommand(this);
    }
    canUseFeature(feature) {
        return (this.clientFeatures.includes(feature) &&
            this.deviceFeatures.includes(feature));
    }
    async createSocket(service) {
        return this.transport.connect(service);
    }
    async createSocketAndWait(service) {
        const socket = await this.createSocket(service);
        return await socket.readable
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new ConcatStringStream());
    }
    async getProp(key) {
        const stdout = await this.subprocess.spawnAndWaitLegacy([
            "getprop",
            key,
        ]);
        return stdout.trim();
    }
    async rm(filenames, options) {
        const args = ["rm"];
        if (options?.recursive) {
            args.push("-r");
        }
        if (options?.force) {
            args.push("-f");
        }
        if (Array.isArray(filenames)) {
            for (const filename of filenames) {
                args.push(escapeArg(filename));
            }
        }
        else {
            args.push(escapeArg(filenames));
        }
        // https://android.googlesource.com/platform/packages/modules/adb/+/1a0fb8846d4e6b671c8aa7f137a8c21d7b248716/client/adb_install.cpp#984
        args.push("</dev/null");
        const stdout = await this.subprocess.spawnAndWaitLegacy(args);
        return stdout;
    }
    async sync() {
        const socket = await this.createSocket("sync:");
        return new AdbSync(this, socket);
    }
    async framebuffer() {
        return framebuffer(this);
    }
    async close() {
        await this.transport.close();
    }
}
//# sourceMappingURL=adb.js.map