/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { StructFieldValue } from "../../basic/index.js";
import { BufferLikeFieldDefinition, BufferLikeFieldValue } from "./base.js";
export class VariableLengthBufferLikeFieldDefinition extends BufferLikeFieldDefinition {
    getSize() {
        return 0;
    }
    getDeserializeSize(struct) {
        let value = struct.value[this.options.lengthField];
        if (typeof value === "string") {
            value = Number.parseInt(value, this.options.lengthFieldRadix ?? 10);
        }
        return value;
    }
    create(options, struct, value, array) {
        return new VariableLengthBufferLikeStructFieldValue(this, options, struct, value, array);
    }
}
export class VariableLengthBufferLikeStructFieldValue extends BufferLikeFieldValue {
    length;
    lengthFieldValue;
    constructor(definition, options, struct, value, array) {
        super(definition, options, struct, value, array);
        if (array) {
            this.length = array.length;
        }
        // Patch the associated length field.
        const lengthField = this.definition.options.lengthField;
        const originalValue = struct.get(lengthField);
        this.lengthFieldValue = new VariableLengthBufferLikeFieldLengthValue(originalValue, this);
        struct.set(lengthField, this.lengthFieldValue);
    }
    #tryGetSize() {
        const length = this.definition.converter.getSize(this.value);
        if (length !== undefined && length < 0) {
            throw new Error("Invalid length");
        }
        return length;
    }
    getSize() {
        if (this.length === undefined) {
            // first try to get the size from the converter
            this.length = this.#tryGetSize();
        }
        if (this.length === undefined) {
            // The converter doesn't know the size, so convert the value to a buffer to get its size
            this.array = this.definition.converter.toBuffer(this.value);
            this.length = this.array.length;
        }
        return this.length;
    }
    set(value) {
        super.set(value);
        this.array = undefined;
        this.length = undefined;
    }
}
export class VariableLengthBufferLikeFieldLengthValue extends StructFieldValue {
    originalValue;
    bufferValue;
    constructor(originalValue, bufferValue) {
        super(originalValue.definition, originalValue.options, originalValue.struct, 0);
        this.originalValue = originalValue;
        this.bufferValue = bufferValue;
    }
    getSize() {
        return this.originalValue.getSize();
    }
    get() {
        let value = this.bufferValue.getSize();
        const originalValue = this.originalValue.get();
        if (typeof originalValue === "string") {
            value = value.toString(this.bufferValue.definition.options.lengthFieldRadix ?? 10);
        }
        return value;
    }
    set() {
        // Ignore setting
        // It will always be in sync with the buffer size
    }
    serialize(dataView, array, offset) {
        this.originalValue.set(this.get());
        this.originalValue.serialize(dataView, array, offset);
    }
}
//# sourceMappingURL=variable-length.js.map