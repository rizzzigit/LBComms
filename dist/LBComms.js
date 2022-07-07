"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = exports.Server = exports.Port = void 0;
var tslib_1 = require("tslib");
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var net_1 = tslib_1.__importDefault(require("net"));
var lb_serializer_1 = tslib_1.__importDefault(require("@rizzzi/lb-serializer"));
var eventemitter_1 = tslib_1.__importDefault(require("@rizzzi/eventemitter"));
var Port = /** @class */ (function () {
    function Port(socket, callbacks, options) {
        var _this = this;
        this.options = tslib_1.__assign({ blockingExecutions: false }, options);
        this.events = new eventemitter_1.default({ requireErrorHandling: true });
        var _a = this.events.bind(), on = _a.on, once = _a.once, off = _a.off;
        this.on = on;
        this.once = once;
        this.off = off;
        this.serializer = new lb_serializer_1.default.Serializer();
        this.socket = socket;
        this.callbacks = tslib_1.__assign(tslib_1.__assign({}, callbacks), { _np: function () { }, _dc: function () {
                _this._destroyed = true;
            } });
        this._pendingRequests = {};
        this._wrap();
        this._destroyed = false;
    }
    Port.new = function (socket, callbacks, options) {
        return new this(socket, callbacks, options);
    };
    Object.defineProperty(Port.prototype, "destroyed", {
        get: function () {
            if (this._destroyed) {
                return this._destroyed;
            }
            var socket = this.socket;
            if (socket instanceof net_1.default.Socket) {
                return socket.destroyed;
            }
            return (socket.in.destroyed || socket.out.destroyed);
        },
        enumerable: false,
        configurable: true
    });
    Port.prototype.packPayload = function (payload, encrypt) {
        if (encrypt === void 0) { encrypt = !!this.options.key; }
        var serializer = this.serializer;
        var buffer = serializer.serialize(payload);
        if (encrypt) {
            var key = this.options.key;
            if (!key) {
                throw new Error('No key to encrypt');
            }
            var iv = crypto_1.default.randomBytes(16);
            var cipher = crypto_1.default.createCipheriv('aes256', key, iv);
            return Buffer.concat([
                Buffer.from([1]),
                iv,
                cipher.update(buffer),
                cipher.final()
            ]);
        }
        return Buffer.concat([Buffer.from([0]), buffer]);
    };
    Port.prototype.unpackPayload = function (payload) {
        var serializer = this.serializer;
        if (payload[0]) {
            var key = this.options.key;
            if (!key) {
                throw new Error('No key to decrypt');
            }
            var iv = payload.slice(1, 17);
            var buffer = payload.slice(17);
            var decipher = crypto_1.default.createDecipheriv('aes256', key, iv);
            return serializer.deserialize(Buffer.concat([
                decipher.update(buffer),
                decipher.final()
            ]));
        }
        else {
            return serializer.deserialize(payload.slice(1));
        }
    };
    Port.prototype.execLocal = function (name, context) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var callbacks;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        callbacks = this.callbacks;
                        return [4 /*yield*/, callbacks[name].apply(callbacks, tslib_1.__spreadArray([context], args, false))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Port.prototype.exec = function (name) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var pendingRequests, token, tokenStr, promise;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pendingRequests = this._pendingRequests;
                        do {
                            tokenStr = (token = crypto_1.default.randomBytes(8)).toString('hex');
                        } while (tokenStr in pendingRequests);
                        promise = new Promise(function (resolve, reject) { return (pendingRequests[tokenStr] = { resolve: resolve, reject: reject }); });
                        return [4 /*yield*/, this.write([1, token, name, args], undefined)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, promise];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Port.prototype.send = function (data, encrypt) {
        return this.write([0, data], encrypt);
    };
    Port.prototype.destroy = function (error) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var socket;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this._destroyed = true;
                        return [4 /*yield*/, this.exec('_dc', [])];
                    case 1:
                        _a.sent();
                        socket = this.socket;
                        if (socket instanceof net_1.default.Socket) {
                            socket.destroy(error);
                        }
                        else {
                            socket.in.destroy(error);
                            socket.out.destroy(error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype.evaluatePayload = function (payload, isRequestEncrypted) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, events, options, _b;
            var _this = this;
            return tslib_1.__generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = this, events = _a.events, options = _a.options;
                        _b = payload[0];
                        switch (_b) {
                            case 0: return [3 /*break*/, 1];
                            case 1: return [3 /*break*/, 3];
                            case 2: return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, events.emit('data', payload[1])];
                    case 2:
                        _c.sent();
                        return [3 /*break*/, 7];
                    case 3: return [4 /*yield*/, (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                            var token, name, parameters, context, result, error_1;
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        token = payload[1], name = payload[2], parameters = payload[3];
                                        context = {
                                            requestEncrypted: !!options.key,
                                            responseEncrypted: !!options.key
                                        };
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 4, , 6]);
                                        return [4 /*yield*/, this.execLocal.apply(this, tslib_1.__spreadArray([name, context], parameters, false))];
                                    case 2:
                                        result = _a.sent();
                                        return [4 /*yield*/, this.write([2, token, false, result], context.responseEncrypted)];
                                    case 3:
                                        _a.sent();
                                        return [3 /*break*/, 6];
                                    case 4:
                                        error_1 = _a.sent();
                                        return [4 /*yield*/, this.write([2, token, true, error_1], context.responseEncrypted)];
                                    case 5:
                                        _a.sent();
                                        return [3 /*break*/, 6];
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); })()];
                    case 4:
                        _c.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                            var pendingRequests, token, isError, data, tokenStr, _a, resolve, reject;
                            return tslib_1.__generator(this, function (_b) {
                                pendingRequests = this._pendingRequests;
                                token = payload[1], isError = payload[2], data = payload[3];
                                tokenStr = token.toString('hex');
                                if (!(tokenStr in pendingRequests)) {
                                    return [2 /*return*/];
                                }
                                _a = pendingRequests[tokenStr], resolve = _a.resolve, reject = _a.reject;
                                delete pendingRequests[tokenStr];
                                if (isError) {
                                    reject(data);
                                }
                                else {
                                    resolve(data);
                                }
                                return [2 /*return*/];
                            });
                        }); })()];
                    case 6:
                        _c.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype._write = function (buffer) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var socket = _this.socket;
            if (socket instanceof net_1.default.Socket) {
                socket.write(buffer, function (error) { return error ? reject(error) : resolve(); });
            }
            else {
                socket.out.write(buffer, function (error) { return error ? reject(error) : resolve(); });
            }
        });
    };
    Port.prototype.write = function (payload, encrypt) {
        if (payload[1].type === 'Buffer') {
            console.trace(payload[1]);
        }
        var buffer = this.packPayload(payload, encrypt);
        var bufferSize = buffer.length.toString(16);
        if (bufferSize.length % 2) {
            bufferSize = "0".concat(bufferSize);
        }
        var bufferSizeBuffer = Buffer.from(bufferSize, 'hex');
        var bufferSizeBufferLength = Buffer.from([bufferSizeBuffer.length]);
        return this._write(Buffer.concat([bufferSizeBufferLength, bufferSizeBuffer, buffer]));
    };
    Port.prototype._wrap = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, socket, events, options, bufferSink, dataCallback, input, output, error_2, waitForData, tick;
            var _this = this;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this, socket = _a.socket, events = _a.events, options = _a.options;
                        bufferSink = Buffer.alloc(0);
                        if (socket instanceof net_1.default.Socket) {
                            socket.on('error', function (error) { return events.emit('error', error); });
                            socket.on('drain', function () { return events.emit('drain'); });
                            socket.on('finish', function () { return events.emit('finish'); });
                            socket.on('close', function (hadError) {
                                _this._destroyed = false;
                                dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                                events.emit('close', hadError);
                            });
                            socket.on('data', function (buffer) {
                                bufferSink = Buffer.concat([bufferSink, buffer]);
                                dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            });
                        }
                        else {
                            input = socket.in, output = socket.out;
                            input.on('error', function (_error) { return events.emit('error', (error_2 = _error)); });
                            input.on('drain', function () { return events.emit('drain'); });
                            input.on('finish', function () { return events.emit('finish'); });
                            input.on('close', function () {
                                _this._destroyed = false;
                                dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                                events.emit('close', !!error_2);
                            });
                            input.on('data', function (buffer) {
                                bufferSink = Buffer.concat([bufferSink, buffer]);
                                dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            });
                        }
                        waitForData = function () { return new Promise(function (resolve) {
                            dataCallback = function () {
                                dataCallback = undefined;
                                resolve();
                            };
                        }); };
                        tick = function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                            var bufferSizeBufferLength, bufferSizeBuffer, bufferSize, buffer, payload, task;
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!!bufferSink.length) return [3 /*break*/, 2];
                                        return [4 /*yield*/, waitForData()];
                                    case 1:
                                        _a.sent();
                                        _a.label = 2;
                                    case 2:
                                        bufferSizeBufferLength = bufferSink[0];
                                        bufferSizeBuffer = bufferSink.slice(1, bufferSizeBufferLength + 1);
                                        if (!(bufferSizeBufferLength !== bufferSizeBuffer.length)) return [3 /*break*/, 4];
                                        return [4 /*yield*/, waitForData()];
                                    case 3:
                                        _a.sent();
                                        return [2 /*return*/];
                                    case 4:
                                        bufferSize = Number.parseInt("".concat(bufferSizeBuffer.toString('hex')), 16);
                                        buffer = bufferSink.slice(1 + bufferSizeBufferLength, 1 + bufferSizeBufferLength + bufferSize);
                                        if (!(bufferSize !== buffer.length)) return [3 /*break*/, 6];
                                        return [4 /*yield*/, waitForData()];
                                    case 5:
                                        _a.sent();
                                        return [2 /*return*/];
                                    case 6:
                                        bufferSink = bufferSink.slice(1 + bufferSizeBuffer.length + buffer.length);
                                        payload = this.unpackPayload(buffer);
                                        task = this.evaluatePayload(payload, !!buffer[0]);
                                        if (!options.blockingExecutions) return [3 /*break*/, 8];
                                        return [4 /*yield*/, task];
                                    case 7:
                                        _a.sent();
                                        _a.label = 8;
                                    case 8: return [2 /*return*/];
                                }
                            });
                        }); };
                        _b.label = 1;
                    case 1:
                        if (!!(socket instanceof net_1.default.Socket ? socket : socket.in).destroyed) return [3 /*break*/, 3];
                        return [4 /*yield*/, tick().catch(function (error) {
                                if (socket instanceof net_1.default.Socket) {
                                    socket.destroy(error);
                                }
                                else {
                                    socket.in.destroy(error);
                                    socket.out.destroy(error);
                                }
                            })];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype.ping = function (pass) {
        if (pass === void 0) { pass = 1; }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var ms, currentPass, timeDifference;
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if ((pass < 1) || (pass > 100)) {
                            throw new Error("Pass is ".concat(pass, " instead of any number from 1 and 100"));
                        }
                        ms = 0;
                        currentPass = 1;
                        _a.label = 1;
                    case 1:
                        if (!(pass >= currentPass)) return [3 /*break*/, 4];
                        return [4 /*yield*/, (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                return tslib_1.__generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.exec('_np', [])];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/, Date.now()];
                                    }
                                });
                            }); })()];
                    case 2:
                        timeDifference = (_a.sent()) - Date.now();
                        ms = (ms + timeDifference) / currentPass;
                        _a.label = 3;
                    case 3:
                        currentPass++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, ms];
                }
            });
        });
    };
    return Port;
}());
exports.Port = Port;
var Server = /** @class */ (function () {
    function Server(listener, map, options) {
        var _this = this;
        this.options = tslib_1.__assign({ blockingExecutions: false }, options);
        this.listener = listener;
        this.map = map;
        this.events = new eventemitter_1.default({ requireErrorHandling: true });
        var _a = this.events.bind(), on = _a.on, once = _a.once, off = _a.off;
        this.on = on;
        this.once = once;
        this.off = off;
        listener.on('listening', function () { _this.events.emit('listening'); });
        listener.on('close', function () { _this.events.emit('close'); });
        listener.on('connection', function (socket) { _this.events.emit('connection', _this.wrap(socket)); });
        listener.on('error', function (error) { _this.events.emit('error', error); });
    }
    Server.prototype.listen = function (port, hostname) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            try {
                _this.listener.listen(port, hostname, function () {
                    resolve();
                });
            }
            catch (error) {
                reject(error);
            }
        });
    };
    Server.prototype.wrap = function (socket) {
        return Port.new(socket, this.map, this.options);
    };
    return Server;
}());
exports.Server = Server;
var Agent = /** @class */ (function () {
    function Agent(map, options) {
        this.options = tslib_1.__assign({ blockingExecutions: false }, options);
        this.map = map;
    }
    Agent.prototype.connect = function (connectOpts) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var socket = net_1.default.connect(connectOpts);
            socket.once('error', reject);
            socket.on('ready', function () {
                socket.off('error', reject);
                resolve(Port.new(socket, _this.map, _this.options));
            });
        });
    };
    return Agent;
}());
exports.Agent = Agent;
