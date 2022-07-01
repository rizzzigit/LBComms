"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net_1 = tslib_1.__importDefault(require("net"));
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var _1 = tslib_1.__importDefault(require("."));
var time = function () { return Math.round(Date.now() / 1000); };
var key = '0'.repeat(64);
var run = function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
    var map, server, client, connection, _a, _b;
    return tslib_1.__generator(this, function (_c) {
        switch (_c.label) {
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
                _c.sent();
                return [3 /*break*/, 5];
            case 2:
                client = new _1.default.Agent(map, { key: key });
                return [4 /*yield*/, client.connect({
                        host: process.argv[2],
                        port: Number(process.argv[3])
                    })];
            case 3:
                connection = _c.sent();
                console.log(connection);
                _b = (_a = console).log;
                return [4 /*yield*/, connection.exec('echo', 'Hello')];
            case 4:
                _b.apply(_a, [_c.sent()]);
                _c.label = 5;
            case 5: return [2 /*return*/];
        }
    });
}); };
run();
