import { getUint32LittleEndian } from "@yume-chan/no-data-view";
import Struct, { decodeUtf8 } from "@yume-chan/struct";
function encodeAsciiUnchecked(value) {
    const result = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
        result[i] = value.charCodeAt(i);
    }
    return result;
}
/**
 * Encode ID to numbers for faster comparison
 * @param value A 4-character string
 * @returns A 32-bit integer by encoding the string as little-endian
 */
export function adbSyncEncodeId(value) {
    const buffer = encodeAsciiUnchecked(value);
    return getUint32LittleEndian(buffer, 0);
}
export var AdbSyncResponseId;
(function (AdbSyncResponseId) {
    AdbSyncResponseId.Entry = adbSyncEncodeId("DENT");
    AdbSyncResponseId.Entry2 = adbSyncEncodeId("DNT2");
    AdbSyncResponseId.Lstat = adbSyncEncodeId("STAT");
    AdbSyncResponseId.Stat = adbSyncEncodeId("STA2");
    AdbSyncResponseId.Lstat2 = adbSyncEncodeId("LST2");
    AdbSyncResponseId.Done = adbSyncEncodeId("DONE");
    AdbSyncResponseId.Data = adbSyncEncodeId("DATA");
    AdbSyncResponseId.Ok = adbSyncEncodeId("OKAY");
    AdbSyncResponseId.Fail = adbSyncEncodeId("FAIL");
})(AdbSyncResponseId || (AdbSyncResponseId = {}));
export class AdbSyncError extends Error {
}
export const AdbSyncFailResponse = new Struct({ littleEndian: true })
    .uint32("messageLength")
    .string("message", { lengthField: "messageLength" })
    .postDeserialize((object) => {
    throw new AdbSyncError(object.message);
});
export async function adbSyncReadResponse(stream, id, type) {
    if (typeof id === "string") {
        id = adbSyncEncodeId(id);
    }
    const buffer = await stream.readExactly(4);
    switch (getUint32LittleEndian(buffer, 0)) {
        case AdbSyncResponseId.Fail:
            await AdbSyncFailResponse.deserialize(stream);
            throw new Error("Unreachable");
        case id:
            return await type.deserialize(stream);
        default:
            throw new Error(`Expected '${id}', but got '${decodeUtf8(buffer)}'`);
    }
}
export async function* adbSyncReadResponses(stream, id, type) {
    if (typeof id === "string") {
        id = adbSyncEncodeId(id);
    }
    while (true) {
        const buffer = await stream.readExactly(4);
        switch (getUint32LittleEndian(buffer, 0)) {
            case AdbSyncResponseId.Fail:
                await AdbSyncFailResponse.deserialize(stream);
                throw new Error("Unreachable");
            case AdbSyncResponseId.Done:
                // `DONE` responses' size are always same as the request's normal response.
                //
                // For example, `DONE` responses for `LIST` requests are 16 bytes (same as `DENT` responses),
                // but `DONE` responses for `STAT` requests are 12 bytes (same as `STAT` responses).
                await stream.readExactly(type.size);
                return;
            case id:
                yield (await type.deserialize(stream));
                break;
            default:
                throw new Error(`Expected '${id}' or '${AdbSyncResponseId.Done}', but got '${decodeUtf8(buffer)}'`);
        }
    }
}
//# sourceMappingURL=response.js.map