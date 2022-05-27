"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net_1 = tslib_1.__importDefault(require("net"));
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var _1 = require(".");
var time = function () { return Math.round(Date.now() / 1000); };
var key = '0'.repeat(64);
if (process.argv.length <= 3) {
    net_1.default.createServer(function (socket) {
        var port = new _1.Port(socket, {
            echo: function (arg0) { return arg0; },
            read: function (size) { return new Promise(function (resolve, reject) { return crypto_1.default.randomBytes(size, function (error, buffer) { return error ? reject(error) : resolve(buffer); }); }); }
        }, {
            key: key,
            blockingExecutions: true
        });
    }).listen(Number(process.argv[2]));
}
else {
    var socket_1 = net_1.default.connect({
        host: process.argv[2],
        port: Number(process.argv[3])
    }).on('connect', function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
        var port, reqCount, resCount;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    port = new _1.Port(socket_1, {}, {
                        key: key
                    });
                    reqCount = 0;
                    resCount = 0;
                    return [4 /*yield*/, Promise.all(tslib_1.__spreadArray(tslib_1.__spreadArray([], Array(1000).fill(function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!true) return [3 /*break*/, 2];
                                        // await port.exec('echo', 'Hello, world!')
                                        reqCount++;
                                        return [4 /*yield*/, port.exec('read', 1024 * 4)];
                                    case 1:
                                        _a.sent();
                                        resCount++;
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
                                            console.log('Request sent:', reqCount, 'Response received:', resCount);
                                            reqCount = 0;
                                            resCount = 0;
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
