import { ExactReadableEndedError, STRUCT_VALUE_SYMBOL, StructDefaultOptions, StructValue, } from "./basic/index.js";
import { SyncPromise } from "./sync-promise.js";
import { BigIntFieldDefinition, BigIntFieldType, FixedLengthBufferLikeFieldDefinition, NumberFieldDefinition, NumberFieldType, StringBufferFieldSubType, Uint8ArrayBufferFieldSubType, VariableLengthBufferLikeFieldDefinition, } from "./types/index.js";
export class StructDeserializeError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class StructNotEnoughDataError extends StructDeserializeError {
    constructor() {
        super("The underlying readable was ended before the struct was fully deserialized");
    }
}
export class StructEmptyError extends StructDeserializeError {
    constructor() {
        super("The underlying readable doesn't contain any more struct");
    }
}
export class Struct {
    TFields;
    TOmitInitKey;
    TExtra;
    TInit;
    TDeserializeResult;
    options;
    #size = 0;
    /**
     * Gets the static size (exclude fields that can change size at runtime)
     */
    get size() {
        return this.#size;
    }
    #fields = [];
    get fields() {
        return this.#fields;
    }
    #extra = {};
    #postDeserialized;
    constructor(options) {
        this.options = { ...StructDefaultOptions, ...options };
    }
    /**
     * Appends a `StructFieldDefinition` to the `Struct
     */
    field(name, definition) {
        for (const field of this.#fields) {
            if (field[0] === name) {
                // Convert Symbol to string
                const nameString = String(name);
                throw new Error(`This struct already have a field with name '${nameString}'`);
            }
        }
        this.#fields.push([name, definition]);
        const size = definition.getSize();
        this.#size += size;
        // Force cast `this` to another type
        return this;
    }
    /**
     * Merges (flats) another `Struct`'s fields and extra fields into this one.
     */
    concat(other) {
        for (const field of other.#fields) {
            this.#fields.push(field);
        }
        this.#size += other.#size;
        Object.defineProperties(this.#extra, Object.getOwnPropertyDescriptors(other.#extra));
        return this;
    }
    #number(name, type, typeScriptType) {
        return this.field(name, new NumberFieldDefinition(type, typeScriptType));
    }
    /**
     * Appends an `int8` field to the `Struct`
     */
    int8(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Int8, typeScriptType);
    }
    /**
     * Appends an `uint8` field to the `Struct`
     */
    uint8(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Uint8, typeScriptType);
    }
    /**
     * Appends an `int16` field to the `Struct`
     */
    int16(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Int16, typeScriptType);
    }
    /**
     * Appends an `uint16` field to the `Struct`
     */
    uint16(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Uint16, typeScriptType);
    }
    /**
     * Appends an `int32` field to the `Struct`
     */
    int32(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Int32, typeScriptType);
    }
    /**
     * Appends an `uint32` field to the `Struct`
     */
    uint32(name, typeScriptType) {
        return this.#number(name, NumberFieldType.Uint32, typeScriptType);
    }
    #bigint(name, type, typeScriptType) {
        return this.field(name, new BigIntFieldDefinition(type, typeScriptType));
    }
    /**
     * Appends an `int64` field to the `Struct`
     *
     * Requires native `BigInt` support
     */
    int64(name, typeScriptType) {
        return this.#bigint(name, BigIntFieldType.Int64, typeScriptType);
    }
    /**
     * Appends an `uint64` field to the `Struct`
     *
     * Requires native `BigInt` support
     */
    uint64(name, typeScriptType) {
        return this.#bigint(name, BigIntFieldType.Uint64, typeScriptType);
    }
    #arrayBufferLike = (name, type, options) => {
        if ("length" in options) {
            return this.field(name, new FixedLengthBufferLikeFieldDefinition(type, options));
        }
        else {
            return this.field(name, new VariableLengthBufferLikeFieldDefinition(type, options));
        }
    };
    uint8Array = (name, options, typeScriptType) => {
        return this.#arrayBufferLike(name, Uint8ArrayBufferFieldSubType.Instance, options, typeScriptType);
    };
    string = (name, options, typeScriptType) => {
        return this.#arrayBufferLike(name, StringBufferFieldSubType.Instance, options, typeScriptType);
    };
    /**
     * Adds some extra properties into every `Struct` value.
     *
     * Extra properties will not affect serialize or deserialize process.
     *
     * Multiple calls to `extra` will merge all properties together.
     *
     * @param value
     * An object containing properties to be added to the result value. Accessors and methods are also allowed.
     */
    extra(value) {
        Object.defineProperties(this.#extra, Object.getOwnPropertyDescriptors(value));
        return this;
    }
    postDeserialize(callback) {
        this.#postDeserialized = callback;
        return this;
    }
    deserialize(stream) {
        const structValue = new StructValue(this.#extra);
        let promise = SyncPromise.resolve();
        const startPosition = stream.position;
        for (const [name, definition] of this.#fields) {
            promise = promise
                .then(() => definition.deserialize(this.options, stream, structValue))
                .then((fieldValue) => {
                structValue.set(name, fieldValue);
            }, (e) => {
                if (!(e instanceof ExactReadableEndedError)) {
                    throw e;
                }
                if (stream.position === startPosition) {
                    throw new StructEmptyError();
                }
                else {
                    throw new StructNotEnoughDataError();
                }
            });
        }
        return promise
            .then(() => {
            const value = structValue.value;
            // Run `postDeserialized`
            if (this.#postDeserialized) {
                const override = this.#postDeserialized.call(value, value);
                // If it returns a new value, use that as result
                // Otherwise it only inspects/mutates the object in place.
                if (override !== undefined) {
                    return override;
                }
            }
            return value;
        })
            .valueOrPromise();
    }
    serialize(init, output) {
        let structValue;
        if (STRUCT_VALUE_SYMBOL in init) {
            structValue = init[STRUCT_VALUE_SYMBOL];
            for (const [key, value] of Object.entries(init)) {
                const fieldValue = structValue.get(key);
                if (fieldValue) {
                    fieldValue.set(value);
                }
            }
        }
        else {
            structValue = new StructValue({});
            for (const [name, definition] of this.#fields) {
                const fieldValue = definition.create(this.options, structValue, init[name]);
                structValue.set(name, fieldValue);
            }
        }
        let structSize = 0;
        const fieldsInfo = [];
        for (const [name] of this.#fields) {
            const fieldValue = structValue.get(name);
            const size = fieldValue.getSize();
            fieldsInfo.push({ fieldValue, size });
            structSize += size;
        }
        let outputType = "number";
        if (!output) {
            output = new Uint8Array(structSize);
            outputType = "Uint8Array";
        }
        const dataView = new DataView(output.buffer, output.byteOffset, output.byteLength);
        let offset = 0;
        for (const { fieldValue, size } of fieldsInfo) {
            fieldValue.serialize(dataView, offset);
            offset += size;
        }
        if (outputType === "number") {
            return structSize;
        }
        else {
            return output;
        }
    }
}
//# sourceMappingURL=struct.js.map