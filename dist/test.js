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
        _1.Port.new(socket, {
            echo: function (arg0) { return arg0; },
            read: function (size) { return new Promise(function (resolve, reject) { return crypto_1.default.randomBytes(size, function (error, buffer) { return error ? reject(error) : resolve(buffer); }); }); },
            error: function (message) { throw new Error(message); }
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
                            var error_1;
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!true) return [3 /*break*/, 5];
                                        // await port.exec('echo', 'Hello, world!')
                                        reqCount++;
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, port.exec('error', 'Test')];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_1 = _a.sent();
                                        console.log(error_1);
                                        return [3 /*break*/, 4];
                                    case 4:
                                        resCount++;
                                        return [3 /*break*/, 0];
                                    case 5: return [2 /*return*/];
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
                            }); },
                            function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
                                return tslib_1.__generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 10000); })];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, port.destroy()];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
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
