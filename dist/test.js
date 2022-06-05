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
            echo: function (_, arg0) { return arg0; },
            read: function (_, size) { return new Promise(function (resolve, reject) { return crypto_1.default.randomBytes(size, function (error, buffer) { return error ? reject(error) : resolve(buffer); }); }); },
            error: function (_, message) { throw new Error(message); }
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
        var port;
        return tslib_1.__generator(this, function (_a) {
            port = new _1.Port(socket_1, {}, {
                key: key
            });
            port.exec('test');
            return [2 /*return*/];
        });
    }); });
}
