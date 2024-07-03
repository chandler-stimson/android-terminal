// cspell:ignore tport
import { PromiseResolver } from "@yume-chan/async";
import { getUint64LittleEndian } from "@yume-chan/no-data-view";
import { BufferedReadableStream, MaybeConsumable, WrapWritableStream, } from "@yume-chan/stream-extra";
import { EMPTY_UINT8_ARRAY, SyncPromise, decodeUtf8, encodeUtf8, } from "@yume-chan/struct";
import { AdbBanner } from "../banner.js";
import { NOOP, hexToNumber, sequenceEqual, write4HexDigits, } from "../utils/index.js";
import { AdbServerTransport } from "./transport.js";
const OKAY = encodeUtf8("OKAY");
const FAIL = encodeUtf8("FAIL");
class AdbServerStream {
    #connection;
    #buffered;
    #writer;
    constructor(connection) {
        this.#connection = connection;
        this.#buffered = new BufferedReadableStream(connection.readable);
        this.#writer = connection.writable.getWriter();
    }
    readExactly(length) {
        return this.#buffered.readExactly(length);
    }
    readString() {
        return SyncPromise.try(() => this.readExactly(4))
            .then((buffer) => {
            const length = hexToNumber(buffer);
            if (length === 0) {
                return EMPTY_UINT8_ARRAY;
            }
            else {
                return this.readExactly(length);
            }
        })
            .then((buffer) => {
            // TODO: Investigate using stream mode `TextDecoder` for long strings.
            // Because concatenating strings uses rope data structure,
            // which only points to the original strings and doesn't copy the data,
            // it's more efficient than concatenating `Uint8Array`s.
            //
            // ```
            // const decoder = new TextDecoder();
            // let result = '';
            // for await (const chunk of stream.iterateExactly(length)) {
            //     result += decoder.decode(chunk, { stream: true });
            // }
            // result += decoder.decode();
            // return result;
            // ```
            //
            // Although, it will be super complex to use `SyncPromise` with async iterator,
            // `stream.iterateExactly` need to return an
            // `Iterator<Uint8Array | Promise<Uint8Array>>` instead of a true async iterator.
            // Maybe `SyncPromise` should support async iterators directly.
            return decodeUtf8(buffer);
        })
            .valueOrPromise();
    }
    async writeString(value) {
        // TODO: investigate using `encodeUtf8("0000" + value)` then modifying the length
        // That way allocates a new string (hopefully only a rope) instead of a new buffer
        const encoded = encodeUtf8(value);
        const buffer = new Uint8Array(4 + encoded.length);
        write4HexDigits(buffer, 0, encoded.length);
        buffer.set(encoded, 4);
        await this.#writer.write(buffer);
    }
    async readOkay() {
        const response = await this.readExactly(4);
        if (sequenceEqual(response, OKAY)) {
            // `OKAY` is followed by data length and data
            // But different services want to parse the data differently
            // So don't read the data here
            return;
        }
        if (sequenceEqual(response, FAIL)) {
            const reason = await this.readString();
            throw new Error(reason);
        }
        throw new Error(`Unexpected response: ${decodeUtf8(response)}`);
    }
    release() {
        this.#writer.releaseLock();
        return {
            readable: this.#buffered.release(),
            writable: this.#connection.writable,
            closed: this.#connection.closed,
            close: () => this.#connection.close(),
        };
    }
    async dispose() {
        await this.#buffered.cancel().catch(NOOP);
        await this.#writer.close().catch(NOOP);
        try {
            await this.#connection.close();
        }
        catch {
            // ignore
        }
    }
}
export class AdbServerClient {
    static VERSION = 41;
    connector;
    wireless = new AdbServerClient.WirelessCommands(this);
    mDns = new AdbServerClient.MDnsCommands(this);
    constructor(connection) {
        this.connector = connection;
    }
    async createConnection(request, options) {
        const connection = await this.connector.connect(options);
        const stream = new AdbServerStream(connection);
        try {
            await stream.writeString(request);
        }
        catch (e) {
            await stream.dispose();
            throw e;
        }
        try {
            // `raceSignal` throws when the signal is aborted,
            // so the `catch` block can close the connection.
            await raceSignal(() => stream.readOkay(), options?.signal);
            return stream;
        }
        catch (e) {
            await stream.dispose();
            throw e;
        }
    }
    /**
     * `adb version`
     */
    async getVersion() {
        const connection = await this.createConnection("host:version");
        try {
            const length = hexToNumber(await connection.readExactly(4));
            const version = hexToNumber(await connection.readExactly(length));
            return version;
        }
        finally {
            await connection.dispose();
        }
    }
    async validateVersion() {
        const version = await this.getVersion();
        if (version !== AdbServerClient.VERSION) {
            throw new Error(`adb server version (${version}) doesn't match this client (${AdbServerClient.VERSION})`);
        }
    }
    /**
     * `adb kill-server`
     */
    async killServer() {
        const connection = await this.createConnection("host:kill");
        await connection.dispose();
    }
    /**
     * `adb host-features`
     */
    async getServerFeatures() {
        const connection = await this.createConnection("host:host-features");
        try {
            const response = await connection.readString();
            return response.split(",");
        }
        finally {
            await connection.dispose();
        }
    }
    parseDeviceList(value) {
        const devices = [];
        for (const line of value.split("\n")) {
            if (!line) {
                continue;
            }
            const parts = line.split(" ").filter(Boolean);
            const serial = parts[0];
            const status = parts[1];
            if (status !== "device" && status !== "unauthorized") {
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
                authenticating: status === "unauthorized",
                product,
                model,
                device,
                transportId,
            });
        }
        return devices;
    }
    /**
     * `adb devices -l`
     */
    async getDevices() {
        const connection = await this.createConnection("host:devices-l");
        try {
            const response = await connection.readString();
            return this.parseDeviceList(response);
        }
        finally {
            await connection.dispose();
        }
    }
    /**
     * Track the device list.
     *
     * @param signal An optional `AbortSignal` to stop tracking
     *
     * When `signal` is aborted, `trackDevices` will return normally, instead of throwing `signal.reason`.
     */
    async *trackDevices(signal) {
        const connection = await this.createConnection("host:track-devices-l");
        try {
            while (true) {
                const response = await raceSignal(async () => await connection.readString(), signal);
                const devices = this.parseDeviceList(response);
                yield devices;
            }
        }
        catch (e) {
            if (e === signal?.reason) {
                return;
            }
        }
        finally {
            await connection.dispose();
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
        throw new TypeError("Invalid device selector");
    }
    /**
     * `adb -s <device> reconnect` or `adb reconnect offline`
     */
    async reconnectDevice(device) {
        const connection = await this.createConnection(device === "offline"
            ? "host:reconnect-offline"
            : this.formatDeviceService(device, "reconnect"));
        try {
            await connection.readString();
        }
        finally {
            await connection.dispose();
        }
    }
    /**
     * Gets the features supported by the device.
     * The transport ID of the selected device is also returned,
     * so the caller can execute other commands against the same device.
     * @param device The device selector
     * @returns The transport ID of the selected device, and the features supported by the device.
     */
    async getDeviceFeatures(device) {
        // On paper, `host:features` is a host service (device features are cached in host),
        // so it shouldn't use `createDeviceConnection`,
        // which is used to forward the service to the device.
        //
        // However, `createDeviceConnection` is a two step process:
        //
        //    1. Send a switch device service to host, to switch the connection to the device.
        //    2. Send the actual service to host, let it forward the service to the device.
        //
        // In step 2, the host only forward the service to device if the service is unknown to host.
        // If the service is a host service, it's still handled by host.
        //
        // Even better, if the service needs a device selector, but the selector is not provided,
        // the service will be executed against the device selected by the switch device service.
        // So we can use all device selector formats for the host service,
        // and get the transport ID in the same time.
        const connection = await this.createDeviceConnection(device, "host:features");
        // Luckily `AdbServerClient.Socket` is compatible with `AdbServerClient.ServerConnection`
        const stream = new AdbServerStream(connection);
        try {
            const featuresString = await stream.readString();
            const features = featuresString.split(",");
            return { transportId: connection.transportId, features };
        }
        finally {
            await stream.dispose();
        }
    }
    /**
     * Creates a connection that will forward the service to device.
     * @param device The device selector
     * @param service The service to forward
     * @returns An `AdbServerClient.Socket` that can be used to communicate with the service
     */
    async createDeviceConnection(device, service) {
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
            throw new TypeError("Invalid device selector");
        }
        const connection = await this.createConnection(switchService);
        try {
            await connection.writeString(service);
        }
        catch (e) {
            await connection.dispose();
            throw e;
        }
        try {
            if (transportId === undefined) {
                const array = await connection.readExactly(8);
                transportId = getUint64LittleEndian(array, 0);
            }
            await connection.readOkay();
            const socket = connection.release();
            return {
                transportId,
                service,
                readable: socket.readable,
                writable: new WrapWritableStream(socket.writable).bePipedThroughFrom(new MaybeConsumable.UnwrapStream()),
                get closed() {
                    return socket.closed;
                },
                async close() {
                    await socket.close();
                },
            };
        }
        catch (e) {
            await connection.dispose();
            throw e;
        }
    }
    /**
     * Wait for a device to be connected or disconnected.
     *
     * `adb wait-for-<state>`
     *
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
            throw new TypeError("Invalid device selector");
        }
        // `waitFor` can't use `connectDevice`, because the device
        // might not be available yet.
        const service = this.formatDeviceService(device, `wait-for-${type}-${state}`);
        const connection = await this.createConnection(service, options);
        try {
            await connection.readOkay();
        }
        finally {
            await connection.dispose();
        }
    }
    async createTransport(device) {
        const { transportId, features } = await this.getDeviceFeatures(device);
        const devices = await this.getDevices();
        const info = devices.find((device) => device.transportId === transportId);
        const banner = new AdbBanner(info?.product, info?.model, info?.device, features);
        return new AdbServerTransport(this, info?.serial ?? "", banner, transportId);
    }
}
export async function raceSignal(callback, ...signals) {
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
(function (AdbServerClient) {
    class NetworkError extends Error {
        constructor(message) {
            super(message);
            this.name = "NetworkError";
        }
    }
    AdbServerClient.NetworkError = NetworkError;
    class UnauthorizedError extends Error {
        constructor(message) {
            super(message);
            this.name = "UnauthorizedError";
        }
    }
    AdbServerClient.UnauthorizedError = UnauthorizedError;
    class AlreadyConnectedError extends Error {
        constructor(message) {
            super(message);
            this.name = "AlreadyConnectedError";
        }
    }
    AdbServerClient.AlreadyConnectedError = AlreadyConnectedError;
    class WirelessCommands {
        #client;
        constructor(client) {
            this.#client = client;
        }
        /**
         * `adb pair <password> <address>`
         */
        async pair(address, password) {
            const connection = await this.#client.createConnection(`host:pair:${password}:${address}`);
            try {
                const response = await connection.readExactly(4);
                // `response` is either `FAIL`, or 4 hex digits for length of the string
                if (sequenceEqual(response, FAIL)) {
                    throw new Error(await connection.readString());
                }
                const length = hexToNumber(response);
                // Ignore the string as it's always `Successful ...`
                await connection.readExactly(length);
            }
            finally {
                await connection.dispose();
            }
        }
        /**
         * `adb connect <address>`
         */
        async connect(address) {
            const connection = await this.#client.createConnection(`host:connect:${address}`);
            try {
                const response = await connection.readString();
                switch (response) {
                    case `already connected to ${address}`:
                        throw new AdbServerClient.AlreadyConnectedError(response);
                    case `failed to connect to ${address}`: // `adb pair` mode not authorized
                    case `failed to authenticate to ${address}`: // `adb tcpip` mode not authorized
                        throw new AdbServerClient.UnauthorizedError(response);
                    case `connected to ${address}`:
                        return;
                    default:
                        throw new AdbServerClient.NetworkError(response);
                }
            }
            finally {
                await connection.dispose();
            }
        }
        /**
         * `adb disconnect <address>`
         */
        async disconnect(address) {
            const connection = await this.#client.createConnection(`host:disconnect:${address}`);
            try {
                await connection.readString();
            }
            finally {
                await connection.dispose();
            }
        }
    }
    AdbServerClient.WirelessCommands = WirelessCommands;
    class MDnsCommands {
        #client;
        constructor(client) {
            this.#client = client;
        }
        async check() {
            const connection = await this.#client.createConnection("host:mdns:check");
            try {
                const response = await connection.readString();
                return !response.startsWith("ERROR:");
            }
            finally {
                await connection.dispose();
            }
        }
        async getServices() {
            const connection = await this.#client.createConnection("host:mdns:services");
            try {
                const response = await connection.readString();
                return response
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => {
                    const parts = line.split("\t");
                    return {
                        name: parts[0],
                        service: parts[1],
                        address: parts[2],
                    };
                });
            }
            finally {
                await connection.dispose();
            }
        }
    }
    AdbServerClient.MDnsCommands = MDnsCommands;
})(AdbServerClient || (AdbServerClient = {}));
//# sourceMappingURL=client.js.map