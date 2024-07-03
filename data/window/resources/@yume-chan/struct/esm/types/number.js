import { getInt16, getInt32, getInt8, getUint16, getUint32, } from "@yume-chan/no-data-view";
import { StructFieldDefinition, StructFieldValue } from "../basic/index.js";
import { SyncPromise } from "../sync-promise.js";
export var NumberFieldVariant;
(function (NumberFieldVariant) {
    NumberFieldVariant.Uint8 = {
        signed: false,
        size: 1,
        deserialize(array) {
            return array[0];
        },
        serialize(dataView, offset, value) {
            dataView.setUint8(offset, value);
        },
    };
    NumberFieldVariant.Int8 = {
        signed: true,
        size: 1,
        deserialize(array) {
            return getInt8(array, 0);
        },
        serialize(dataView, offset, value) {
            dataView.setInt8(offset, value);
        },
    };
    NumberFieldVariant.Uint16 = {
        signed: false,
        size: 2,
        deserialize(array, littleEndian) {
            // PERF: Creating many `DataView`s over small buffers is 90% slower
            // than this. Even if the `DataView` is cached, `DataView#getUint16`
            // is still 1% slower than this.
            return getUint16(array, 0, littleEndian);
        },
        serialize(dataView, offset, value, littleEndian) {
            dataView.setUint16(offset, value, littleEndian);
        },
    };
    NumberFieldVariant.Int16 = {
        signed: true,
        size: 2,
        deserialize(array, littleEndian) {
            return getInt16(array, 0, littleEndian);
        },
        serialize(dataView, offset, value, littleEndian) {
            dataView.setInt16(offset, value, littleEndian);
        },
    };
    NumberFieldVariant.Uint32 = {
        signed: false,
        size: 4,
        deserialize(array, littleEndian) {
            return getUint32(array, 0, littleEndian);
        },
        serialize(dataView, offset, value, littleEndian) {
            dataView.setUint32(offset, value, littleEndian);
        },
    };
    NumberFieldVariant.Int32 = {
        signed: true,
        size: 4,
        deserialize(array, littleEndian) {
            return getInt32(array, 0, littleEndian);
        },
        serialize(dataView, offset, value, littleEndian) {
            dataView.setInt32(offset, value, littleEndian);
        },
    };
})(NumberFieldVariant || (NumberFieldVariant = {}));
export class NumberFieldDefinition extends StructFieldDefinition {
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
        return new NumberFieldValue(this, options, struct, value);
    }
    deserialize(options, stream, struct) {
        return SyncPromise.try(() => {
            return stream.readExactly(this.getSize());
        })
            .then((array) => {
            const value = this.variant.deserialize(array, options.littleEndian);
            return this.create(options, struct, value);
        })
            .valueOrPromise();
    }
}
export class NumberFieldValue extends StructFieldValue {
    serialize(dataView, array, offset) {
        this.definition.variant.serialize(dataView, offset, this.value, this.options.littleEndian);
    }
}
//# sourceMappingURL=number.js.map