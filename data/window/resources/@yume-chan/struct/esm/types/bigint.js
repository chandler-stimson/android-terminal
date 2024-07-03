import { getInt64, getUint64, setInt64, setUint64, } from "@yume-chan/no-data-view";
import { StructFieldDefinition, StructFieldValue } from "../basic/index.js";
import { SyncPromise } from "../sync-promise.js";
export class BigIntFieldVariant {
    TTypeScriptType;
    size;
    deserialize;
    serialize;
    constructor(size, deserialize, serialize) {
        this.size = size;
        this.deserialize = deserialize;
        this.serialize = serialize;
    }
    static Int64 = new BigIntFieldVariant(8, getInt64, setInt64);
    static Uint64 = new BigIntFieldVariant(8, getUint64, setUint64);
}
export class BigIntFieldDefinition extends StructFieldDefinition {
    variant;
    constructor(variant, typescriptType) {
        void typescriptType;
        super();
        this.variant = variant;
    }
    getSize() {
        return this.variant.size;
    }
    create(options, struct, value) {
        return new BigIntFieldValue(this, options, struct, value);
    }
    deserialize(options, stream, struct) {
        return SyncPromise.try(() => {
            return stream.readExactly(this.getSize());
        })
            .then((array) => {
            const value = this.variant.deserialize(array, 0, options.littleEndian);
            return this.create(options, struct, value);
        })
            .valueOrPromise();
    }
}
export class BigIntFieldValue extends StructFieldValue {
    serialize(dataView, array, offset) {
        this.definition.variant.serialize(array, offset, this.value, this.options.littleEndian);
    }
}
//# sourceMappingURL=bigint.js.map