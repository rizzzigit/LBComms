"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net_1 = tslib_1.__importDefault(require("net"));
var _1 = require(".");
net_1.default.createServer(function (socket) {
    var port = new _1.Port(socket, {
        echo: function (arg0) { return arg0; } // Implementations for PortInterface defined above
    });
}).listen(8080);
var socket = net_1.default.connect({
    host: 'localhost',
    port: 8080
}).on('connect', function () { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
    var port, _a, _b;
    return tslib_1.__generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                port = new _1.Port(socket, {});
                _c.label = 1;
            case 1:
                if (!true) return [3 /*break*/, 3];
                _b = (_a = console).log;
                return [4 /*yield*/, port.exec('echo', 'Hello world!')];
            case 2:
                _b.apply(_a, [_c.sent()]);
                return [3 /*break*/, 1];
            case 3: return [2 /*return*/];
        }
    });
}); });
