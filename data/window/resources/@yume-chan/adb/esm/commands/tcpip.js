import { AdbCommandBase } from "./base.js";
export class AdbTcpIpCommand extends AdbCommandBase {
    async setPort(port) {
        if (port <= 0) {
            throw new Error(`Invalid port ${port}`);
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