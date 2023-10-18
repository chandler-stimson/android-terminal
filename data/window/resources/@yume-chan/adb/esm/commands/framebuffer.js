import { BufferedReadableStream } from "/data/window/resources/@yume-chan/stream-extra/esm/index.js";
import Struct, { StructEmptyError } from "/data/window/resources/@yume-chan/struct/esm/index.js";
const Version = new Struct({ littleEndian: true }).uint32("version");
export const AdbFrameBufferV1 = new Struct({ littleEndian: true })
    .uint32("bpp")
    .uint32("size")
    .uint32("width")
    .uint32("height")
    .uint32("red_offset")
    .uint32("red_length")
    .uint32("blue_offset")
    .uint32("blue_length")
    .uint32("green_offset")
    .uint32("green_length")
    .uint32("alpha_offset")
    .uint32("alpha_length")
    .uint8Array("data", { lengthField: "size" });
export const AdbFrameBufferV2 = new Struct({ littleEndian: true })
    .uint32("bpp")
    .uint32("colorSpace")
    .uint32("size")
    .uint32("width")
    .uint32("height")
    .uint32("red_offset")
    .uint32("red_length")
    .uint32("blue_offset")
    .uint32("blue_length")
    .uint32("green_offset")
    .uint32("green_length")
    .uint32("alpha_offset")
    .uint32("alpha_length")
    .uint8Array("data", { lengthField: "size" });
export class AdbFrameBufferError extends Error {
    constructor(message, options) {
        super(message, options);
    }
}
export class AdbFrameBufferUnsupportedVersionError extends AdbFrameBufferError {
    constructor(version) {
        super(`Unsupported FrameBuffer version ${version}`);
    }
}
export class AdbFrameBufferForbiddenError extends AdbFrameBufferError {
    constructor() {
        super("FrameBuffer is disabled by current app");
    }
}
export async function framebuffer(adb) {
    const socket = await adb.createSocket("framebuffer:");
    const stream = new BufferedReadableStream(socket.readable);
    let version;
    try {
        ({ version } = await Version.deserialize(stream));
    }
    catch (e) {
        if (e instanceof StructEmptyError) {
            throw new AdbFrameBufferForbiddenError();
        }
        throw e;
    }
    switch (version) {
        case 1:
            // TODO: AdbFrameBuffer: does all v1 responses uses the same color space? Add it so the command returns same format for all versions.
            return AdbFrameBufferV1.deserialize(stream);
        case 2:
            return AdbFrameBufferV2.deserialize(stream);
        default:
            throw new AdbFrameBufferUnsupportedVersionError(version);
    }
}
//# sourceMappingURL=framebuffer.js.map
