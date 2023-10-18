import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
export class AutoResetEvent {
    #set;
    #queue = [];
    constructor(initialSet = false) {
        this.#set = initialSet;
    }
    wait() {
        if (!this.#set) {
            this.#set = true;
            if (this.#queue.length === 0) {
                return Promise.resolve();
            }
        }
        const resolver = new PromiseResolver();
        this.#queue.push(resolver);
        return resolver.promise;
    }
    notifyOne() {
        if (this.#queue.length !== 0) {
            this.#queue.pop().resolve();
        }
        else {
            this.#set = false;
        }
    }
    dispose() {
        for (const item of this.#queue) {
            item.reject(new Error("The AutoResetEvent has been disposed"));
        }
        this.#queue.length = 0;
    }
}
//# sourceMappingURL=auto-reset-event.js.map
