export function getUint32LittleEndian(buffer, offset) {
    return ((buffer[offset] |
        (buffer[offset + 1] << 8) |
        (buffer[offset + 2] << 16) |
        (buffer[offset + 3] << 24)) >>>
        0);
}
export function getUint32BigEndian(buffer, offset) {
    return (((buffer[offset] << 24) |
        (buffer[offset + 1] << 16) |
        (buffer[offset + 2] << 8) |
        buffer[offset + 3]) >>>
        0);
}
export function getUint32(buffer, offset, littleEndian) {
    return littleEndian
        ? (buffer[offset] |
            (buffer[offset + 1] << 8) |
            (buffer[offset + 2] << 16) |
            (buffer[offset + 3] << 24)) >>>
            0
        : ((buffer[offset] << 24) |
            (buffer[offset + 1] << 16) |
            (buffer[offset + 2] << 8) |
            buffer[offset + 3]) >>>
            0;
}
export function setUint32LittleEndian(buffer, offset, value) {
    buffer[offset] = value;
    buffer[offset + 1] = value >> 8;
    buffer[offset + 2] = value >> 16;
    buffer[offset + 3] = value >> 24;
}
export function setUint32BigEndian(buffer, offset, value) {
    buffer[offset] = value >> 24;
    buffer[offset + 1] = value >> 16;
    buffer[offset + 2] = value >> 8;
    buffer[offset + 3] = value;
}
export function setUint32(buffer, offset, value, littleEndian) {
    if (littleEndian) {
        buffer[offset] = value;
        buffer[offset + 1] = value >> 8;
        buffer[offset + 2] = value >> 16;
        buffer[offset + 3] = value >> 24;
    }
    else {
        buffer[offset] = value >> 24;
        buffer[offset + 1] = value >> 16;
        buffer[offset + 2] = value >> 8;
        buffer[offset + 3] = value;
    }
}
//# sourceMappingURL=uint32.js.map