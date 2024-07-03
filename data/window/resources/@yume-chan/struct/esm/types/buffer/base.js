import { StructFieldDefinition, StructFieldValue } from "../../basic/index.js";
import { SyncPromise } from "../../sync-promise.js";
import { decodeUtf8, encodeUtf8 } from "../../utils.js";
/**
 * A converter for buffer-like fields.
 * It converts `Uint8Array`s to custom-typed values when deserializing,
 * and convert values back to `Uint8Array`s when serializing.
 *
 * @template TValue The type of the value that the converter converts to/from `Uint8Array`.
 * @template TTypeScriptType Optionally another type to refine `TValue`.
 * For example, `TValue` is `string`, and `TTypeScriptType` is `"foo" | "bar"`.
 * `TValue` is specified by the developer when creating an converter implementation,
 * `TTypeScriptType` is specified by the user when creating a field.
 */
export class BufferFieldConverter {
    TTypeScriptType;
}
/** An identity converter, doesn't convert to anything else. */
export class Uint8ArrayBufferFieldConverter extends BufferFieldConverter {
    static Instance = new Uint8ArrayBufferFieldConverter();
    constructor() {
        super();
    }
    toBuffer(value) {
        return value;
    }
    toValue(buffer) {
        return buffer;
    }
    getSize(value) {
        return value.length;
    }
}
/** An `BufferFieldSubType` that converts between `Uint8Array` and `string` */
export class StringBufferFieldConverter extends BufferFieldConverter {
    static Instance = new StringBufferFieldConverter();
    toBuffer(value) {
        return encodeUtf8(value);
    }
    toValue(array) {
        return decodeUtf8(array);
    }
    getSize() {
        // See the note in `BufferFieldConverter.getSize`
        return undefined;
    }
}
export const EMPTY_UINT8_ARRAY = new Uint8Array(0);
export class BufferLikeFieldDefinition extends StructFieldDefinition {
    converter;
    TTypeScriptType;
    constructor(converter, options) {
        super(options);
        this.converter = converter;
    }
    getDeserializeSize(struct) {
        void struct;
        return this.getSize();
    }
    /**
     * When implemented in derived classes, creates a `StructFieldValue` for the current field definition.
     */
    create(options, struct, value, array) {
        return new BufferLikeFieldValue(this, options, struct, value, array);
    }
    deserialize(options, stream, struct) {
        return SyncPromise.try(() => {
            const size = this.getDeserializeSize(struct);
            if (size === 0) {
                return EMPTY_UINT8_ARRAY;
            }
            else {
                return stream.readExactly(size);
            }
        })
            .then((array) => {
            const value = this.converter.toValue(array);
            return this.create(options, struct, value, array);
        })
            .valueOrPromise();
    }
}
export class BufferLikeFieldValue extends StructFieldValue {
    array;
    constructor(definition, options, struct, value, array) {
        super(definition, options, struct, value);
        this.array = array;
    }
    set(value) {
        super.set(value);
        // When value changes, clear the cached `array`
        // It will be lazily calculated in `serialize()`
        this.array = undefined;
    }
    serialize(dataView, array, offset) {
        this.array ??= this.definition.converter.toBuffer(this.value);
        array.set(this.array, offset);
    }
}
//# sourceMappingURL=base.js.map