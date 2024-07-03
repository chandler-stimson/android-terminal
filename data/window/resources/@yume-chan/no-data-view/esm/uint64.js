export function getUint64LittleEndian(buffer, offset) {
    return (BigInt(buffer[offset]) |
        (BigInt(buffer[offset + 1]) << 8n) |
        (BigInt(buffer[offset + 2]) << 16n) |
        (BigInt(buffer[offset + 3]) << 24n) |
        (BigInt(buffer[offset + 4]) << 32n) |
        (BigInt(buffer[offset + 5]) << 40n) |
        (BigInt(buffer[offset + 6]) << 48n) |
        (BigInt(buffer[offset + 7]) << 56n));
}
export function getUint64BigEndian(buffer, offset) {
    return ((BigInt(buffer[offset]) << 56n) |
        (BigInt(buffer[offset + 1]) << 48n) |
        (BigInt(buffer[offset + 2]) << 40n) |
        (BigInt(buffer[offset + 3]) << 32n) |
        (BigInt(buffer[offset + 4]) << 24n) |
        (BigInt(buffer[offset + 5]) << 16n) |
        (BigInt(buffer[offset + 6]) << 8n) |
        BigInt(buffer[offset + 7]));
}
export function getUint64(buffer, offset, littleEndian) {
    return littleEndian
        ? BigInt(buffer[offset]) |
            (BigInt(buffer[offset + 1]) << 8n) |
            (BigInt(buffer[offset + 2]) << 16n) |
            (BigInt(buffer[offset + 3]) << 24n) |
            (BigInt(buffer[offset + 4]) << 32n) |
            (BigInt(buffer[offset + 5]) << 40n) |
            (BigInt(buffer[offset + 6]) << 48n) |
            (BigInt(buffer[offset + 7]) << 56n)
        : (BigInt(buffer[offset]) << 56n) |
            (BigInt(buffer[offset + 1]) << 48n) |
            (BigInt(buffer[offset + 2]) << 40n) |
            (BigInt(buffer[offset + 3]) << 32n) |
            (BigInt(buffer[offset + 4]) << 24n) |
            (BigInt(buffer[offset + 5]) << 16n) |
            (BigInt(buffer[offset + 6]) << 8n) |
            BigInt(buffer[offset + 7]);
}
export function setUint64LittleEndian(buffer, offset, value) {
    buffer[offset] = Number(value & 0xffn);
    buffer[offset + 1] = Number((value >> 8n) & 0xffn);
    buffer[offset + 2] = Number((value >> 16n) & 0xffn);
    buffer[offset + 3] = Number((value >> 24n) & 0xffn);
    buffer[offset + 4] = Number((value >> 32n) & 0xffn);
    buffer[offset + 5] = Number((value >> 40n) & 0xffn);
    buffer[offset + 6] = Number((value >> 48n) & 0xffn);
    buffer[offset + 7] = Number((value >> 56n) & 0xffn);
}
export function setUint64BigEndian(buffer, offset, value) {
    buffer[offset] = Number((value >> 56n) & 0xffn);
    buffer[offset + 1] = Number((value >> 48n) & 0xffn);
    buffer[offset + 2] = Number((value >> 40n) & 0xffn);
    buffer[offset + 3] = Number((value >> 32n) & 0xffn);
    buffer[offset + 4] = Number((value >> 24n) & 0xffn);
    buffer[offset + 5] = Number((value >> 16n) & 0xffn);
    buffer[offset + 6] = Number((value >> 8n) & 0xffn);
    buffer[offset + 7] = Number(value & 0xffn);
}
export function setUint64(buffer, offset, value, littleEndian) {
    if (littleEndian) {
        buffer[offset] = Number(value & 0xffn);
        buffer[offset + 1] = Number((value >> 8n) & 0xffn);
        buffer[offset + 2] = Number((value >> 16n) & 0xffn);
        buffer[offset + 3] = Number((value >> 24n) & 0xffn);
        buffer[offset + 4] = Number((value >> 32n) & 0xffn);
        buffer[offset + 5] = Number((value >> 40n) & 0xffn);
        buffer[offset + 6] = Number((value >> 48n) & 0xffn);
        buffer[offset + 7] = Number((value >> 56n) & 0xffn);
    }
    else {
        buffer[offset] = Number((value >> 56n) & 0xffn);
        buffer[offset + 1] = Number((value >> 48n) & 0xffn);
        buffer[offset + 2] = Number((value >> 40n) & 0xffn);
        buffer[offset + 3] = Number((value >> 32n) & 0xffn);
        buffer[offset + 4] = Number((value >> 24n) & 0xffn);
        buffer[offset + 5] = Number((value >> 16n) & 0xffn);
        buffer[offset + 6] = Number((value >> 8n) & 0xffn);
        buffer[offset + 7] = Number(value & 0xffn);
    }
}
//# sourceMappingURL=uint64.js.map