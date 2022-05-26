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
        this.options = tslib_1.__assign({ blockingEvaluations: false }, options);
        this.serializer = new lb_serializer_1.default.Serializer();
        this.socket = socket;
        this.callbacks = tslib_1.__assign(tslib_1.__assign({}, callbacks), { _np: function () { } });
        this.events = new eventemitter_1.default({ requireErrorHandling: true });
        this.pendingRequests = {};
        this._isQueueRunning = false;
        this._writeQueue = [];
        this._init();
    }
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
            return Buffer.concat([decipher.update(inputBuffer), decipher.final()]);
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
            _this._writeQueue.push({ buffer: buffer, resolve: resolve, reject: reject });
            if (!_this._isQueueRunning) {
                _this._runWriteQueue();
            }
        });
    };
    Port.prototype.evaluatePayload = function (inputBuffer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, events, callbacks, pendingRequests, serializer, payload, data, token, name, parameters, _b, _c, _d, _e, error_1, token, responseType, data, tokenStr, _f, _g, _h, resolve, reject;
            return tslib_1.__generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        _a = this, events = _a.events, callbacks = _a.callbacks, pendingRequests = _a.pendingRequests, serializer = _a.serializer;
                        payload = this.parsePayload(inputBuffer);
                        if (!(payload[0] === PortPayloadType.Raw)) return [3 /*break*/, 2];
                        data = payload[1];
                        return [4 /*yield*/, events.emit('data', data)];
                    case 1:
                        _j.sent();
                        return [3 /*break*/, 10];
                    case 2:
                        if (!(payload[0] === PortPayloadType.Request)) return [3 /*break*/, 9];
                        token = payload[1], name = payload[2], parameters = payload[3];
                        _j.label = 3;
                    case 3:
                        _j.trys.push([3, 6, , 8]);
                        _b = this.writePayload;
                        _c = [PortPayloadType.Response, token, PortPayloadResponseType.Data];
                        _e = (_d = serializer).serialize;
                        return [4 /*yield*/, callbacks[name].apply(callbacks, parameters)];
                    case 4: return [4 /*yield*/, _b.apply(this, _c.concat([_e.apply(_d, [_j.sent()])]))];
                    case 5:
                        _j.sent();
                        return [3 /*break*/, 8];
                    case 6:
                        error_1 = _j.sent();
                        return [4 /*yield*/, this.writePayload(PortPayloadType.Response, token, PortPayloadResponseType.Error, serializer.serialize(error_1))];
                    case 7:
                        _j.sent();
                        return [3 /*break*/, 8];
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        if (payload[0] === PortPayloadType.Response) {
                            token = payload[1], responseType = payload[2], data = payload[3];
                            tokenStr = token.toString('hex');
                            if (tokenStr in pendingRequests) {
                                _f = pendingRequests, _g = tokenStr, _h = _f[_g], resolve = _h.resolve, reject = _h.reject;
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
                        _j.label = 10;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype._init = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, socket, events, blockingEvaluations, bufferSink, dataCallback, waitForData, sizeBuffer, size, dataBuffer;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this, socket = _a.socket, events = _a.events, blockingEvaluations = _a.options.blockingEvaluations;
                        bufferSink = Buffer.alloc(0);
                        waitForData = function () { return new Promise(function (resolve) {
                            dataCallback = function () {
                                resolve();
                                dataCallback = undefined;
                            };
                        }); };
                        socket.on('error', function (error) { return events.emit('error', error); });
                        socket.on('close', function (hadError) {
                            dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            events.emit('close', hadError);
                        });
                        socket.on('data', function (buffer) {
                            bufferSink = Buffer.concat([bufferSink, buffer]);
                            dataCallback === null || dataCallback === void 0 ? void 0 : dataCallback();
                            events.emit('rawData', buffer);
                        });
                        _b.label = 1;
                    case 1:
                        if (!!socket.destroyed) return [3 /*break*/, 11];
                        if (!!bufferSink.length) return [3 /*break*/, 3];
                        return [4 /*yield*/, waitForData()];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        sizeBuffer = bufferSink.slice(1, 1 + bufferSink[0]);
                        if (!(sizeBuffer.length !== bufferSink[0])) return [3 /*break*/, 5];
                        return [4 /*yield*/, waitForData()];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 1];
                    case 5:
                        size = Number.parseInt(sizeBuffer.toString('hex'), 16);
                        dataBuffer = bufferSink.slice(1 + sizeBuffer.length, 1 + sizeBuffer.length + size);
                        if (!(dataBuffer.length !== size)) return [3 /*break*/, 7];
                        return [4 /*yield*/, waitForData()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 1];
                    case 7:
                        bufferSink = bufferSink.slice(1 + sizeBuffer.length + size);
                        if (!blockingEvaluations) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.evaluatePayload(dataBuffer)
                                .catch(function (error) { return events.emit('error', error); })];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        this.evaluatePayload(dataBuffer)
                            .catch(function (error) { return events.emit('error', error); });
                        _b.label = 10;
                    case 10: return [3 /*break*/, 1];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    return Port;
}());
exports.Port = Port;
