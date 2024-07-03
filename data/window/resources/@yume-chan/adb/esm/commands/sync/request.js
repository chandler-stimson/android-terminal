import Struct from "@yume-chan/struct";
import { encodeUtf8 } from "../../utils/index.js";
import { adbSyncEncodeId } from "./response.js";
export var AdbSyncRequestId;
(function (AdbSyncRequestId) {
    AdbSyncRequestId.List = adbSyncEncodeId("LIST");
    AdbSyncRequestId.ListV2 = adbSyncEncodeId("LIS2");
    AdbSyncRequestId.Send = adbSyncEncodeId("SEND");
    AdbSyncRequestId.SendV2 = adbSyncEncodeId("SND2");
    AdbSyncRequestId.Lstat = adbSyncEncodeId("STAT");
    AdbSyncRequestId.Stat = adbSyncEncodeId("STA2");
    AdbSyncRequestId.LstatV2 = adbSyncEncodeId("LST2");
    AdbSyncRequestId.Data = adbSyncEncodeId("DATA");
    AdbSyncRequestId.Done = adbSyncEncodeId("DONE");
    AdbSyncRequestId.Receive = adbSyncEncodeId("RECV");
})(AdbSyncRequestId || (AdbSyncRequestId = {}));
export const AdbSyncNumberRequest = new Struct({ littleEndian: true })
    .uint32("id")
    .uint32("arg");
export async function adbSyncWriteRequest(writable, id, value) {
    if (typeof id === "string") {
        id = adbSyncEncodeId(id);
    }
    if (typeof value === "number") {
        await writable.write(AdbSyncNumberRequest.serialize({ id, arg: value }));
        return;
    }
    if (typeof value === "string") {
        value = encodeUtf8(value);
    }
    // `writable` is buffered, it copies inputs to an internal buffer,
    // so don't concatenate headers and data here, that will be an unnecessary copy.
    await writable.write(AdbSyncNumberRequest.serialize({ id, arg: value.length }));
    await writable.write(value);
}
//# sourceMappingURL=request.js.map