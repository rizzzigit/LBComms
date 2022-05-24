import Crypto from 'crypto'
import Net from 'net'
import LBSerializer from '@rizzzi/lb-serializer'
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter'

export enum PortPayloadType {
  Request,
  Response,
  Raw
}

export interface PortInterface {
  [key: string]: [[...args: Array<any>], any]
}

export type PortCallbackMap<Interface extends PortInterface> = {
  [Property in keyof Interface]: (...args: Interface[Property][0]) => Interface[Property][1]
}

export interface PortOptions {
  key?: string
  blockingEvaluations: boolean
}

export enum PortPayloadResponseType {
  Data,
  Error
}

export interface PortEvents extends EventInterface {
  listening: []
  data: [data: any]
  rawData: [data: Buffer]
  close: [hadError: boolean]
  error: [error: Error]
}

export type PortRawPayload = [type: PortPayloadType.Raw, data: any]
export type PortRequestPayload = [type: PortPayloadType.Request, token: Buffer, name: string, parameters: Array<any>]
export type PortResponsePayload = [type: PortPayloadType.Response, token: Buffer, responseType: PortPayloadResponseType, data: any]
export type PortPayload =
  | PortRawPayload
  | PortRequestPayload
  | PortResponsePayload

export class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
  public constructor (socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      blockingEvaluations: false,
      ...options
    }
    this.serializer = new LBSerializer.Serializer()
    this.socket = socket
    this.callbacks = {
      ...callbacks,
      _np: () => {}
    }
    this.events = new EventEmitter({ requireErrorHandling: true })
    this.pendingRequests = {}
    this._isQueueRunning = false
    this._writeQueue = []

    this._init()
  }

  public readonly options: PortOptions
  public readonly socket: Net.Socket
  public readonly serializer: LBSerializer.Serializer
  public readonly key?: Buffer
  public readonly callbacks: PortCallbackMap<LocalInterface>
  public readonly events: EventEmitter<PortEvents>
  public readonly pendingRequests: {
    [key: string]: {
      resolve: (data: any) => void
      reject: (error: Error) => void
    }
  }

  public writePayload (...payload: PortPayload) {
    return this._write(this.buildPayload(payload))
  }

  public write (data: any) {
    this.writePayload(PortPayloadType.Raw, this.serializer.serialize(data))
  }

  public exec <K extends keyof RemoteInterface> (name: K, ...parameters: RemoteInterface[K][0]): Promise<RemoteInterface[K][1]> {
    const { pendingRequests } = this
    const token = (() => {
      let token: Buffer
      do {
        token = Crypto.randomBytes(16)
      } while (token.toString('hex') in pendingRequests)

      return token
    })()
    const tokenStr = token.toString('hex')

    return new Promise((resolve, reject) => {
      pendingRequests[tokenStr] = { resolve, reject }

      this.writePayload(PortPayloadType.Request, token, <string> name, parameters)
        .catch(reject)
    })
  }

  public encryptPayload (inputBuffer: Buffer) {
    const { key } = this

    if (key) {
      const initializationVector = Crypto.randomBytes(16)
      const cipher = Crypto.createCipheriv('aes256', key, initializationVector)

      return Buffer.concat([
        Buffer.from([1]),
        initializationVector,
        cipher.update(inputBuffer),
        cipher.final()
      ])
    } else {
      return Buffer.concat([
        Buffer.from([0]),
        inputBuffer
      ])
    }
  }

  public decryptPayload (inputBuffer: Buffer) {
    const { key } = this

    if (inputBuffer[0]) {
      if (!key) { throw new Error('No key present to decrypt payload') }

      const initializationVector = inputBuffer.slice(1, 17)
      const decipher = Crypto.createDecipheriv('aes256', key, initializationVector)

      return Buffer.concat([decipher.update(inputBuffer), decipher.final()])
    } else {
      return inputBuffer.slice(1)
    }
  }

  public buildPayload (inputPayload: PortPayload) {
    const type = inputPayload[0]
    const data = inputPayload.slice(1)

    return this.encryptPayload(Buffer.concat([
      Buffer.from([type]),
      this.serializer.serialize(data)
    ]))
  }

  public parsePayload (inputBuffer: Buffer): PortPayload {
    const decrypted = this.decryptPayload(inputBuffer)
    const type = decrypted[0]
    const data = decrypted.slice(1)

    return <any> [
      type,
      ...this.serializer.deserialize(data)
    ]
  }

  public _isQueueRunning: boolean
  public readonly _writeQueue: Array<{
    buffer: Buffer
    resolve: () => void
    reject: (error: Error) => void
  }>

  public async _runWriteQueue () {
    const { _writeQueue: writeQueue, socket } = this

    if (this._isQueueRunning) {
      return
    }

    this._isQueueRunning = true
    try {
      const buffers: Array<Buffer> = []
      const resolves: Array<() => void> = []
      const rejects: Array<(error: Error) => void> = []

      while (writeQueue.length) {
        const entry = writeQueue.shift()
        if (!entry) { break }

        const sizeBuffer = Buffer.from(((hex) => hex.length % 2 ? `0${hex}` : hex)(entry.buffer.length.toString(16)), 'hex')

        buffers.push(Buffer.from([sizeBuffer.length]), sizeBuffer, entry.buffer)
        resolves.push(entry.resolve)
        rejects.push(entry.reject)
      }

      await new Promise<void>((resolve, reject) => socket.write(Buffer.concat(buffers), (error) => error ? reject(error) : resolve()))
        .then(() => resolves.forEach((f) => f()))
        .catch((error) => rejects.forEach((f) => f(error)))
    } finally {
      this._isQueueRunning = false
    }
  }

  public _write (buffer: Buffer) {
    return new Promise<void>((resolve, reject) => {
      this._writeQueue.push({ buffer, resolve, reject })
      if (!this._isQueueRunning) {
        this._runWriteQueue()
      }
    })
  }

  public async evaluatePayload (inputBuffer: Buffer) {
    const { events, callbacks, pendingRequests, serializer } = this
    const payload = this.parsePayload(inputBuffer)

    if (payload[0] === PortPayloadType.Raw) {
      const [, data] = payload
      await events.emit('data', data)
    } else if (payload[0] === PortPayloadType.Request) {
      const [, token, name, parameters] = payload
      try {
        await this.writePayload(PortPayloadType.Response, token, PortPayloadResponseType.Data, serializer.serialize(await callbacks[name](...parameters)))
      } catch (error) {
        await this.writePayload(PortPayloadType.Response, token, PortPayloadResponseType.Error, serializer.serialize(error))
      }
    } else if (payload[0] === PortPayloadType.Response) {
      const [, token, responseType, data] = payload
      const tokenStr = token.toString('hex')

      if (tokenStr in pendingRequests) {
        const { [tokenStr]: { resolve, reject } } = pendingRequests
        delete pendingRequests[tokenStr]

        if (responseType === PortPayloadResponseType.Data) {
          resolve(serializer.deserialize(data))
        } else if (responseType === PortPayloadResponseType.Error) {
          reject(serializer.deserialize(data))
        } else {
          throw new Error(`Unknown response type: 0x${(<number> responseType).toString(16)}`)
        }
      }
    }
  }

  public async _init () {
    const { socket, events, options: { blockingEvaluations } } = this

    let bufferSink = Buffer.alloc(0)
    let dataCallback: (() => void) | undefined
    const waitForData = () => new Promise<void>((resolve) => {
      dataCallback = () => {
        resolve()
        dataCallback = undefined
      }
    })

    socket.on('error', (error) => events.emit('error', error))
    socket.on('close', (hadError) => {
      dataCallback?.()
      events.emit('close', hadError)
    })
    socket.on('data', (buffer) => {
      bufferSink = Buffer.concat([bufferSink, buffer])
      dataCallback?.()
      events.emit('rawData', buffer)
    })

    while (!socket.destroyed) {
      if (!bufferSink.length) {
        await waitForData()
      }

      const sizeBuffer = bufferSink.slice(1, 1 + bufferSink[0])
      if (sizeBuffer.length !== bufferSink[0]) {
        await waitForData()
        continue
      }
      const size = Number.parseInt(sizeBuffer.toString('hex'), 16)
      const dataBuffer = bufferSink.slice(1 + sizeBuffer.length, 1 + sizeBuffer.length + size)
      if (dataBuffer.length !== size) {
        await waitForData()
        continue
      }
      bufferSink = bufferSink.slice(1 + sizeBuffer.length + size)

      if (blockingEvaluations) {
        await this.evaluatePayload(dataBuffer)
          .catch((error) => events.emit('error', error))
      } else {
        this.evaluatePayload(dataBuffer)
          .catch((error) => events.emit('error', error))
      }
    }
  }
}
