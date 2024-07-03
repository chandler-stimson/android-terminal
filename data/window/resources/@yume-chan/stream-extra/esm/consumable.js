import { PromiseResolver } from "@yume-chan/async";
import { ReadableStream as NativeReadableStream, WritableStream as NativeWritableStream, } from "./stream.js";
import { createTask } from "./task.js";
function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
}
export class Consumable {
    #task;
    #resolver;
    value;
    consumed;
    constructor(value) {
        this.#task = createTask("Consumable");
        this.value = value;
        this.#resolver = new PromiseResolver();
        this.consumed = this.#resolver.promise;
    }
    consume() {
        this.#resolver.resolve();
    }
    error(error) {
        this.#resolver.reject(error);
    }
    tryConsume(callback) {
        try {
            let result = this.#task.run(() => callback(this.value));
            if (isPromiseLike(result)) {
                result = result.then((value) => {
                    this.#resolver.resolve();
                    return value;
                }, (e) => {
                    this.#resolver.reject(e);
                    throw e;
                });
            }
            else {
                this.#resolver.resolve();
            }
            return result;
        }
        catch (e) {
            this.#resolver.reject(e);
            throw e;
        }
    }
}
(function (Consumable) {
    class WritableStream extends NativeWritableStream {
        static async write(writer, value) {
            const consumable = new Consumable(value);
            await writer.write(consumable);
            await consumable.consumed;
        }
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
                    await chunk.tryConsume((chunk) => sink.write?.(chunk, controller));
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
    Consumable.WritableStream = WritableStream;
    class ReadableStream extends NativeReadableStream {
        static async enqueue(controller, chunk) {
            const output = new Consumable(chunk);
            controller.enqueue(output);
            await output.consumed;
        }
        constructor(source, strategy) {
            let wrappedController;
            let wrappedStrategy;
            if (strategy) {
                wrappedStrategy = {};
                if ("highWaterMark" in strategy) {
                    wrappedStrategy.highWaterMark = strategy.highWaterMark;
                }
                if ("size" in strategy) {
                    wrappedStrategy.size = (chunk) => {
                        return strategy.size(chunk.value);
                    };
                }
            }
            super({
                async start(controller) {
                    wrappedController = {
                        async enqueue(chunk) {
                            await ReadableStream.enqueue(controller, chunk);
                        },
                        close() {
                            controller.close();
                        },
                        error(reason) {
                            controller.error(reason);
                        },
                    };
                    await source.start?.(wrappedController);
                },
                async pull() {
                    await source.pull?.(wrappedController);
                },
                async cancel(reason) {
                    await source.cancel?.(reason);
                },
            }, wrappedStrategy);
        }
    }
    Consumable.ReadableStream = ReadableStream;
})(Consumable || (Consumable = {}));
//# sourceMappingURL=consumable.js.map