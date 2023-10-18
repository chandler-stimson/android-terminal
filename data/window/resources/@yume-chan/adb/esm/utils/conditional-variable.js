import { PromiseResolver } from "/data/window/resources/@yume-chan/async/esm/index.js";
export class ConditionalVariable {
    #locked = false;
    #queue = [];
    wait(condition) {
        if (!this.#locked) {
            this.#locked = true;
            if (this.#queue.length === 0 && condition()) {
                return Promise.resolve();
            }
        }
        const resolver = new PromiseResolver();
        this.#queue.push({ condition, resolver });
        return resolver.promise;
    }
    notifyOne() {
        const entry = this.#queue.shift();
        if (entry) {
            if (entry.condition()) {
                entry.resolver.resolve();
            }
        }
        else {
            this.#locked = false;
        }
    }
    dispose() {
        for (const item of this.#queue) {
            item.resolver.reject(new Error("The ConditionalVariable has been disposed"));
        }
        this.#queue.length = 0;
    }
}
//# sourceMappingURL=conditional-variable.js.map
