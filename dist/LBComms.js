"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Port = exports.PortCommand = void 0;
var tslib_1 = require("tslib");
var crypto_1 = tslib_1.__importDefault(require("crypto"));
var lb_serializer_1 = tslib_1.__importDefault(require("@rizzzi/lb-serializer"));
var PortCommand;
(function (PortCommand) {
    PortCommand[PortCommand["SetDelimiter"] = 0] = "SetDelimiter";
    PortCommand[PortCommand["Request"] = 1] = "Request";
    PortCommand[PortCommand["Response"] = 2] = "Response";
    PortCommand[PortCommand["Padding"] = 3] = "Padding";
})(PortCommand = exports.PortCommand || (exports.PortCommand = {}));
var Port = /** @class */ (function () {
    function Port(socket, callbacks, options) {
        this.options = tslib_1.__assign({ randomBytesSize: 4, blockingEvaluations: false }, options);
        this.socket = socket;
        this.serializer = new lb_serializer_1.default.Serializer({
            ranodmBytesSize: this.options.randomBytesSize
        });
        this.encryption = {
            key: this.options.key ? Buffer.from(this.options.key, 'hex') : undefined
        };
        this.callbacks = tslib_1.__assign(tslib_1.__assign({}, callbacks), { np: function () { } });
        this.pendingRemoteCalls = {};
        this.isWriteQueueRunning = false;
        this.writeQueue = [];
        this.delimiter = {
            local: Buffer.alloc(0),
            remote: Buffer.alloc(0)
        };
        this._init();
    }
    Port.prototype.ping = function (passCount) {
        if (passCount === void 0) { passCount = 1; }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var ping, pass, start, stop;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ping = 0;
                        pass = 0;
                        _a.label = 1;
                    case 1:
                        if (!(passCount > pass)) return [3 /*break*/, 4];
                        start = Date.now();
                        return [4 /*yield*/, this.exec('np')];
                    case 2:
                        _a.sent();
                        stop = Date.now();
                        ping += (stop - start);
                        _a.label = 3;
                    case 3:
                        pass++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, ping / passCount];
                }
            });
        });
    };
    Port.prototype.buildRequest = function (token, name) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        return Buffer.concat([token, this.serializer.serialize({ name: name, args: args })]);
    };
    Port.prototype.parseRequest = function (buffer) {
        var randomBytesSize = this.options.randomBytesSize;
        var token = buffer.slice(0, randomBytesSize);
        var _a = this.serializer.deserialize(buffer.slice(token.length)), name = _a.name, args = _a.args;
        return { token: token, name: name, args: args };
    };
    Port.prototype.buildRseponse = function (token, result) {
        var buffer = Buffer.concat([token, this.serializer.serialize(result)]);
        return buffer;
    };
    Port.prototype.parseResponse = function (buffer) {
        var randomBytesSize = this.options.randomBytesSize;
        var token = buffer.slice(0, randomBytesSize);
        var data = this.serializer.deserialize(buffer.slice(randomBytesSize));
        return { token: token, data: data };
    };
    Port.prototype.encrypt = function (buffer) {
        if (this.encryption.key) {
            var iv = crypto_1.default.randomBytes(16);
            var cipher = crypto_1.default.createCipheriv('aes256', this.encryption.key, iv);
            return Buffer.concat([
                Buffer.from([0]),
                iv,
                cipher.update(buffer),
                cipher.final()
            ]);
        }
        else {
            return Buffer.concat([
                Buffer.from([1]),
                buffer
            ]);
        }
    };
    Port.prototype.decrypt = function (buffer) {
        if (buffer[0] === 0) {
            var iv = buffer.slice(1, 17);
            if (!this.encryption.key) {
                throw new Error('No encryption key specified to decrypt the buffer');
            }
            var decipher = crypto_1.default.createDecipheriv('aes256', this.encryption.key, iv);
            return Buffer.concat([
                decipher.update(buffer.slice(17)),
                decipher.final()
            ]);
        }
        else if (buffer[0] === 1) {
            return buffer.slice(1);
        }
        else {
            throw new Error("Invalid byte: 0x".concat(buffer.slice(0, 1).toString('hex')));
        }
    };
    Port.prototype.buildPayload = function (command) {
        var data = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            data[_i - 1] = arguments[_i];
        }
        var buffer = Buffer.concat(tslib_1.__spreadArray([Buffer.from([command])], data, true));
        return this.encrypt(buffer);
    };
    Port.prototype.parsePayload = function (buffer) {
        var decrypt = this.decrypt(buffer);
        var command = decrypt[0];
        var argData = decrypt.slice(1);
        return { command: command, argData: argData };
    };
    Port.prototype.sendPayload = function (buffer) {
        var _a = this, delimiter = _a.delimiter, randomBytesSize = _a.options.randomBytesSize;
        var sink = Buffer.alloc(0);
        if (!delimiter.local.length) {
            var newDelimiter = crypto_1.default.randomBytes(randomBytesSize);
            sink = Buffer.concat([sink, newDelimiter]);
            delimiter.local = newDelimiter;
        }
        if (buffer.indexOf(delimiter.local) > -1) {
            var newDelimiter = void 0;
            do {
                newDelimiter = crypto_1.default.randomBytes(randomBytesSize);
            } while (buffer.indexOf(delimiter.local) > -1);
            sink = Buffer.concat([sink, this.buildPayload(PortCommand.SetDelimiter, newDelimiter), delimiter.local]);
            delimiter.local = newDelimiter;
        }
        sink = Buffer.concat([sink, buffer, delimiter.local]);
        return this.write(sink);
    };
    Port.prototype.evaluatePayload = function (buffer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, command, argData, _b, token, name_1, args_1, result, pendingRemoteCalls, _c, token, data, tokenStr, _d, _e, _f, resolve, reject, delimiter;
            var _this = this;
            return tslib_1.__generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _a = this.parsePayload(buffer), command = _a.command, argData = _a.argData;
                        if (!(command === PortCommand.Request)) return [3 /*break*/, 3];
                        _b = this.parseRequest(argData), token = _b.token, name_1 = _b.name, args_1 = _b.args;
                        return [4 /*yield*/, (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                var error_1;
                                return tslib_1.__generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            _a.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, this.execLocal.apply(this, tslib_1.__spreadArray([name_1], args_1, false))];
                                        case 1: return [2 /*return*/, _a.sent()];
                                        case 2:
                                            error_1 = _a.sent();
                                            return [2 /*return*/, error_1];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); })()];
                    case 1:
                        result = _g.sent();
                        return [4 /*yield*/, this.sendPayload(this.buildPayload(PortCommand.Response, this.buildRseponse(token, result)))];
                    case 2:
                        _g.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        if (command === PortCommand.Response) {
                            pendingRemoteCalls = this.pendingRemoteCalls;
                            _c = this.parseResponse(argData), token = _c.token, data = _c.data;
                            tokenStr = token.toString('hex');
                            _d = pendingRemoteCalls, _e = tokenStr, _f = _d[_e], resolve = _f.resolve, reject = _f.reject;
                            delete pendingRemoteCalls[tokenStr];
                            if (data instanceof Error) {
                                reject(data);
                            }
                            else {
                                resolve(data);
                            }
                        }
                        else if (command === PortCommand.SetDelimiter) {
                            delimiter = this.delimiter;
                            delimiter.remote = argData;
                        }
                        else if (command === PortCommand.Padding) {
                            //
                        }
                        _g.label = 4;
                    case 4: return [2 /*return*/];
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
            var _a, pendingRemoteCalls, randomBytesSize, token, tokenStr, payload, promise;
            var _this = this;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this, pendingRemoteCalls = _a.pendingRemoteCalls, randomBytesSize = _a.options.randomBytesSize;
                        return [4 /*yield*/, (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                var token;
                                return tslib_1.__generator(this, function (_a) {
                                    do {
                                        token = crypto_1.default.randomBytes(randomBytesSize);
                                    } while (token.toString('hex') in pendingRemoteCalls);
                                    return [2 /*return*/, token];
                                });
                            }); })()];
                    case 1:
                        token = _b.sent();
                        tokenStr = token.toString('hex');
                        payload = this.buildPayload(PortCommand.Request, this.buildRequest.apply(this, tslib_1.__spreadArray([token, name], args, false)));
                        promise = new Promise(function (resolve, reject) { return (pendingRemoteCalls[tokenStr] = { resolve: resolve, reject: reject }); });
                        this.sendPayload(payload);
                        return [2 /*return*/, promise];
                }
            });
        });
    };
    Port.prototype.execLocal = function (name) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (_a = this.callbacks)[name].apply(_a, args)];
                    case 1: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    Port.prototype._write = function (buffer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, new Promise(function (resolve, reject) { return _this.socket.write(buffer, function (error) { return error ? reject(error) : resolve(); }); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype.runWriteQueue = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var writeQueue, aggregate, sink, _a, buffer, resolve, reject, _i, aggregate_1, resolve, error_2, _b, aggregate_2, reject;
            return tslib_1.__generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        writeQueue = this.writeQueue;
                        if (this.isWriteQueueRunning) {
                            return [2 /*return*/];
                        }
                        this.isWriteQueueRunning = true;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, , 8, 9]);
                        _c.label = 2;
                    case 2:
                        if (!writeQueue.length) return [3 /*break*/, 7];
                        aggregate = [];
                        sink = Buffer.alloc(0);
                        while (writeQueue.length) {
                            _a = writeQueue.shift(), buffer = _a.buffer, resolve = _a.resolve, reject = _a.reject;
                            sink = Buffer.concat([sink, buffer]);
                            aggregate.push({ resolve: resolve, reject: reject });
                        }
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this._write(sink)];
                    case 4:
                        _c.sent();
                        for (_i = 0, aggregate_1 = aggregate; _i < aggregate_1.length; _i++) {
                            resolve = aggregate_1[_i].resolve;
                            resolve();
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        error_2 = _c.sent();
                        for (_b = 0, aggregate_2 = aggregate; _b < aggregate_2.length; _b++) {
                            reject = aggregate_2[_b].reject;
                            reject(error_2);
                        }
                        return [3 /*break*/, 6];
                    case 6: return [3 /*break*/, 2];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        this.isWriteQueueRunning = false;
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    Port.prototype.write = function (buffer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, new Promise(function (resolve, reject) {
                            _this.writeQueue.push({ buffer: buffer, resolve: resolve, reject: reject });
                            if (!_this.isWriteQueueRunning) {
                                _this.runWriteQueue();
                            }
                        })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Port.prototype._init = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, socket, _b, randomBytesSize, blockingEvaluations, delimiter, sink, dataCallback, delimiterIndex, payload, evaluationTask;
            return tslib_1.__generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = this, socket = _a.socket, _b = _a.options, randomBytesSize = _b.randomBytesSize, blockingEvaluations = _b.blockingEvaluations, delimiter = _a.delimiter;
                        sink = Buffer.alloc(0);
                        dataCallback = function () { };
                        socket.on('data', function (data) {
                            sink = Buffer.concat([sink, data]);
                            dataCallback();
                        });
                        socket.on('close', function () {
                            dataCallback();
                        });
                        _c.label = 1;
                    case 1:
                        if (!!socket.destroyed) return [3 /*break*/, 9];
                        if (!!sink.length) return [3 /*break*/, 3];
                        return [4 /*yield*/, new Promise(function (resolve) { dataCallback = resolve; })];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        if (!delimiter.remote.length) {
                            if (sink.length < randomBytesSize) {
                                return [3 /*break*/, 1];
                            }
                            delimiter.remote = sink.slice(0, randomBytesSize);
                            sink = sink.slice(randomBytesSize);
                        }
                        delimiterIndex = void 0;
                        _c.label = 4;
                    case 4:
                        if (!(sink.length && ((delimiterIndex = sink.indexOf(delimiter.remote)) > -1))) return [3 /*break*/, 7];
                        payload = sink.slice(0, delimiterIndex);
                        sink = sink.slice(delimiterIndex + delimiter.remote.length);
                        if (!payload.length) return [3 /*break*/, 6];
                        evaluationTask = this.evaluatePayload(payload);
                        if (!blockingEvaluations) return [3 /*break*/, 6];
                        return [4 /*yield*/, evaluationTask];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6: return [3 /*break*/, 4];
                    case 7: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 0); })];
                    case 8:
                        _c.sent();
                        return [3 /*break*/, 1];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return Port;
}());
exports.Port = Port;
