import { AdbCommandBase } from "./base.js";
export class AdbTcpIpCommand extends AdbCommandBase {
    #parsePort(value) {
        if (!value || value === "0") {
            return undefined;
        }
        return Number.parseInt(value, 10);
    }
    async getListenAddresses() {
        const serviceListenAddresses = await this.adb.getProp("service.adb.listen_addrs");
        const servicePort = await this.adb.getProp("service.adb.tcp.port");
        const persistPort = await this.adb.getProp("persist.adb.tcp.port");
        return {
            serviceListenAddresses: serviceListenAddresses != ""
                ? serviceListenAddresses.split(",")
                : [],
            servicePort: this.#parsePort(servicePort),
            persistPort: this.#parsePort(persistPort),
        };
    }
    async setPort(port) {
        if (port <= 0) {
            throw new TypeError(`Invalid port ${port}`);
        }
        const output = await this.adb.createSocketAndWait(`tcpip:${port}`);
        if (output !== `restarting in TCP mode port: ${port}\n`) {
            throw new Error(output);
        }
        return output;
    }
    async disable() {
        const output = await this.adb.createSocketAndWait("usb:");
        if (output !== "restarting in USB mode\n") {
            throw new Error(output);
        }
        return output;
    }
}
//# sourceMappingURL=tcpip.js.map