import { AdbPacketHeader, AdbPacketSerializeStream, unreachable, } from "@yume-chan/adb";
import { DuplexStreamFactory, MaybeConsumable, ReadableStream, pipeFrom, } from "@yume-chan/stream-extra";
import { EMPTY_UINT8_ARRAY } from "@yume-chan/struct";
import { findUsbAlternateInterface, getSerialNumber, isErrorName, } from "./utils.js";
/**
 * The default filter for ADB devices, as defined by Google.
 */
export const ADB_DEFAULT_DEVICE_FILTER = {
    classCode: 0xff,
    subclassCode: 0x42,
    protocolCode: 1,
};
/**
 * Find the first pair of input and output endpoints from an alternate interface.
 *
 * ADB interface only has two endpoints, one for input and one for output.
 */
function findUsbEndpoints(endpoints) {
    if (endpoints.length === 0) {
        throw new TypeError("No endpoints given");
    }
    let inEndpoint;
    let outEndpoint;
    for (const endpoint of endpoints) {
        switch (endpoint.direction) {
            case "in":
                inEndpoint = endpoint;
                if (outEndpoint) {
                    return { inEndpoint, outEndpoint };
                }
                break;
            case "out":
                outEndpoint = endpoint;
                if (inEndpoint) {
                    return { inEndpoint, outEndpoint };
                }
                break;
        }
    }
    if (!inEndpoint) {
        throw new TypeError("No input endpoint found.");
    }
    if (!outEndpoint) {
        throw new TypeError("No output endpoint found.");
    }
    throw new Error("unreachable");
}
class Uint8ArrayExactReadable {
    #data;
    #position;
    get position() {
        return this.#position;
    }
    constructor(data) {
        this.#data = data;
        this.#position = 0;
    }
    readExactly(length) {
        const result = this.#data.subarray(this.#position, this.#position + length);
        this.#position += length;
        return result;
    }
}
export class AdbDaemonWebUsbConnection {
    #device;
    get device() {
        return this.#device;
    }
    #inEndpoint;
    get inEndpoint() {
        return this.#inEndpoint;
    }
    #outEndpoint;
    get outEndpoint() {
        return this.#outEndpoint;
    }
    #readable;
    get readable() {
        return this.#readable;
    }
    #writable;
    get writable() {
        return this.#writable;
    }
    constructor(device, inEndpoint, outEndpoint, usbManager) {
        this.#device = device;
        this.#inEndpoint = inEndpoint;
        this.#outEndpoint = outEndpoint;
        let closed = false;
        const duplex = new DuplexStreamFactory({
            close: async () => {
                try {
                    closed = true;
                    await device.raw.close();
                }
                catch {
                    /* device may have already disconnected */
                }
            },
            dispose: () => {
                closed = true;
                usbManager.removeEventListener("disconnect", handleUsbDisconnect);
            },
        });
        function handleUsbDisconnect(e) {
            if (e.device === device.raw) {
                duplex.dispose().catch(unreachable);
            }
        }
        usbManager.addEventListener("disconnect", handleUsbDisconnect);
        this.#readable = duplex.wrapReadable(new ReadableStream({
            pull: async (controller) => {
                const packet = await this.#transferIn();
                if (packet) {
                    controller.enqueue(packet);
                }
                else {
                    controller.close();
                }
            },
        }, { highWaterMark: 0 }));
        const zeroMask = outEndpoint.packetSize - 1;
        this.#writable = pipeFrom(duplex.createWritable(new MaybeConsumable.WritableStream({
            write: async (chunk) => {
                try {
                    await device.raw.transferOut(outEndpoint.endpointNumber, chunk);
                    // In USB protocol, a not-full packet indicates the end of a transfer.
                    // If the payload size is a multiple of the packet size,
                    // we need to send an empty packet to indicate the end,
                    // so the OS will send it to the device immediately.
                    if (zeroMask && (chunk.length & zeroMask) === 0) {
                        await device.raw.transferOut(outEndpoint.endpointNumber, EMPTY_UINT8_ARRAY);
                    }
                }
                catch (e) {
                    if (closed) {
                        return;
                    }
                    throw e;
                }
            },
        })), new AdbPacketSerializeStream());
    }
    async #transferIn() {
        try {
            while (true) {
                // ADB daemon sends each packet in two parts, the 24-byte header and the payload.
                const result = await this.#device.raw.transferIn(this.#inEndpoint.endpointNumber, this.#inEndpoint.packetSize);
                if (result.data.byteLength !== 24) {
                    continue;
                }
                // Per spec, the `result.data` always covers the whole `buffer`.
                const buffer = new Uint8Array(result.data.buffer);
                const stream = new Uint8ArrayExactReadable(buffer);
                // Add `payload` field to its type, it's assigned below.
                const packet = AdbPacketHeader.deserialize(stream);
                if (packet.magic !== (packet.command ^ 0xffffffff)) {
                    continue;
                }
                if (packet.payloadLength !== 0) {
                    const result = await this.#device.raw.transferIn(this.#inEndpoint.endpointNumber, packet.payloadLength);
                    packet.payload = new Uint8Array(result.data.buffer);
                }
                else {
                    packet.payload = EMPTY_UINT8_ARRAY;
                }
                return packet;
            }
        }
        catch (e) {
            // On Windows, disconnecting the device will cause `NetworkError` to be thrown,
            // even before the `disconnect` event is fired.
            // We need to wait a little bit and check if the device is still connected.
            // https://github.com/WICG/webusb/issues/219
            if (isErrorName(e, "NetworkError")) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve();
                    }, 100);
                });
                if (closed) {
                    return undefined;
                }
                else {
                    throw e;
                }
            }
            throw e;
        }
    }
}
export class AdbDaemonWebUsbDevice {
    #filters;
    #usbManager;
    #raw;
    get raw() {
        return this.#raw;
    }
    #serial;
    get serial() {
        return this.#serial;
    }
    get name() {
        return this.#raw.productName;
    }
    /**
     * Create a new instance of `AdbDaemonWebUsbConnection` using a specified `USBDevice` instance
     *
     * @param device The `USBDevice` instance obtained elsewhere.
     * @param filters The filters to use when searching for ADB interface. Defaults to {@link ADB_DEFAULT_DEVICE_FILTER}.
     */
    constructor(device, filters = [ADB_DEFAULT_DEVICE_FILTER], usbManager) {
        this.#raw = device;
        this.#serial = getSerialNumber(device);
        this.#filters = filters;
        this.#usbManager = usbManager;
    }
    async #claimInterface() {
        if (!this.#raw.opened) {
            await this.#raw.open();
        }
        const { configuration, interface_, alternate } = findUsbAlternateInterface(this.#raw, this.#filters);
        if (this.#raw.configuration?.configurationValue !==
            configuration.configurationValue) {
            // Note: Switching configuration is not supported on Windows,
            // but Android devices should always expose ADB function at the first (default) configuration.
            await this.#raw.selectConfiguration(configuration.configurationValue);
        }
        if (!interface_.claimed) {
            await this.#raw.claimInterface(interface_.interfaceNumber);
        }
        if (interface_.alternate.alternateSetting !== alternate.alternateSetting) {
            await this.#raw.selectAlternateInterface(interface_.interfaceNumber, alternate.alternateSetting);
        }
        const { inEndpoint, outEndpoint } = findUsbEndpoints(alternate.endpoints);
        return [inEndpoint, outEndpoint];
    }
    /**
     * Claim the device and create a pair of `AdbPacket` streams to the ADB interface.
     * @returns The pair of `AdbPacket` streams.
     */
    async connect() {
        const [inEndpoint, outEndpoint] = await this.#claimInterface();
        return new AdbDaemonWebUsbConnection(this, inEndpoint, outEndpoint, this.#usbManager);
    }
}
//# sourceMappingURL=device.js.map