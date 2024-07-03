// `createTask` allows browser DevTools to track the call stack across async boundaries.
const { console } = globalThis;
export const createTask = console?.createTask?.bind(console) ??
    (() => ({
        run(callback) {
            return callback();
        },
    }));
//# sourceMappingURL=task.js.map