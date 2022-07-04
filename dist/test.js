"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net_1 = tslib_1.__importDefault(require("net"));
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var _1 = tslib_1.__importDefault(require("."));
var time = function () { return Math.round(Date.now() / 1000); };
var key = Buffer.from('0'.repeat(64), 'hex');
var run = function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
    var map, server, client, connection, timeout, count;
    return tslib_1.__generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                map = {
                    echo: function (_, arg0) { return arg0; },
                    read: function (_, size) { return new Promise(function (resolve, reject) { return crypto_1.default.randomBytes(size, function (error, buffer) { return error ? reject(error) : resolve(buffer); }); }); },
                    error: function (_, message) { throw new Error(message); }
                };
                if (!(process.argv.length <= 3)) return [3 /*break*/, 2];
                server = new _1.default.Server(net_1.default.createServer(), map, { key: key });
                return [4 /*yield*/, server.listen(Number(process.argv[2]))];
            case 1:
                _a.sent();
                return [3 /*break*/, 8];
            case 2:
                client = new _1.default.Agent(map, { key: key });
                return [4 /*yield*/, client.connect({
                        host: process.argv[2],
                        port: Number(process.argv[3])
                    })];
            case 3:
                connection = _a.sent();
                timeout = Date.now() + 10000;
                count = 0;
                _a.label = 4;
            case 4:
                if (!true) return [3 /*break*/, 6];
                console.log(++count);
                return [4 /*yield*/, connection.exec('read', 16 * 1024)];
            case 5:
                _a.sent();
                if (timeout < Date.now()) {
                    return [3 /*break*/, 6];
                }
                return [3 /*break*/, 4];
            case 6: return [4 /*yield*/, connection.destroy()];
            case 7:
                _a.sent();
                _a.label = 8;
            case 8: return [2 /*return*/];
        }
    });
}); };
run();
