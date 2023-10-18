import { decodeUtf8 } from "/data/window/resources/@yume-chan/struct/esm/index.js";
import { TransformStream } from "./stream.js";
export class DecodeUtf8Stream extends TransformStream {
    constructor() {
        super({
            transform(chunk, controller) {
                controller.enqueue(decodeUtf8(chunk));
            },
        });
    }
}
//# sourceMappingURL=decode-utf8.js.map
