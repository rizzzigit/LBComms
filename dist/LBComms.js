"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = exports.Server = exports.Connection = void 0;
const tslib_1 = require("tslib");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const net_1 = tslib_1.__importDefault(require("net"));
const lb_serializer_1 = tslib_1.__importDefault(require("@rizzzi/lb-serializer"));
const eventemitter_1 = tslib_1.__importDefault(require("@rizzzi/eventemitter"));
class Connection {
    static new(functions, socket, options) {
        return new this(functions, socket, options);
    }
    static applyOptions(options) {
        return {
            waitAsyncFunctions: false,
            errorsOnWrite: true,
            ...options
        };
    }
    constructor(functions, stream, options) {
        const _options = Connection.applyOptions(options);
        const events = new eventemitter_1.default({ requireErrorHandling: true });
        const { on, off, once, emit } = events.bind();
        this.on = on;
        this.once = once;
        this.off = off;
        this.emit = emit;
        const serializer = new lb_serializer_1.default.Serializer();
        const pendingRequests = {};
        const properties = {
            destroyed: true
        };
        functions = {
            ...functions,
            _np: () => { },
            _dc: async (_, error) => {
                if (error) {
                    await emit('error', error).catch((_error) => { if (_error !== error) {
                        throw error;
                    } });
                }
                properties.destroyed = true;
            }
        };
        const methods = {
            packPayload: (payload, encrypt = !!_options?.key) => {
                const buffer = serializer.serialize(payload);
                if (encrypt) {
                    const { key } = _options;
                    if (!key) {
                        throw new Error('No key to encrypt');
                    }
                    const iv = crypto_1.default.randomBytes(16);
                    const cipher = crypto_1.default.createCipheriv('aes256', key, iv);
                    return Buffer.concat([
                        Buffer.from([1]),
                        iv,
                        cipher.update(buffer),
                        cipher.final()
                    ]);
                }
                return Buffer.concat([Buffer.from([0]), buffer]);
            },
            unpackPayload: (payload) => {
                if (payload[0]) {
                    const { key } = _options;
                    if (!key) {
                        throw new Error('No key to decrypt');
                    }
                    const iv = payload.slice(1, 17);
                    const buffer = payload.slice(17);
                    const decipher = crypto_1.default.createDecipheriv('aes256', key, iv);
                    return serializer.deserialize(Buffer.concat([
                        decipher.update(buffer),
                        decipher.final()
                    ]));
                }
                else {
                    return serializer.deserialize(payload.slice(1));
                }
            },
            execLocal: async (name, context, ...args) => {
                if (!(name in functions)) {
                    throw new Error(`Function ${name} is not available`);
                }
                return await functions[name](context, ...args);
            },
            exec: async (name, ...args) => {
                let token;
                let tokenStr;
                do {
                    tokenStr = (token = crypto_1.default.randomBytes(8)).toString('hex');
                } while (tokenStr in pendingRequests);
                const promise = new Promise((resolve, reject) => (pendingRequests[tokenStr] = { resolve, reject }));
                await methods.write([1, token, name, args], undefined);
                return await promise;
            },
            send: (data, encrypt) => {
                return methods.write([0, data], encrypt);
            },
            destroy: async (error) => {
                const { stream } = properties;
                if (!stream) {
                    throw new Error('Not attached to any stream');
                }
                if (!this.destroyed) {
                    await methods.exec('_dc', error);
                }
                properties.destroyed = true;
                if (stream instanceof net_1.default.Socket) {
                    stream.destroy(error);
                }
                else {
                    stream.in.destroy(error);
                    stream.out.destroy(error);
                }
            },
            evaluatePayload: async (payload, isRequestEncrypted) => {
                await events.emit('data', payload);
                switch (payload[0]) {
                    // Raw
                    case 0:
                        await events.emit('message', payload[1]);
                        break;
                    // Request
                    case 1:
                        {
                            const [, token, name, parameters] = payload;
                            const context = {
                                requestEncrypted: isRequestEncrypted,
                                responseEncrypted: isRequestEncrypted
                            };
                            try {
                                const result = await methods.execLocal(name, context, ...parameters);
                                await methods.write([2, token, false, result], context.responseEncrypted);
                            }
                            catch (error) {
                                await events.emit('nonCriticalError', error);
                                await methods.write([2, token, true, error], context.responseEncrypted);
                            }
                        }
                        break;
                    // Response
                    case 2:
                        {
                            const [, token, isError, data] = payload;
                            const tokenStr = token.toString('hex');
                            if (!(tokenStr in pendingRequests)) {
                                return;
                            }
                            const { resolve, reject } = pendingRequests[tokenStr];
                            delete pendingRequests[tokenStr];
                            if (isError) {
                                reject(data);
                            }
                            else {
                                resolve(data);
                            }
                        }
                        break;
                }
            },
            _write: (buffer) => {
                return new Promise((resolve, reject) => {
                    const { stream } = properties;
                    if (!stream) {
                        throw new Error('Not attached to any stream');
                    }
                    const { errorsOnWrite } = _options;
                    if (stream instanceof net_1.default.Socket) {
                        if (stream.destroyed) {
                            if (errorsOnWrite) {
                                throw new Error('Socket already destroyed');
                            }
                            return;
                        }
                        stream.write(buffer, (error) => error && errorsOnWrite ? reject(error) : resolve());
                    }
                    else {
                        if (stream.out.destroyed) {
                            if (errorsOnWrite) {
                                throw new Error('Write stream already destroyed');
                            }
                            return;
                        }
                        stream.out.write(buffer, (error) => error && errorsOnWrite ? reject(error) : resolve());
                    }
                });
            },
            write: (payload, encrypt) => {
                const buffer = methods.packPayload(payload, encrypt);
                let bufferSize = buffer.length.toString(16);
                if (bufferSize.length % 2) {
                    bufferSize = `0${bufferSize}`;
                }
                const bufferSizeBuffer = Buffer.from(bufferSize, 'hex');
                const bufferSizeBufferLength = Buffer.from([bufferSizeBuffer.length]);
                return methods._write(Buffer.concat([bufferSizeBufferLength, bufferSizeBuffer, buffer]));
            },
            attach: (stream) => {
                if (properties.stream) {
                    throw new Error('Aleady attached to a stream');
                }
                else if (stream instanceof net_1.default.Socket) {
                    if (stream.destroyed) {
                        throw new Error('Socket already destroyed');
                    }
                }
                else if (stream.in.destroyed || stream.out.destroyed) {
                    throw new Error('In or out stream already destroyed');
                }
                properties.destroyed = false;
                properties.stream = stream;
                let isProcessingBufferSink = false;
                let bufferSink = Buffer.alloc(0);
                const processPayload = async (buffer) => {
                    const payload = methods.unpackPayload(buffer);
                    await methods.evaluatePayload(payload, !!buffer[0]);
                };
                const processBufferSink = async () => {
                    const bufferSizeBufferLength = bufferSink[0];
                    const bufferSizeBuffer = bufferSink.slice(1, bufferSizeBufferLength + 1);
                    if (bufferSizeBufferLength !== bufferSizeBuffer.length) {
                        return false;
                    }
                    const bufferSize = Number.parseInt(`${bufferSizeBuffer.toString('hex')}`, 16);
                    const buffer = bufferSink.slice(1 + bufferSizeBufferLength, 1 + bufferSizeBufferLength + bufferSize);
                    if (bufferSize !== buffer.length) {
                        return false;
                    }
                    bufferSink = bufferSink.slice(1 + bufferSizeBuffer.length + buffer.length);
                    const task = processPayload(buffer);
                    if (_options.waitAsyncFunctions) {
                        await task;
                    }
                    return true;
                };
                const pushToBufferSink = async (data) => {
                    bufferSink = Buffer.concat([bufferSink, data]);
                    if (isProcessingBufferSink) {
                        return;
                    }
                    isProcessingBufferSink = true;
                    try {
                        while ((!this.destroyed) && bufferSink.length && await processBufferSink()) {
                            // No op
                        }
                    }
                    catch (error) {
                        if (stream instanceof net_1.default.Socket) {
                            stream.destroy(error);
                        }
                        else {
                            stream.in.destroy(error);
                            stream.out.destroy(error);
                        }
                    }
                    finally {
                        isProcessingBufferSink = false;
                    }
                };
                if (stream instanceof net_1.default.Socket) {
                    const onData = (data) => pushToBufferSink(data);
                    const onClose = (hadError) => emit('close', hadError);
                    const onError = (error) => emit('error', error);
                    stream.on('data', onData);
                    stream.on('close', onClose);
                    stream.on('error', onError);
                    const oldDetach = methods.detach;
                    const newDetach = (stream) => {
                        oldDetach();
                        stream.off('data', onData);
                        stream.off('close', onClose);
                        stream.off('error', onError);
                    };
                    methods.detach = newDetach.bind(this, stream);
                }
                else {
                    const { in: input, out: output } = stream;
                    let hadError = false;
                    const onData = (data) => pushToBufferSink(data);
                    const onClose = () => emit('close', hadError);
                    const onError = (error) => {
                        hadError = true;
                        return emit('error', error);
                    };
                    input.on('data', onData);
                    input.on('close', onClose);
                    input.on('error', onError);
                    output.on('close', onClose);
                    output.on('error', onError);
                    const oldDetach = methods.detach;
                    const newDetach = (input, output) => {
                        oldDetach();
                        input.off('data', onData);
                        input.off('close', onClose);
                        input.off('error', onError);
                        output.off('close', onClose);
                        output.off('error', onError);
                    };
                    methods.detach = () => newDetach.bind(this, input, output);
                }
                emit('attach', stream);
            },
            detach: () => {
                for (const token in pendingRequests) {
                    const { [token]: pendingRequest } = pendingRequests;
                    delete pendingRequests[token];
                    pendingRequest.reject(new Error('Detached from the underlying socket.'));
                }
                const { stream } = properties;
                if (!stream) {
                    throw new Error('Not attached to any stream');
                }
                delete properties.stream;
                emit('detach', stream);
            }
        };
        this.destroyed = false;
        Object.defineProperties(this, {
            destroyed: {
                get: () => {
                    const { stream } = properties;
                    if (!stream) {
                        return true;
                    }
                    else if (properties.destroyed) {
                        return properties.destroyed;
                    }
                    else if (stream instanceof net_1.default.Socket) {
                        return stream.destroyed;
                    }
                    return (stream.in.destroyed || stream.out.destroyed);
                }
            },
            encryptionKey: {
                get: () => _options?.key,
                set: (key) => {
                    if (key instanceof Buffer) {
                        if (key.length !== 32) {
                            throw new Error('Invalid key length');
                        }
                        _options.key = key;
                        return;
                    }
                    else if ((key === null) || (key === undefined)) {
                        _options.key = undefined;
                        return;
                    }
                    throw new Error('Invalid key input');
                }
            },
            underlyingStream: {
                get: () => properties.stream
            }
        });
        if (stream) {
            methods.attach(stream);
        }
        this.execLocal = methods.execLocal.bind(this);
        this.exec = methods.exec.bind(this);
        this.send = methods.send.bind(this);
        this.destroy = methods.destroy.bind(this);
        this.attach = methods.attach.bind(this);
        this.detach = methods.detach.bind(this);
    }
    on;
    once;
    off;
    emit;
    underlyingStream;
    destroyed;
    encryptionKey;
    execLocal;
    exec;
    send;
    destroy;
    attach;
    detach;
}
exports.Connection = Connection;
class Server {
    constructor(listener, functions, options) {
        this.options = {
            waitAsyncFunctions: false,
            errorsOnWrite: true,
            ...options
        };
        this.listener = listener;
        this.functions = functions;
        this.events = new eventemitter_1.default({ requireErrorHandling: true });
        const { on, once, off } = this.events.bind();
        this.on = on;
        this.once = once;
        this.off = off;
        listener.on('listening', () => { this.events.emit('listening'); });
        listener.on('close', () => { this.events.emit('close'); });
        listener.on('connection', (socket) => { this.events.emit('connection', this.wrap(socket)); });
        listener.on('error', (error) => { this.events.emit('error', error); });
    }
    options;
    listener;
    functions;
    events;
    on;
    once;
    off;
    listen(port, hostname) {
        return new Promise((resolve, reject) => {
            try {
                this.listener.listen(port, hostname, () => {
                    resolve();
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    wrap(socket) {
        return Connection.new(this.functions, socket, this.options);
    }
}
exports.Server = Server;
class Agent {
    constructor(map, options) {
        this.options = {
            waitAsyncFunctions: false,
            errorsOnWrite: true,
            ...options
        };
        this.map = map;
    }
    options;
    map;
    connect(connectOpts) {
        return new Promise((resolve, reject) => {
            const socket = net_1.default.connect(connectOpts);
            socket.once('error', reject);
            socket.on('ready', () => {
                socket.off('error', reject);
                resolve(Connection.new(this.map, socket, this.options));
            });
        });
    }
}
exports.Agent = Agent;
