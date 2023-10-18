import { AutoDisposable } from "/data/window/resources/@yume-chan/event/esm/index.js";
export class AdbCommandBase extends AutoDisposable {
    adb;
    constructor(adb) {
        super();
        this.adb = adb;
    }
}
//# sourceMappingURL=base.js.map
