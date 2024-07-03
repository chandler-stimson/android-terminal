import { Consumable } from "./consumable.js";
import { WritableStream as NativeWritableStream, TransformStream, } from "./stream.js";
export var MaybeConsumable;
(function (MaybeConsumable) {
    function getValue(value) {
        return value instanceof Consumable ? value.value : value;
    }
    MaybeConsumable.getValue = getValue;
    function tryConsume(value, callback) {
        if (value instanceof Consumable) {
            return value.tryConsume(callback);
        }
        else {
            return callback(value);
        }
    }
    MaybeConsumable.tryConsume = tryConsume;
    class UnwrapStream extends TransformStream {
        constructor() {
            super({
                transform(chunk, controller) {
                    MaybeConsumable.tryConsume(chunk, (chunk) => {
                        controller.enqueue(chunk);
                    });
                },
            });
        }
    }
    MaybeConsumable.UnwrapStream = UnwrapStream;
    class WritableStream extends NativeWritableStream {
        constructor(sink, strategy) {
            let wrappedStrategy;
            if (strategy) {
                wrappedStrategy = {};
                if ("highWaterMark" in strategy) {
                    wrappedStrategy.highWaterMark = strategy.highWaterMark;
                }
                if ("size" in strategy) {
                    wrappedStrategy.size = (chunk) => {
                        return strategy.size(chunk instanceof Consumable ? chunk.value : chunk);
                    };
                }
            }
            super({
                start(controller) {
                    return sink.start?.(controller);
                },
                async write(chunk, controller) {
                    await MaybeConsumable.tryConsume(chunk, (chunk) => sink.write?.(chunk, controller));
                },
                abort(reason) {
                    return sink.abort?.(reason);
                },
                close() {
                    return sink.close?.();
                },
            }, wrappedStrategy);
        }
    }
    MaybeConsumable.WritableStream = WritableStream;
})(MaybeConsumable || (MaybeConsumable = {}));
//# sourceMappingURL=maybe-consumable.js.map