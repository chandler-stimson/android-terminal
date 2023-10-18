// TODO: allow over reading (returning a `Uint8Array`, an `offset` and a `length`) to avoid copying
export class ExactReadableEndedError extends Error {
    constructor() {
        super("ExactReadable ended");
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
//# sourceMappingURL=stream.js.map