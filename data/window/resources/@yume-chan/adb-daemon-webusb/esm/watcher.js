export class AdbDaemonWebUsbDeviceWatcher {
    #callback;
    #usbManager;
    constructor(callback, usb) {
        this.#callback = callback;
        this.#usbManager = usb;
        this.#usbManager.addEventListener("connect", this.#handleConnect);
        this.#usbManager.addEventListener("disconnect", this.#handleDisconnect);
    }
    dispose() {
        this.#usbManager.removeEventListener("connect", this.#handleConnect);
        this.#usbManager.removeEventListener("disconnect", this.#handleDisconnect);
    }
    #handleConnect = (e) => {
        this.#callback(e.device.serialNumber);
    };
    #handleDisconnect = () => {
        this.#callback();
    };
}
//# sourceMappingURL=watcher.js.map