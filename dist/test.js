"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net_1 = tslib_1.__importDefault(require("net"));
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const _1 = tslib_1.__importDefault(require("."));
const time = () => Math.round(Date.now() / 1000);
const key = Buffer.from('0'.repeat(64), 'hex');
const run = async () => {
    const map = {
        echo: (_, arg0) => arg0,
        read: (_, size) => new Promise((resolve, reject) => crypto_1.default.randomBytes(size, (error, buffer) => error ? reject(error) : resolve(buffer))),
        error: (_, message) => { throw new Error(message); }
    };
    if (process.argv.length <= 3) {
        const server = new _1.default.Server(net_1.default.createServer(), map, { key });
        await server.listen(Number(process.argv[2]));
    }
    else {
        const client = new _1.default.Agent(map, { key });
        const connection = await client.connect({
            host: process.argv[2],
            port: Number(process.argv[3])
        });
        const timeout = Date.now() + 10000;
        let count = 0;
        while (true) {
            console.log(++count);
            await connection.exec('read', 16 * 1024);
            if (timeout < Date.now()) {
                break;
            }
        }
        await connection.destroy();
    }
};
const run2 = async () => {
    const listener = net_1.default.createServer();
    listener.listen(8080);
    listener.on('connection', (socket) => {
        const e = new _1.default.Connection({}, socket);
        e.on('error', (error) => console.log('Server error', error));
    });
    const e = new _1.default.Connection({});
    while (true) {
        await new Promise((resolve, reject) => {
            const socket = net_1.default.connect({ port: 8080 });
            socket.once('error', reject);
            socket.once('ready', () => (async () => {
                socket.off('error', reject);
                e.attach(socket);
                e.on('error', (error) => console.log('Client error', error));
                await e.destroy(new Error('test'));
                e.detach();
            })().then(resolve, reject));
        });
    }
};
run2();
