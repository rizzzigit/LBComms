"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Port = exports.PortPayloadResponseType = exports.PortPayloadType = void 0;
var tslib_1 = require("tslib");
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var lb_serializer_1 = tslib_1.__importDefault(require("@rizzzi/lb-serializer"));
var eventemitter_1 = tslib_1.__importDefault(require("@rizzzi/eventemitter"));
var PortPayloadType;
(function (PortPayloadType) {
    PortPayloadType[PortPayloadType["Request"] = 0] = "Request";
    PortPayloadType[PortPayloadType["Response"] = 1] = "Response";
    PortPayloadType[PortPayloadType["Raw"] = 2] = "Raw";
})(PortPayloadType = exports.PortPayloadType || (exports.PortPayloadType = {}));
var PortPayloadResponseType;
(function (PortPayloadResponseType) {
    PortPayloadResponseType[PortPayloadResponseType["Data"] = 0] = "Data";
    PortPayloadResponseType[PortPayloadResponseType["Error"] = 1] = "Error";
})(PortPayloadResponseType = exports.PortPayloadResponseType || (exports.PortPayloadResponseType = {}));
var Port = /** @class */ (function () {
    function Port(socket, callbacks, options) {
        var _this = this;
        this.options = tslib_1.__assign({ blockingExecutions: false }, options);
        this.serializer = new lb_serializer_1.default.Serializer();
        this.socket = socket;
        this.callbacks = tslib_1.__assign(tslib_1.__assign({}, callbacks), { _np: function () { }, _d: function () {
                _this.destroyExpected = true;
                _this.socket.destroy();
            } });
        this.events = new eventemitter_1.default({ requireErrorHandling: true });
        this.pendingRequests = {};
        this._isQueueRunning = false;
        this._writeQueue = [];
        if (this.options.key) {
            this.setKey(this.options.key);
        }
        this.destroyExpected = false;
        this._init();
    }
    Port.new = function (socket, callbacks, options) {
        return new this(socket, callbacks, options);
    };
    Port.prototype.writePayload = function () {
        var payload = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            payload[_i] = arguments[_i];
        }
        return this._write(this.buildPayload(payload));
    };
    Port.prototype.write = function (data) {
        this.writePayload(PortPayloadType.Raw, this.serializer.serialize(data));
    };
    Port.prototype.exec = function (name) {
        var _this = this;
        var parameters = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            parameters[_i - 1] = arguments[_i];
        }
        var pendingRequests = this.pendingRequests;
        var token = (function () {
            var token;
            do {
                token = crypto_1.default.randomBytes(16);
            } while (token.toString('hex') in pendingRequests);
            return token;
        })();
        var tokenStr = token.toString('hex');
        return new Promise(function (resolve, reject) {
            pendingRequests[tokenStr] = { resolve: resolve, reject: reject };
            _this.writePayload(PortPayloadType.Request, token, name, parameters)
                .catch(reject);
        });
    };
    Port.prototype.execLocal = function (name) {
        var _a;
        var parameters = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            parameters[_i - 1] = arguments[_i];
        }
        return (_a = this.callbacks)[name].apply(_a, parameters);
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
                                        case 0: return [4 /*yield*/, this.exec('_np')];
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
    Port.prototype.setKey = function (key) {
        if (key.length !== 64) {
            throw new Error('Invalid key length');
        }
        this.key = Buffer.from(key, 'hex');
    };
    Port.prototype.getKey = function () {
        var _a;
        return (_a = this.key) === null || _a === void 0 ? void 0 : _a.toString('hex');
    };
    Port.prototype.encryptPayload = function (inputBuffer) {
        var key = this.key;
        if (key) {
            var initializationVector = crypto_1.default.randomBytes(16);
            var cipher = crypto_1.default.createCipheriv('aes256', key, initializationVector);
            return Buffer.concat([
                Buffer.from([1]),
                initializationVector,
                cipher.update(inputBuffer),
                cipher.final()
            ]);
        }
        else {
            return Buffer.concat([
                Buffer.from([0]),
                inputBuffer
            ]);
        }
    };
    Port.prototype.decryptPayload = function (inputBuffer) {
        var key = this.key;
        if (inputBuffer[0]) {
            if (!key) {
                throw new Error('No key present to decrypt payload');
            }
            var initializationVector = inputBuffer.slice(1, 17);
            var decipher = crypto_1.default.createDecipheriv('aes256', key, initializationVector);
            return Buffer.concat([decipher.update(inputBuffer.slice(17)), decipher.final()]);
        }
        else {
            return inputBuffer.slice(1);
        }
    };
    Port.prototype.buildPayload = function (inputPayload) {
        var type = inputPayload[0];
        var data = inputPayload.slice(1);
        return this.encryptPayload(Buffer.concat([
            Buffer.from([type]),
            this.serializer.serialize(data)
        ]));
    };
    Port.prototype.parsePayload = function (inputBuffer) {
        var decrypted = this.decryptPayload(inputBuffer);
        var type = decrypted[0];
        var data = decrypted.slice(1);
        return tslib_1.__spreadArray([
            type
        ], this.serializer.deserialize(data), true);
    };
    Port.prototype._runWriteQueue = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, writeQueue, socket, buffers, resolves_1, rejects_1, entry, sizeBuffer, concat_1;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this, writeQueue = _a._writeQueue, socket = _a.socket;
                        if (this._isQueueRunning) {
                            return [2 /*return*/];
                        }
                        this._isQueueRunning = true;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, , 3, 4]);
                        buffers = [];
                        resolves_1 = [];
                        rejects_1 = [];
                        while (writeQueue.length) {
                            entry = writeQueue.shift();
                            sizeBuffer = Buffer.from((function (hex) { return hex.length % 2 ? "0".concat(hex) : hex; })(entry.buffer.length.toString(16)), 'hex');
                            buffers.push(Buffer.from([sizeBuffer.length]), sizeBuffer, entry.buffer);
                            resolves_1.push(entry.resolve);
                            rejects_1.push(entry.reject);
                        }
                        concat_1 = Buffer.concat(buffers);
                        return [4 /*yield*/, new Promise(function (resolve, reject) { return socket.write(concat_1, function (error) { return error ? reject(error) : resolve(); }); })
                                .then(function () { return resolves_1.forEach(function (f) { return f(); }); })
                                .catch(function (error) { return rejects_1.forEach(function (f) { return f(error); }); })];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this._isQueueRunning = false;
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype._write = function (buffer) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.socket.destroyed) {
                throw new Error('Socket is closed');
            }
            _this._writeQueue.push({ buffer: buffer, resolve: resolve, reject: reject });
            if (!_this._isQueueRunning) {
                _this._runWriteQueue();
            }
        });
    };
    Port.prototype.executePayload = function (inputBuffer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, events, pendingRequests, serializer, payload, data, token, name, parameters, _b, _c, _e, _f, error_1, token, responseType, data, tokenStr, _g, _h, _j, resolve, reject;
            return tslib_1.__generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        _a = this, events = _a.events, pendingRequests = _a.pendingRequests, serializer = _a.serializer;
                        payload = this.parsePayload(inputBuffer);
                        if (!(payload[0] === PortPayloadType.Raw)) return [3 /*break*/, 2];
                        data = payload[1];
                        return [4 /*yield*/, events.emit('data', data)];
                    case 1:
                        _k.sent();
                        return [3 /*break*/, 10];
                    case 2:
                        if (!(payload[0] === PortPayloadType.Request)) return [3 /*break*/, 9];
                        token = payload[1], name = payload[2], parameters = payload[3];
                        _k.label = 3;
                    case 3:
                        _k.trys.push([3, 6, , 8]);
                        _b = this.writePayload;
                        _c = [PortPayloadType.Response, token, PortPayloadResponseType.Data];
                        _f = (_e = serializer).serialize;
                        return [4 /*yield*/, this.execLocal.apply(this, tslib_1.__spreadArray([name], parameters, false))];
                    case 4: return [4 /*yield*/, _b.apply(this, _c.concat([_f.apply(_e, [_k.sent()])]))];
                    case 5:
                        _k.sent();
                        return [3 /*break*/, 8];
                    case 6:
                        error_1 = _k.sent();
                        return [4 /*yield*/, this.writePayload(PortPayloadType.Response, token, PortPayloadResponseType.Error, serializer.serialize(error_1))];
                    case 7:
                        _k.sent();
                        return [3 /*break*/, 8];
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        if (payload[0] === PortPayloadType.Response) {
                            token = payload[1], responseType = payload[2], data = payload[3];
                            tokenStr = token.toString('hex');
                            if (tokenStr in pendingRequests) {
                                _g = pendingRequests, _h = tokenStr, _j = _g[_h], resolve = _j.resolve, reject = _j.reject;
                                delete pendingRequests[tokenStr];
                                if (responseType === PortPayloadResponseType.Data) {
                                    resolve(serializer.deserialize(data));
                                }
                                else if (responseType === PortPayloadResponseType.Error) {
                                    reject(serializer.deserialize(data));
                                }
                                else {
                                    throw new Error("Unknown response type: 0x".concat(responseType.toString(16)));
                                }
                            }
                        }
                        _k.label = 10;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype.destroy = function (error) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!error) return [3 /*break*/, 1];
                        this.socket.destroy(error);
                        return [3 /*break*/, 3];
                    case 1:
                        this.destroyExpected = true;
                        return [4 /*yield*/, this.exec('_d')];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype._init = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, socket, events, blockingExecutions, pendingRequests, bufferSink, dataCallback, waitForData, sizeBuffer, size, dataBuffer, tokenStr, _b, _c, reject;
            var _this = this;
            return tslib_1.__generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _a = this, socket = _a.socket, events = _a.events, blockingExecutions = _a.options.blockingExecutions, pendingRequests = _a.pendingRequests;
                        bufferSink = Buffer.alloc(0);
                        waitForData = function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                            return tslib_1.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (this.destroyExpected || socket.destroyed) {
                                            return [2 /*return*/];
                                        }
                                        return [4 /*yield*/, new Promise(function (resolve) {
                                                dataCallback = function () {
                                                    resolve();
                                                    dataCallback = undefined;
                                                };
                                            })];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        socket.on('error', function (error) { return (!_this.destroyExpected) && events.emit('error', error); });
                        socket.on('close', function (hadError) {
                            dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            events.emit('close', hadError);
                        });
                        socket.on('data', function (buffer) {
                            bufferSink = Buffer.concat([bufferSink, buffer]);
                            dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            events.emit('rawData', buffer);
                        });
                        _e.label = 1;
                    case 1:
                        if (!((!socket.destroyed) && (!this.destroyExpected))) return [3 /*break*/, 11];
                        if (!!bufferSink.length) return [3 /*break*/, 3];
                        return [4 /*yield*/, waitForData()];
                    case 2:
                        _e.sent();
                        _e.label = 3;
                    case 3:
                        sizeBuffer = bufferSink.slice(1, 1 + bufferSink[0]);
                        if (!(sizeBuffer.length !== bufferSink[0])) return [3 /*break*/, 5];
                        return [4 /*yield*/, waitForData()];
                    case 4:
                        _e.sent();
                        return [3 /*break*/, 1];
                    case 5:
                        size = Number.parseInt(sizeBuffer.toString('hex'), 16);
                        dataBuffer = bufferSink.slice(1 + sizeBuffer.length, 1 + sizeBuffer.length + size);
                        if (!(dataBuffer.length !== size)) return [3 /*break*/, 7];
                        return [4 /*yield*/, waitForData()];
                    case 6:
                        _e.sent();
                        return [3 /*break*/, 1];
                    case 7:
                        bufferSink = bufferSink.slice(1 + sizeBuffer.length + size);
                        if (!blockingExecutions) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.executePayload(dataBuffer)
                                .catch(function (error) { return events.emit('error', error); })];
                    case 8:
                        _e.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        this.executePayload(dataBuffer)
                            .catch(function (error) { return events.emit('error', error); });
                        _e.label = 10;
                    case 10: return [3 /*break*/, 1];
                    case 11:
                        for (tokenStr in pendingRequests) {
                            _b = pendingRequests, _c = tokenStr, reject = _b[_c].reject;
                            delete pendingRequests[tokenStr];
                            reject(new Error('Socket is closed'));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return Port;
}());
exports.Port = Port;
