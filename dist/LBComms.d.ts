/// <reference types="node" />
import Net from 'net';
import LBSerializer from '@rizzzi/lb-serializer';
export declare enum PortCommand {
    SetDelimiter = 0,
    Request = 1,
    Response = 2,
    Padding = 3
}
export interface PortInterface {
    [key: string]: [[...args: Array<any>], any];
}
export declare type PortCallbackMap<Interface extends PortInterface> = {
    [Property in keyof Interface]: (...args: Interface[Property][0]) => Interface[Property][1];
};
export interface PortOptions {
    key?: string;
    blockingEvaluations: boolean;
    randomBytesSize: number;
}
export interface PortEvents {
}
export declare class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
    constructor(socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>);
    readonly options: PortOptions;
    readonly socket: Net.Socket;
    readonly serializer: LBSerializer.Serializer;
    readonly encryption: {
        key?: Buffer;
    };
    readonly callbacks: PortCallbackMap<LocalInterface>;
    readonly pendingRemoteCalls: {
        [key: string]: {
            resolve: (data: any) => void;
            reject: (error: Error) => void;
        };
    };
    readonly delimiter: {
        local: Buffer;
        remote: Buffer;
    };
    ping(passCount?: number): Promise<number>;
    buildRequest(token: Buffer, name: string, ...args: Array<any>): Buffer;
    parseRequest(buffer: Buffer): {
        token: Buffer;
        name: string;
        args: Array<any>;
    };
    buildRseponse(token: Buffer, result: any): Buffer;
    parseResponse(buffer: Buffer): {
        token: Buffer;
        data?: any;
    };
    encrypt(buffer: Buffer): Buffer;
    decrypt(buffer: Buffer): Buffer;
    buildPayload(command: PortCommand, ...data: Array<Buffer>): Buffer;
    parsePayload(buffer: Buffer): {
        command: PortCommand;
        argData: Buffer;
    };
    sendPayload(buffer: Buffer): Promise<void>;
    evaluatePayload(buffer: Buffer): Promise<void>;
    exec<Name extends keyof RemoteInterface>(name: Name, ...args: RemoteInterface[Name][0]): Promise<RemoteInterface[Name][1]>;
    execLocal<Name extends keyof LocalInterface>(name: Name, ...args: LocalInterface[Name][0]): Promise<LocalInterface[Name][1]>;
    _write(buffer: Buffer): Promise<void>;
    isWriteQueueRunning: boolean;
    readonly writeQueue: Array<{
        buffer: Buffer;
        resolve: () => void;
        reject: (error: Error) => void;
    }>;
    runWriteQueue(): Promise<void>;
    write(buffer: Buffer): Promise<void>;
    _init(): Promise<void>;
}
