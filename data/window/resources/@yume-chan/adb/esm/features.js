// The order follows
// https://cs.android.com/android/platform/superproject/+/master:packages/modules/adb/transport.cpp;l=77;drc=6d14d35d0241f6fee145f8e54ffd77252e8d29fd
export var AdbFeature;
(function (AdbFeature) {
    AdbFeature["ShellV2"] = "shell_v2";
    AdbFeature["Cmd"] = "cmd";
    AdbFeature["StatV2"] = "stat_v2";
    AdbFeature["ListV2"] = "ls_v2";
    AdbFeature["FixedPushMkdir"] = "fixed_push_mkdir";
    AdbFeature["Abb"] = "abb";
    AdbFeature["AbbExec"] = "abb_exec";
    AdbFeature["SendReceiveV2"] = "sendrecv_v2";
    AdbFeature["DelayedAck"] = "delayed_ack";
})(AdbFeature || (AdbFeature = {}));
//# sourceMappingURL=features.js.map