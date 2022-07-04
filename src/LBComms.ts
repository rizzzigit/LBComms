import Crypto from 'crypto'
import Net from 'net'
import LBSerializer from '@rizzzi/lb-serializer'
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter'

export interface PortInterface {
  [key: string]: [[...args: Array<any>], any]
}

export interface PortCallbackContext {
  requestEncrypted: boolean
  responseEncrypted: boolean
}

export type PortCallbackMap<Interface extends PortInterface> = {
  [Property in keyof Interface]: (context: PortCallbackContext, ...args: Interface[Property][0]) => Interface[Property][1]
}

export interface PortOptions {
  key?: Buffer
  blockingExecutions: boolean
}

export interface PortEvents extends EventInterface {
  listening: []

  data: [data: any]
  drain: []
  close: [hadError: boolean]
  finish: []
  error: [error: Error]
}

export type RawPayloadParams = [type: 0, data: any]
export type RequestPayloadParams = [type: 1, token: Buffer, name: string, parameters: Array<any>]
export type ResponsePayloadParams = [type: 2, token: Buffer, isError: boolean, data: any]
export type Payload =
  | RawPayloadParams
  | RequestPayloadParams
  | ResponsePayloadParams

export class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
  public static new <LocalInterface extends PortInterface, RemoteInterface extends PortInterface> (socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    return new this<LocalInterface, RemoteInterface>(socket, callbacks, options)
  }

  public constructor (socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      blockingExecutions: false,
      ...options
    }

    this.events = new EventEmitter({ requireErrorHandling: true })
    const { on, once, off } = this.events.bind()
    this.on = on
    this.once = once
    this.off = off

    this.serializer = new LBSerializer.Serializer()
    this.socket = socket
    this.callbacks = {
      ...callbacks,
      _np: () => {},
      _dc: () => {
        this._destroyed = true
      }
    }

    this._pendingRequests = {}
    this._wrap()

    this._destroyed = false
  }

  public readonly events: EventEmitter<PortEvents>
  public readonly on: this['events']['on']
  public readonly once: this['events']['once']
  public readonly off: this['events']['off']

  public readonly serializer: LBSerializer.Serializer
  public readonly socket: Net.Socket
  public readonly options: PortOptions
  public readonly callbacks: PortCallbackMap<LocalInterface>

  private _destroyed: boolean
  public get destroyed () { return this._destroyed || this.socket.destroyed }

  public packPayload (payload: Payload, encrypt: boolean = !!this.options.key): Buffer {
    const { serializer } = this
    const buffer = serializer.serialize(payload)

    if (encrypt) {
      const { options: { key } } = this

      if (!key) {
        throw new Error('No key to encrypt')
      }

      const iv = Crypto.randomBytes(16)
      const cipher = Crypto.createCipheriv('aes256', key, iv)

      return Buffer.concat([
        Buffer.from([1]),
        iv,
        cipher.update(buffer),
        cipher.final()
      ])
    }

    return Buffer.concat([Buffer.from([0]), buffer])
  }

  public unpackPayload (payload: Buffer): Payload {
    const { serializer } = this

    if (payload[0]) {
      const { options: { key } } = this

      if (!key) {
        throw new Error('No key to decrypt')
      }

      const iv = payload.slice(1, 17)
      const buffer = payload.slice(17)
      const decipher = Crypto.createDecipheriv('aes256', key, iv)

      return serializer.deserialize(Buffer.concat([
        decipher.update(buffer),
        decipher.final()
      ]))
    } else {
      return serializer.deserialize(payload.slice(1))
    }
  }

  public async execLocal <Name extends keyof LocalInterface> (name: Name, ...args: LocalInterface[Name][0]): Promise<LocalInterface[Name][1]> {
    const { callbacks, options } = this
    const context: PortCallbackContext = {
      requestEncrypted: !!options.key,
      responseEncrypted: !!options.key
    }

    return await callbacks[name](context, ...args)
  }

  public async exec <Name extends keyof RemoteInterface> (name: Name, ...args: RemoteInterface[Name][0]): Promise<RemoteInterface[Name][1]> {
    const { _pendingRequests: pendingRequests } = this

    let token: Buffer
    let tokenStr: string
    do {
      tokenStr = (token = Crypto.randomBytes(8)).toString('hex')
    } while (tokenStr in pendingRequests)

    const promise = new Promise<PromiseFulfilledResult<RemoteInterface[Name][1]>>((resolve, reject) => (pendingRequests[tokenStr] = { resolve, reject }))
    await this.write([1, token, <string> name, args])
    return await promise
  }

  public send (data: any, encrypt?: boolean) {
    return this.write([0, data], encrypt)
  }

  private _pendingRequests: {
    [key: string]: {
      resolve: (data: any) => void
      reject: (error: Error) => void
    }
  }

  public async destroy (error?: Error) {
    this._destroyed = true
    await this.exec('_dc')
    this.socket.destroy(error)
  }

  public async evaluatePayload (payload: Payload) {
    const { events } = this

    switch (payload[0]) {
      // Raw
      case 0:
        await events.emit('data', payload[1])
        break

      // Request
      case 1:
        await (async () => {
          const [, token, name, parameters] = payload

          try {
            const result = await this.execLocal(name, ...parameters)

            await this.write([2, token, false, result])
          } catch (error) {
            await this.write([2, token, true, error])
          }
        })()
        break

      // Response
      case 2:
        await (async () => {
          const { _pendingRequests: pendingRequests } = this
          const [, token, isError, data] = payload

          const tokenStr = token.toString('hex')
          if (!(tokenStr in pendingRequests)) {
            return
          }

          const { resolve, reject } = pendingRequests[tokenStr]
          delete pendingRequests[tokenStr]

          if (isError) {
            reject(data)
          } else {
            resolve(data)
          }
        })()
        break
    }
  }

  private _write (buffer: Buffer) {
    return new Promise<void>((resolve, reject) => this.socket.write(buffer, (error) => error ? reject(error) : resolve()))
  }

  public write (payload: Payload, encrypt?: boolean) {
    const buffer = this.packPayload(payload, encrypt)

    let bufferSize = buffer.length.toString(16)
    if (bufferSize.length % 2) {
      bufferSize = `0${bufferSize}`
    }
    const bufferSizeBuffer = Buffer.from(bufferSize, 'hex')
    const bufferSizeBufferLength = Buffer.from([bufferSizeBuffer.length])

    return this._write(Buffer.concat([bufferSizeBufferLength, bufferSizeBuffer, buffer]))
  }

  private async _wrap () {
    const { socket, events, options } = this

    let bufferSink = Buffer.alloc(0)
    let dataCallback: undefined | (() => void)

    socket.on('error', (error) => events.emit('error', error))
    socket.on('drain', () => events.emit('drain'))
    socket.on('finish', () => events.emit('finish'))

    socket.on('close', (hadError) => {
      this._destroyed = false
      dataCallback?.()
      events.emit('close', hadError)
    })

    socket.on('data', (buffer) => {
      bufferSink = Buffer.concat([bufferSink, buffer])
      dataCallback?.()
    })

    const waitForData = () => new Promise<void>((resolve) => {
      dataCallback = () => {
        dataCallback = undefined
        resolve()
      }
    })

    const tick = async () => {
      if (!bufferSink.length) {
        await waitForData()
      }

      const bufferSizeBufferLength = bufferSink[0]
      const bufferSizeBuffer = bufferSink.slice(1, bufferSizeBufferLength + 1)
      if (bufferSizeBufferLength !== bufferSizeBuffer.length) {
        await waitForData()
        return
      }

      const bufferSize = Number.parseInt(`${bufferSizeBuffer.toString('hex')}`, 16)
      const buffer = bufferSink.slice(1 + bufferSizeBufferLength, 1 + bufferSizeBufferLength + bufferSize)

      if (bufferSize !== buffer.length) {
        await waitForData()
        return
      }

      bufferSink = bufferSink.slice(1 + bufferSizeBuffer.length + buffer.length)

      const payload = this.unpackPayload(buffer)
      const task = this.evaluatePayload(payload)

      if (options.blockingExecutions) {
        await task
      }
    }

    while (!socket.destroyed) {
      await tick().catch((error) => socket.destroy(error))
    }
  }

  public async ping (pass: number = 1) {
    if ((pass < 1) || (pass > 100)) {
      throw new Error(`Pass is ${pass} instead of any number from 1 and 100`)
    }

    let ms = 0
    for (let currentPass = 1; pass >= currentPass; currentPass++) {
      const timeDifference = (await (async () => {
        await this.exec('_np')

        return Date.now()
      })()) - Date.now()

      ms = (ms + timeDifference) / currentPass
    }

    return ms
  }
}

