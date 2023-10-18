// cspell:ignore tport
import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
import { BufferedReadableStream, DuplexStreamFactory, UnwrapConsumableStream, WrapWritableStream, } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import { BigIntFieldType, SyncPromise, decodeUtf8, encodeUtf8, } from "/data/window/resources/@yume-chan/struct/esm/index.js";
import { AdbBanner } from "../banner.js";
import { NOOP, hexToNumber, numberToHex } from "../utils/index.js";
import { AdbServerTransport } from "./transport.js";
export class AdbServerClient {
    static VERSION = 41;
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    static readString(stream) {
        return SyncPromise.try(() => stream.readExactly(4))
            .then((buffer) => {
            const length = hexToNumber(buffer);
            return stream.readExactly(length);
        })
            .then((valueBuffer) => {
            return decodeUtf8(valueBuffer);
        })
            .valueOrPromise();
    }
    static async writeString(writer, value) {
        const valueBuffer = encodeUtf8(value);
        const buffer = new Uint8Array(4 + valueBuffer.length);
        buffer.set(numberToHex(valueBuffer.length));
        buffer.set(valueBuffer, 4);
        await writer.write(buffer);
    }
    static async readOkay(stream) {
        const response = decodeUtf8(await stream.readExactly(4));
        if (response === "OKAY") {
            return;
        }
        if (response === "FAIL") {
            const reason = await AdbServerClient.readString(stream);
            throw new Error(reason);
        }
        throw new Error(`Unexpected response: ${response}`);
    }
    async connect(request, options) {
        const connection = await this.connection.connect(options);
        const writer = connection.writable.getWriter();
        await AdbServerClient.writeString(writer, request);
        const readable = new BufferedReadableStream(connection.readable);
        try {
            // `raceSignal` throws if the signal is aborted,
            // so the `catch` block can close the connection.
            await raceSignal(() => AdbServerClient.readOkay(readable), options?.signal);
            writer.releaseLock();
            return {
                readable: readable.release(),
                writable: connection.writable,
            };
        }
        catch (e) {
            writer.close().catch(NOOP);
            readable.cancel().catch(NOOP);
            throw e;
        }
    }
    async getVersion() {
        const connection = await this.connect("host:version");
        const readable = new BufferedReadableStream(connection.readable);
        try {
            const length = hexToNumber(await readable.readExactly(4));
            const version = hexToNumber(await readable.readExactly(length));
            return version;
        }
        finally {
            connection.writable.close().catch(NOOP);
            readable.cancel().catch(NOOP);
        }
    }
    async validateVersion() {
        const version = await this.getVersion();
        if (version !== AdbServerClient.VERSION) {
            throw new Error(`adb server version (${version}) doesn't match this client (${AdbServerClient.VERSION})`);
        }
    }
    async killServer() {
        const connection = await this.connect("host:kill");
        connection.writable.close().catch(NOOP);
        connection.readable.cancel().catch(NOOP);
    }
    async getServerFeatures() {
        const connection = await this.connect("host:host-features");
        const readable = new BufferedReadableStream(connection.readable);
        try {
            const response = await AdbServerClient.readString(readable);
            return response.split(",");
        }
        finally {
            connection.writable.close().catch(NOOP);
            readable.cancel().catch(NOOP);
        }
    }
    async getDevices() {
        const connection = await this.connect("host:devices-l");
        const readable = new BufferedReadableStream(connection.readable);
        try {
            const devices = [];
            const response = await AdbServerClient.readString(readable);
            for (const line of response.split("\n")) {
                if (!line) {
                    continue;
                }
                const parts = line.split(" ").filter(Boolean);
                const serial = parts[0];
                const status = parts[1];
                if (status !== "device") {
                    continue;
                }
                let product;
                let model;
                let device;
                let transportId;
                for (let i = 2; i < parts.length; i += 1) {
                    const [key, value] = parts[i].split(":");
                    switch (key) {
                        case "product":
                            product = value;
                            break;
                        case "model":
                            model = value;
                            break;
                        case "device":
                            device = value;
                            break;
                        case "transport_id":
                            transportId = BigInt(value);
                            break;
                    }
                }
                if (!transportId) {
                    throw new Error(`No transport id for device ${serial}`);
                }
                devices.push({
                    serial,
                    product,
                    model,
                    device,
                    transportId,
                });
            }
            return devices;
        }
        finally {
            connection.writable.close().catch(NOOP);
            readable.cancel().catch(NOOP);
        }
    }
    formatDeviceService(device, command) {
        if (!device) {
            return `host:${command}`;
        }
        if ("transportId" in device) {
            return `host-transport-id:${device.transportId}:${command}`;
        }
        if ("serial" in device) {
            return `host-serial:${device.serial}:${command}`;
        }
        if ("usb" in device) {
            return `host-usb:${command}`;
        }
        if ("tcp" in device) {
            return `host-local:${command}`;
        }
        throw new Error("Invalid device selector");
    }
    /**
     * Gets the features supported by the device.
     * The transport ID of the selected device is also returned,
     * so the caller can execute other commands against the same device.
     * @param device The device selector
     * @returns The transport ID of the selected device, and the features supported by the device.
     */
    async getDeviceFeatures(device) {
        // Usually the client sends a device command using `connectDevice`,
        // so the command got forwarded and handled by ADB daemon.
        // However, in fact, `connectDevice` only forwards unknown services to device,
        // if the service is a host command, it will still be handled by ADB server.
        // Also, if the command is about a device, but didn't specify a selector,
        // it will be executed against the device selected previously by `connectDevice`.
        // Using this method, we can get the transport ID and device features in one connection.
        const socket = await this.connectDevice(device, "host:features");
        try {
            const readable = new BufferedReadableStream(socket.readable);
            const featuresString = await AdbServerClient.readString(readable);
            const features = featuresString.split(",");
            return { transportId: socket.transportId, features };
        }
        finally {
            await socket.close();
        }
    }
    /**
     * Creates a connection that will forward the service to device.
     * @param device The device selector
     * @param service The service to forward
     * @returns An `AdbServerSocket` that can be used to communicate with the service
     */
    async connectDevice(device, service) {
        await this.validateVersion();
        let switchService;
        let transportId;
        if (!device) {
            switchService = `host:tport:any`;
        }
        else if ("transportId" in device) {
            switchService = `host:transport-id:${device.transportId}`;
            transportId = device.transportId;
        }
        else if ("serial" in device) {
            switchService = `host:tport:serial:${device.serial}`;
        }
        else if ("usb" in device) {
            switchService = `host:tport:usb`;
        }
        else if ("tcp" in device) {
            switchService = `host:tport:local`;
        }
        else {
            throw new Error("Invalid device selector");
        }
        const connection = await this.connect(switchService);
        const readable = new BufferedReadableStream(connection.readable);
        const writer = connection.writable.getWriter();
        try {
            if (transportId === undefined) {
                const array = await readable.readExactly(8);
                // TODO: switch to a more performant algorithm.
                const dataView = new DataView(array.buffer, array.byteOffset, array.byteLength);
                transportId = BigIntFieldType.Uint64.getter(dataView, 0, true);
            }
            await AdbServerClient.writeString(writer, service);
            await AdbServerClient.readOkay(readable);
            writer.releaseLock();
            const duplex = new DuplexStreamFactory();
            const wrapReadable = duplex.wrapReadable(readable.release());
            const wrapWritable = duplex.createWritable(new WrapWritableStream(connection.writable).bePipedThroughFrom(new UnwrapConsumableStream()));
            return {
                transportId,
                service,
                readable: wrapReadable,
                writable: wrapWritable,
                close() {
                    return duplex.close();
                },
            };
        }
        catch (e) {
            writer.close().catch(NOOP);
            readable.cancel().catch(NOOP);
            throw e;
        }
    }
    /**
     * Wait for a device to be connected or disconnected.
     * @param device The device selector
     * @param state The state to wait for
     * @param options The options
     * @returns A promise that resolves when the condition is met.
     */
    async waitFor(device, state, options) {
        let type;
        if (!device) {
            type = "any";
        }
        else if ("transportId" in device) {
            type = "any";
        }
        else if ("serial" in device) {
            type = "any";
        }
        else if ("usb" in device) {
            type = "usb";
        }
        else if ("tcp" in device) {
            type = "local";
        }
        else {
            throw new Error("Invalid device selector");
        }
        // `waitFor` can't use `connectDevice`, because the device
        // might not be available yet.
        const service = this.formatDeviceService(device, `wait-for-${type}-${state}`);
        // `connect` resolves when server writes `OKAY`,
        // but for this command the server writes `OKAY` after the condition is met.
        await this.connect(service, options);
    }
    async createTransport(device) {
        const { transportId, features } = await this.getDeviceFeatures(device);
        const devices = await this.getDevices();
        const info = devices.find((device) => device.transportId === transportId);
        const banner = new AdbBanner(info?.product, info?.model, info?.device, features);
        return new AdbServerTransport(this, info?.serial ?? "", banner, transportId);
    }
}
async function raceSignal(callback, ...signals) {
    const abortPromise = new PromiseResolver();
    function abort() {
        abortPromise.reject(this.reason);
    }
    try {
        for (const signal of signals) {
            if (!signal) {
                continue;
            }
            if (signal.aborted) {
                throw signal.reason;
            }
            signal.addEventListener("abort", abort);
        }
        return await Promise.race([callback(), abortPromise.promise]);
    }
    finally {
        for (const signal of signals) {
            if (!signal) {
                continue;
            }
            signal.removeEventListener("abort", abort);
        }
    }
}
//# sourceMappingURL=client.js.map
