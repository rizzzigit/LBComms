/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import Net from 'net';
import Stream from 'stream';
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter';
export interface ConnectionFunctions {
    [key: string]: [[...args: Array<any>], any];
}
export interface ConnectionFunctionContext {
    requestEncrypted: boolean;
    responseEncrypted: boolean;
}
export type ConnectionFunctionMap<Functions extends ConnectionFunctions> = {
    [Property in keyof Functions]: (context: ConnectionFunctionContext, ...args: Functions[Property][0]) => Functions[Property][1];
};
export interface PortOptions {
    key?: Buffer;
    waitAsyncFunctions: boolean;
    errorsOnWrite: boolean;
}
export type UnderlyingStream = Net.Socket | {
    in: Stream.Readable;
    out: Stream.Writable;
};
export type RawPayloadParams = [type: 0, data: any];
export type RequestPayloadParams = [type: 1, token: Buffer, name: string, parameters: Array<any>];
export type ResponsePayloadParams = [type: 2, token: Buffer, isError: boolean, data: Error];
export type Payload = RawPayloadParams | RequestPayloadParams | ResponsePayloadParams;
export interface ConnectionEvents extends EventInterface {
    listening: [];
    data: [data: Payload];
    message: [message: any];
    close: [hadError: boolean];
    error: [error: Error];
    nonCriticalError: [error: Error];
    attach: [stream: UnderlyingStream];
    detach: [stream: UnderlyingStream];
}
export type ConnectionEventEmitter = EventEmitter<ConnectionEvents>;
export declare class Connection<LocalFunctions extends ConnectionFunctions, RemoteFunctions extends ConnectionFunctions> {
    static new<LocalInterface extends ConnectionFunctions, RemoteInterface extends ConnectionFunctions>(functions: ConnectionFunctionMap<LocalInterface>, socket?: UnderlyingStream, options?: Partial<PortOptions>): Connection<LocalInterface, RemoteInterface>;
    static applyOptions(options?: Partial<PortOptions>): PortOptions;
    constructor(functions: ConnectionFunctionMap<LocalFunctions>, stream?: UnderlyingStream, options?: Partial<PortOptions>);
    readonly on: ConnectionEventEmitter['on'];
    readonly once: ConnectionEventEmitter['once'];
    readonly off: ConnectionEventEmitter['off'];
    readonly emit: ConnectionEventEmitter['emit'];
    readonly underlyingStream?: UnderlyingStream;
    readonly destroyed: boolean;
    encryptionKey?: Buffer;
    readonly execLocal: <Name extends keyof LocalFunctions>(name: Name, context: ConnectionFunctionContext, ...args: LocalFunctions[Name][0]) => Promise<LocalFunctions[Name][1]>;
    readonly exec: <Name extends keyof RemoteFunctions>(name: Name, ...args: RemoteFunctions[Name][0]) => Promise<RemoteFunctions[Name][1]>;
    readonly send: (data: any, encrypt?: boolean) => Promise<void>;
    readonly destroy: (error?: Error) => Promise<void>;
    readonly attach: (stream: UnderlyingStream) => void;
    readonly detach: () => void;
}
export interface ServerEvents<LocalFunctions extends ConnectionFunctions, Remotes extends ConnectionFunctions> extends EventInterface {
    connection: [port: Connection<LocalFunctions, Remotes>];
    listening: [];
    error: [error: Error];
    close: [];
}
export declare class Server<LocalFunctions extends ConnectionFunctions, RemoteFunctions extends ConnectionFunctions> {
    constructor(listener: Net.Server, functions: ConnectionFunctionMap<LocalFunctions>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly listener: Net.Server;
    readonly functions: ConnectionFunctionMap<LocalFunctions>;
    readonly events: EventEmitter<ServerEvents<LocalFunctions, RemoteFunctions>>;
    readonly on: this['events']['on'];
    readonly once: this['events']['once'];
    readonly off: this['events']['off'];
    listen(port: number, hostname?: string): Promise<void>;
    wrap(socket: Net.Socket): Connection<LocalFunctions, RemoteFunctions>;
}
export declare class Agent<LocalInterface extends ConnectionFunctions, RemoteInterface extends ConnectionFunctions> {
    constructor(map: ConnectionFunctionMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly map: ConnectionFunctionMap<LocalInterface>;
    connect(connectOpts: Net.NetConnectOpts): Promise<Connection<LocalInterface, RemoteInterface>>;
}
