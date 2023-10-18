export function isErrorName(e, name) {
    // node-usb package doesn't use `DOMException`,
    // so use a looser check
    // https://github.com/node-usb/node-usb/issues/573
    return (typeof e === "object" && e !== null && "name" in e && e.name === name);
}
function alternateMatchesFilter(alternate, filters) {
    return filters.some((filter) => alternate.interfaceClass === filter.classCode &&
        alternate.interfaceSubclass === filter.subclassCode &&
        alternate.interfaceProtocol === filter.protocolCode);
}
export function findUsbAlternateInterface(device, filters) {
    for (const configuration of device.configurations) {
        for (const interface_ of configuration.interfaces) {
            for (const alternate of interface_.alternates) {
                if (alternateMatchesFilter(alternate, filters)) {
                    return { configuration, interface_, alternate };
                }
            }
        }
    }
    throw new Error("No matched alternate interface found");
}
//# sourceMappingURL=utils.js.map