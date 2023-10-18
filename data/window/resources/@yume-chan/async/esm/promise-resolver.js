var PromiseResolver = (function () {
    function PromiseResolver() {
        var _this = this;
        this._state = 'running';
        this.resolve = function (value) {
            _this._resolve(value);
            _this._state = 'resolved';
        };
        this.reject = function (reason) {
            _this._reject(reason);
            _this._state = 'rejected';
        };
        this._promise = new Promise(function (resolve, reject) {
            _this._resolve = resolve;
            _this._reject = reject;
        });
    }
    Object.defineProperty(PromiseResolver.prototype, "promise", {
        get: function () { return this._promise; },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PromiseResolver.prototype, "state", {
        get: function () { return this._state; },
        enumerable: false,
        configurable: true
    });
    return PromiseResolver;
}());
export { PromiseResolver };
//# sourceMappingURL=promise-resolver.js.map