/// <reference types="node" />
import Net from 'net';
import LBSerializer from '@rizzzi/lb-serializer';
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter';
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
    key?: Buffer;
    blockingExecutions: boolean;
}
export interface PortEvents extends EventInterface {
    listening: [];
    data: [data: any];
    drain: [];
    close: [hadError: boolean];
    finish: [];
    error: [error: Error];
}
export declare type RawPayloadParams = [type: 0, data: any];
export declare type RequestPayloadParams = [type: 1, token: Buffer, name: string, parameters: Array<any>];
export declare type ResponsePayloadParams = [type: 2, token: Buffer, isError: boolean, data: any];
export declare type Payload = RawPayloadParams | RequestPayloadParams | ResponsePayloadParams;
export declare class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
    static new<LocalInterface extends PortInterface, RemoteInterface extends PortInterface>(socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>): Port<LocalInterface, RemoteInterface>;
    constructor(socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly events: EventEmitter<PortEvents>;
    readonly on: this['events']['on'];
    readonly once: this['events']['once'];
    readonly off: this['events']['off'];
    readonly serializer: LBSerializer.Serializer;
    readonly socket: Net.Socket;
    readonly options: PortOptions;
    readonly callbacks: PortCallbackMap<LocalInterface>;
    private _destroyed;
    get destroyed(): boolean;
    packPayload(payload: Payload, encrypt?: boolean): Buffer;
    unpackPayload(payload: Buffer): Payload;
    execLocal<Name extends keyof LocalInterface>(name: Name, ...args: LocalInterface[Name][0]): Promise<LocalInterface[Name][1]>;
    exec<Name extends keyof RemoteInterface>(name: Name, ...args: RemoteInterface[Name][0]): Promise<RemoteInterface[Name][1]>;
    send(data: any, encrypt?: boolean): Promise<void>;
    private _pendingRequests;
    destroy(error?: Error): Promise<void>;
    evaluatePayload(payload: Payload): Promise<void>;
    private _write;
    write(payload: Payload, encrypt?: boolean): Promise<void>;
    private _wrap;
    ping(pass?: number): Promise<number>;
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
