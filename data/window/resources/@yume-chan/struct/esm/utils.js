/**
 * Returns a (fake) value of the given type.
 */
export function placeholder() {
    return undefined;
}
const { TextEncoder, TextDecoder } = globalThis;
const SharedEncoder = new TextEncoder();
const SharedDecoder = new TextDecoder();
export function encodeUtf8(input) {
    return SharedEncoder.encode(input);
}
export function decodeUtf8(buffer) {
    // `TextDecoder` has internal states in stream mode,
    // but this method is not for stream mode, so the instance can be reused
    return SharedDecoder.decode(buffer);
}
//# sourceMappingURL=utils.js.map