"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net_1 = tslib_1.__importDefault(require("net"));
// import Crypto from 'crypto'
var _1 = require(".");
var time = function () { return Math.round(Date.now() / 1000); };
if (process.argv.length <= 3) {
    net_1.default.createServer(function (socket) {
        var port = new _1.Port(socket, {
            echo: function (arg0) { return arg0; } // Implementations for PortInterface defined above
        });
    }).listen(Number(process.argv[2]));
}
else {
    var socket_1 = net_1.default.connect({
        host: process.argv[2],
        port: Number(process.argv[3])
    }).on('connect', function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
        var port, count;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    port = new _1.Port(socket_1, {});
                    count = 0;
                    return [4 /*yield*/, Promise.all(tslib_1.__spreadArray(tslib_1.__spreadArray([], Array(2000).fill(function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!true) return [3 /*break*/, 2];
                                        return [4 /*yield*/, port.exec('echo', 'Hello, world!')];
                                    case 1:
                                        _a.sent();
                                        count++;
                                        return [3 /*break*/, 0];
                                    case 2: return [2 /*return*/];
                                }
                            });
                        }); }), true), [
                            function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
                                return tslib_1.__generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!true) return [3 /*break*/, 2];
                                            console.log(count);
                                            count = 0;
                                            return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                                        case 1:
                                            _a.sent();
                                            return [3 /*break*/, 0];
                                        case 2: return [2 /*return*/];
                                    }
                                });
                            }); }
                        ], false).map(function (f) { return f(); }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
}
