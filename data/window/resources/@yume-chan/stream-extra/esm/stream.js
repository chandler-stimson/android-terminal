import { ReadableStream as ReadableStreamPolyfill, TransformStream as TransformStreamPolyfill, WritableStream as WritableStreamPolyfill, } from "/data/window/resources/web-streams-polyfill/dist/ponyfill.mjs";
export * from "/data/window/resources/web-streams-polyfill/dist/ponyfill.mjs";
const GLOBAL = globalThis;
export const AbortController = GLOBAL.AbortController;
export let ReadableStream = ReadableStreamPolyfill;
export let WritableStream = WritableStreamPolyfill;
export let TransformStream = TransformStreamPolyfill;
if (GLOBAL.ReadableStream && GLOBAL.WritableStream && GLOBAL.TransformStream) {
    ReadableStream = GLOBAL.ReadableStream;
    WritableStream = GLOBAL.WritableStream;
    TransformStream = GLOBAL.TransformStream;
}
//# sourceMappingURL=stream.js.map
