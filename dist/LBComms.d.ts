/// <reference types="node" />
import Net from 'net';
import LBSerializer from '@rizzzi/lb-serializer';
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter';
export declare enum PortPayloadType {
    Request = 0,
    Response = 1,
    Header = 2,
    Raw = 3
}
export interface PortInterface {
    [key: string]: [[...args: Array<any>], any];
}
export interface PortCallbackContext {
    requestEncrypted: boolean;
    responseEncrypted: boolean;
}
export declare type PortCallbackMap<Interface extends PortInterface> = {
    [Property in keyof Interface]: (context: PortCallbackContext, ...args: Interface[Property][0]) => Interface[Property][1];
};
export interface PortOptions {
    key?: string;
    blockingExecutions: boolean;
}
export declare enum PortPayloadResponseType {
    Data = 0,
    Error = 1
}
export interface PortEvents extends EventInterface {
    listening: [];
    data: [data: any];
    rawData: [data: Buffer];
    close: [hadError: boolean];
    error: [error: Error];
}
export declare type PortRawPayload = [type: PortPayloadType.Raw, data: any];
export declare type PortRequestPayload = [type: PortPayloadType.Request, token: Buffer, name: string, parameters: Array<any>];
export declare type PortResponsePayload = [type: PortPayloadType.Response, token: Buffer, responseType: PortPayloadResponseType, data: any];
export declare type PortPayload = PortRawPayload | PortRequestPayload | PortResponsePayload;
export declare class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
    static new<LocalInterface extends PortInterface, RemoteInterface extends PortInterface>(socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>): Port<LocalInterface, RemoteInterface>;
    constructor(socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly socket: Net.Socket;
    readonly serializer: LBSerializer.Serializer;
    readonly callbacks: PortCallbackMap<LocalInterface>;
    readonly events: EventEmitter<PortEvents>;
    readonly pendingRequests: {
        [key: string]: {
            resolve: (data: any) => void;
            reject: (error: Error) => void;
        };
    };
    readonly on: this['events']['on'];
    readonly once: this['events']['once'];
    readonly off: this['events']['off'];
    writePayload(payload: PortPayload, encrypt?: boolean): Promise<void>;
    write(data: any): void;
    exec<K extends keyof RemoteInterface>(name: K, ...parameters: RemoteInterface[K][0]): Promise<RemoteInterface[K][1]>;
    execLocal<K extends keyof LocalInterface>(name: K, context: PortCallbackContext, ...parameters: LocalInterface[K][0]): Promise<LocalInterface[K][1]>;
    ping(pass?: number): Promise<number>;
    key?: Buffer;
    setKey(key: string): void;
    getKey(): string | undefined;
    encryptPayload(inputBuffer: Buffer, encrypt?: boolean): Buffer;
    decryptPayload(inputBuffer: Buffer): Buffer;
    buildPayload(inputPayload: PortPayload, encrypt?: boolean): Buffer;
    parsePayload(inputBuffer: Buffer): PortPayload;
    private _isQueueRunning;
    private readonly _writeQueue;
    private _runWriteQueue;
    private _write;
    executePayload(inputBuffer: Buffer): Promise<void>;
    private destroyExpected;
    destroy(error?: Error): Promise<void>;
    private _init;
}
export interface ServerEvents<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> extends EventInterface {
    connection: [port: Port<LocalInterface, RemoteInterface>];
    listening: [];
    error: [error: Error];
    close: [];
}
export declare class Server<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
    constructor(listener: Net.Server, map: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly listener: Net.Server;
    readonly map: PortCallbackMap<LocalInterface>;
    readonly events: EventEmitter<ServerEvents<LocalInterface, RemoteInterface>>;
    readonly on: this['events']['on'];
    readonly once: this['events']['once'];
    readonly off: this['events']['off'];
    listen(port: number, hostname?: string): Promise<void>;
    wrap(socket: Net.Socket): Port<LocalInterface, RemoteInterface>;
}
export declare class Agent<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
    constructor(map: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly map: PortCallbackMap<LocalInterface>;
    connect(connectOpts: Net.NetConnectOpts): Promise<Port<LocalInterface, RemoteInterface>>;
}
