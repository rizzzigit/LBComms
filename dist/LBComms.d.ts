/// <reference types="node" />
import Net from 'net';
import LBSerializer from '@rizzzi/lb-serializer';
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter';
export declare enum PortPayloadType {
    Request = 0,
    Response = 1,
    Raw = 2
}
export interface PortInterface {
    [key: string]: [[...args: Array<any>], any];
}
export declare type PortCallbackMap<Interface extends PortInterface> = {
    [Property in keyof Interface]: (...args: Interface[Property][0]) => Interface[Property][1];
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
    writePayload(...payload: PortPayload): Promise<void>;
    write(data: any): void;
    exec<K extends keyof RemoteInterface>(name: K, ...parameters: RemoteInterface[K][0]): Promise<RemoteInterface[K][1]>;
    execLocal<K extends keyof LocalInterface>(name: K, ...parameters: LocalInterface[K][0]): Promise<LocalInterface[K][1]>;
    ping(pass?: number): Promise<number>;
    key?: Buffer;
    setKey(key: string): void;
    getKey(): string | undefined;
    encryptPayload(inputBuffer: Buffer): Buffer;
    decryptPayload(inputBuffer: Buffer): Buffer;
    buildPayload(inputPayload: PortPayload): Buffer;
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