export interface ServerEvents<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> extends EventInterface {
  connection: [port: Port<LocalInterface, RemoteInterface>]
  listening: []
  error: [error: Error]
  close: []
}

export class Server<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
  public constructor (listener: Net.Server, map: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      blockingExecutions: false,
      ...options
    }
    this.listener = listener
    this.map = map
    this.events = new EventEmitter({ requireErrorHandling: true })

    const { on, once, off } = this.events.bind()
    this.on = on
    this.once = once
    this.off = off

    listener.on('listening', () => { this.events.emit('listening') })
    listener.on('close', () => { this.events.emit('close') })
    listener.on('connection', (socket) => { this.events.emit('connection', this.wrap(socket)) })
    listener.on('error', (error) => { this.events.emit('error', error) })
  }

  public readonly options: PortOptions
  public readonly listener: Net.Server
  public readonly map: PortCallbackMap<LocalInterface>
  public readonly events: EventEmitter<ServerEvents<LocalInterface, RemoteInterface>>

  public readonly on: this['events']['on']
  public readonly once: this['events']['once']
  public readonly off: this['events']['off']

  public listen (port: number, hostname?: string) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.listener.listen(port, hostname, () => {
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  public wrap (socket: Net.Socket) {
    return Port.new<LocalInterface, RemoteInterface>(socket, this.map, this.options)
  }
}

export class Agent<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
  public constructor (map: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      blockingExecutions: false,
      ...options
    }
    this.map = map
  }

  public readonly options: PortOptions
  public readonly map: PortCallbackMap<LocalInterface>

  public connect (connectOpts: Net.NetConnectOpts) {
    return new Promise<Port<LocalInterface, RemoteInterface>>((resolve, reject) => {
      const socket = Net.connect(connectOpts)

      socket.once('error', reject)
      socket.on('ready', () => {
        socket.off('error', reject)

        resolve(Port.new<LocalInterface, RemoteInterface>(socket, this.map, this.options))
      })
    })
  }
}
