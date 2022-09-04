import Crypto from 'crypto'
import Net from 'net'
import LBSerializer from '@rizzzi/lb-serializer'
import Stream from 'stream'
import EventEmitter, { EventInterface } from '@rizzzi/eventemitter'

export interface ConnectionFunctions {
  [key: string]: [[...args: Array<any>], any]
}

export interface ConnectionFunctionContext {
  requestEncrypted: boolean
  responseEncrypted: boolean
}

export type ConnectionFunctionMap<Functions extends ConnectionFunctions> = {
  [Property in keyof Functions]: (context: ConnectionFunctionContext, ...args: Functions[Property][0]) => Functions[Property][1]
}

export interface PortOptions {
  key?: Buffer
  waitAsyncFunctions: boolean
  errorsOnWrite: boolean
}

export type UnderlyingStream = Net.Socket | {
  in: Stream.Readable
  out: Stream.Writable
}

export type RawPayloadParams = [type: 0, data: any]
export type RequestPayloadParams = [type: 1, token: Buffer, name: string, parameters: Array<any>]
export type ResponsePayloadParams = [type: 2, token: Buffer, isError: boolean, data: Error]
export type Payload =
  | RawPayloadParams
  | RequestPayloadParams
  | ResponsePayloadParams

export interface ConnectionEvents extends EventInterface {
  listening: []

  data: [data: Payload]
  message: [message: any]
  close: [hadError: boolean]
  error: [error: Error]
  nonCriticalError: [error: Error]
  attach: [stream: UnderlyingStream]
  detach: [stream: UnderlyingStream]
}

export type ConnectionEventEmitter = EventEmitter<ConnectionEvents>

export class Connection<LocalFunctions extends ConnectionFunctions, RemoteFunctions extends ConnectionFunctions> {
  public static new <LocalInterface extends ConnectionFunctions, RemoteInterface extends ConnectionFunctions> (functions: ConnectionFunctionMap<LocalInterface>, socket?: UnderlyingStream, options?: Partial<PortOptions>) {
    return new this<LocalInterface, RemoteInterface>(functions, socket, options)
  }

  public static applyOptions (options?: Partial<PortOptions>): PortOptions {
    return {
      waitAsyncFunctions: false,
      errorsOnWrite: true,
      ...options
    }
  }

  public constructor (functions: ConnectionFunctionMap<LocalFunctions>, stream?: UnderlyingStream, options?: Partial<PortOptions>) {
    const _options = Connection.applyOptions(options)

    const events = new EventEmitter<ConnectionEvents>({ requireErrorHandling: true })
    const { on, off, once, emit } = events.bind()
    this.on = on
    this.once = once
    this.off = off
    this.emit = emit

    const serializer = new LBSerializer.Serializer()
    const pendingRequests: {
      [key: string]: {
        resolve: (data: any) => void
        reject: (error: Error) => void
      }
    } = {}

    const properties: {
      stream?: UnderlyingStream
      destroyed: boolean
    } = {
      destroyed: true
    }

    functions = {
      ...functions,
      _np: () => {},
      _dc: async (_, error) => {
        if (error) {
          await emit('error', error).catch((_error) => { if (_error !== error) { throw error } })
        }

        properties.destroyed = true
      }
    }

    const methods = {
      packPayload: (payload: Payload, encrypt: boolean = !!_options?.key): Buffer => {
        const buffer = serializer.serialize(payload)

        if (encrypt) {
          const { key } = _options

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
      },

      unpackPayload: (payload: Buffer) => {
        if (payload[0]) {
          const { key } = _options

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
      },

      execLocal: async <Name extends keyof LocalFunctions> (name: Name, context: ConnectionFunctionContext, ...args: LocalFunctions[Name][0]): Promise<LocalFunctions[Name][1]> => {
        if (!(name in functions)) {
          throw new Error(`Function ${<string> name} is not available`)
        }

        return await functions[name](context, ...args)
      },

      exec: async <Name extends keyof RemoteFunctions> (name: Name, ...args: RemoteFunctions[Name][0]): Promise<RemoteFunctions[Name][1]> => {
        let token: Buffer
        let tokenStr: string
        do {
          tokenStr = (token = Crypto.randomBytes(8)).toString('hex')
        } while (tokenStr in pendingRequests)

        const promise = new Promise<PromiseFulfilledResult<RemoteFunctions[Name][1]>>((resolve, reject) => (pendingRequests[tokenStr] = { resolve, reject }))
        await methods.write([1, token, <string> name, args], undefined)
        return await promise
      },

      send: (data: any, encrypt?: boolean) => {
        return methods.write([0, data], encrypt)
      },

      destroy: async (error?: Error) => {
        const { stream } = properties

        if (!stream) {
          throw new Error('Not attached to any stream')
        }

        if (!this.destroyed) {
          await methods.exec('_dc', error)
        }

        properties.destroyed = true
        if (stream instanceof Net.Socket) {
          stream.destroy(error)
        } else {
          stream.in.destroy(error)
          stream.out.destroy(error)
        }
      },

      evaluatePayload: async (payload: Payload, isRequestEncrypted: boolean) => {
        await events.emit('data', payload)
        switch (payload[0]) {
          // Raw
          case 0:
            await events.emit('message', payload[1])
            break

          // Request
          case 1: {
            const [, token, name, parameters] = payload
            const context: ConnectionFunctionContext = {
              requestEncrypted: isRequestEncrypted,
              responseEncrypted: isRequestEncrypted
            }

            try {
              const result = await methods.execLocal(name, context, ...parameters)

              await methods.write([2, token, false, result], context.responseEncrypted)
            } catch (error: any) {
              await events.emit('nonCriticalError', error)
              await methods.write([2, token, true, error], context.responseEncrypted)
            }
          } break

          // Response
          case 2: {
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
          } break
        }
      },

      _write: (buffer: Buffer) => {
        return new Promise<void>((resolve, reject) => {
          const { stream } = properties
          if (!stream) {
            throw new Error('Not attached to any stream')
          }
          const { errorsOnWrite } = _options

          if (stream instanceof Net.Socket) {
            if (stream.destroyed) {
              if (errorsOnWrite) {
                throw new Error('Socket already destroyed')
              }

              return
            }

            stream.write(buffer, (error) => error && errorsOnWrite ? reject(error) : resolve())
          } else {
            if (stream.out.destroyed) {
              if (errorsOnWrite) {
                throw new Error('Write stream already destroyed')
              }

              return
            }

            stream.out.write(buffer, (error) => error && errorsOnWrite ? reject(error) : resolve())
          }
        })
      },

      write: (payload: Payload, encrypt?: boolean) => {
        const buffer = methods.packPayload(payload, encrypt)

        let bufferSize = buffer.length.toString(16)
        if (bufferSize.length % 2) {
          bufferSize = `0${bufferSize}`
        }
        const bufferSizeBuffer = Buffer.from(bufferSize, 'hex')
        const bufferSizeBufferLength = Buffer.from([bufferSizeBuffer.length])

        return methods._write(Buffer.concat([bufferSizeBufferLength, bufferSizeBuffer, buffer]))
      },

      attach: (stream: UnderlyingStream) => {
        if (properties.stream) {
          throw new Error('Aleady attached to a stream')
        } else if (stream instanceof Net.Socket) {
          if (stream.destroyed) {
            throw new Error('Socket already destroyed')
          }
        } else if (stream.in.destroyed || stream.out.destroyed) {
          throw new Error('In or out stream already destroyed')
        }

        properties.destroyed = false
        properties.stream = stream

        let isProcessingBufferSink = false
        let bufferSink = Buffer.alloc(0)

        const processPayload = async (buffer: Buffer) => {
          const payload = methods.unpackPayload(buffer)
          await methods.evaluatePayload(payload, !!buffer[0])
        }

        const processBufferSink = async () => {
          const bufferSizeBufferLength = bufferSink[0]
          const bufferSizeBuffer = bufferSink.slice(1, bufferSizeBufferLength + 1)
          if (bufferSizeBufferLength !== bufferSizeBuffer.length) {
            return false
          }

          const bufferSize = Number.parseInt(`${bufferSizeBuffer.toString('hex')}`, 16)
          const buffer = bufferSink.slice(1 + bufferSizeBufferLength, 1 + bufferSizeBufferLength + bufferSize)
          if (bufferSize !== buffer.length) {
            return false
          }

          bufferSink = bufferSink.slice(1 + bufferSizeBuffer.length + buffer.length)

          const task = processPayload(buffer)
          if (_options.waitAsyncFunctions) {
            await task
          }

          return true
        }

        const pushToBufferSink = async (data: Buffer) => {
          bufferSink = Buffer.concat([bufferSink, data])
          if (isProcessingBufferSink) {
            return
          }

          isProcessingBufferSink = true
          try {
            while ((!this.destroyed) && bufferSink.length && await processBufferSink()) {
              // No op
            }
          } catch (error: any) {
            if (stream instanceof Net.Socket) {
              stream.destroy(error)
            } else {
              stream.in.destroy(error)
              stream.out.destroy(error)
            }
          } finally {
            isProcessingBufferSink = false
          }
        }

        if (stream instanceof Net.Socket) {
          const onData = (data: Buffer) => pushToBufferSink(data)
          const onClose = (hadError: boolean) => emit('close', hadError)
          const onError = (error: Error) => emit('error', error)

          stream.on('data', onData)
          stream.on('close', onClose)
          stream.on('error', onError)

          const oldDetach = methods.detach
          const newDetach = (stream: Net.Socket) => {
            oldDetach()

            stream.off('data', onData)
            stream.off('close', onClose)
            stream.off('error', onError)
          }

          methods.detach = newDetach.bind(this, stream)
        } else {
          const { in: input, out: output } = stream
          let hadError = false

          const onData = (data: Buffer) => pushToBufferSink(data)
          const onClose = () => emit('close', hadError)
          const onError = (error: Error) => {
            hadError = true
            return emit('error', error)
          }

          input.on('data', onData)
          input.on('close', onClose)
          input.on('error', onError)

          output.on('close', onClose)
          output.on('error', onError)

          const oldDetach = methods.detach
          const newDetach = (input: Stream.Readable, output: Stream.Writable) => {
            oldDetach()

            input.off('data', onData)
            input.off('close', onClose)
            input.off('error', onError)

            output.off('close', onClose)
            output.off('error', onError)
          }
          methods.detach = () => newDetach.bind(this, input, output)
        }

        emit('attach', stream)
      },

      detach: () => {
        for (const token in pendingRequests) {
          const { [token]: pendingRequest } = pendingRequests
          delete pendingRequests[token]

          pendingRequest.reject(new Error('Detached from the underlying socket.'))
        }

        const { stream } = properties
        if (!stream) {
          throw new Error('Not attached to any stream')
        }

        delete properties.stream
        emit('detach', stream)
      }
    }

    this.destroyed = false

    Object.defineProperties(this, {
      destroyed: {
        get: () => {
          const { stream } = properties

          if (!stream) {
            return true
          } else if (properties.destroyed) {
            return properties.destroyed
          } else if (stream instanceof Net.Socket) {
            return stream.destroyed
          }

          return (stream.in.destroyed || stream.out.destroyed)
        }
      },

      encryptionKey: {
        get: () => _options?.key,
        set: (key?: Buffer) => {
          if (key instanceof Buffer) {
            if (key.length !== 32) {
              throw new Error('Invalid key length')
            }
            _options.key = key
            return
          } else if ((key === null) || (key === undefined)) {
            _options.key = undefined
            return
          }

          throw new Error('Invalid key input')
        }
      },

      underlyingStream: {
        get: () => properties.stream
      }
    })

    if (stream) {
      methods.attach(stream)
    }

    this.execLocal = methods.execLocal.bind(this)
    this.exec = methods.exec.bind(this)
    this.send = methods.send.bind(this)
    this.destroy = methods.destroy.bind(this)
    this.attach = methods.attach.bind(this)
    this.detach = methods.detach.bind(this)
  }

  public readonly on: ConnectionEventEmitter['on']
  public readonly once: ConnectionEventEmitter['once']
  public readonly off: ConnectionEventEmitter['off']
  public readonly emit: ConnectionEventEmitter['emit']

  public readonly underlyingStream?: UnderlyingStream
  public readonly destroyed: boolean
  public encryptionKey?: Buffer

  public readonly execLocal: <Name extends keyof LocalFunctions> (name: Name, context: ConnectionFunctionContext, ...args: LocalFunctions[Name][0]) => Promise<LocalFunctions[Name][1]>
  public readonly exec: <Name extends keyof RemoteFunctions> (name: Name, ...args: RemoteFunctions[Name][0]) => Promise<RemoteFunctions[Name][1]>
  public readonly send: (data: any, encrypt?: boolean) => Promise<void>
  public readonly destroy: (error?: Error) => Promise<void>
  public readonly attach: (stream: UnderlyingStream) => void
  public readonly detach: () => void
}

export interface ServerEvents<LocalFunctions extends ConnectionFunctions, Remotes extends ConnectionFunctions> extends EventInterface {
  connection: [port: Connection<LocalFunctions, Remotes>]
  listening: []
  error: [error: Error]
  close: []
}

export class Server<LocalFunctions extends ConnectionFunctions, RemoteFunctions extends ConnectionFunctions> {
  public constructor (listener: Net.Server, functions: ConnectionFunctionMap<LocalFunctions>, options?: Partial<PortOptions>) {
    this.options = {
      waitAsyncFunctions: false,
      errorsOnWrite: true,
      ...options
    }
    this.listener = listener
    this.functions = functions
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
  public readonly functions: ConnectionFunctionMap<LocalFunctions>
  public readonly events: EventEmitter<ServerEvents<LocalFunctions, RemoteFunctions>>

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
    return Connection.new<LocalFunctions, RemoteFunctions>(this.functions, socket, this.options)
  }
}

export class Agent<LocalInterface extends ConnectionFunctions, RemoteInterface extends ConnectionFunctions> {
  public constructor (map: ConnectionFunctionMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      waitAsyncFunctions: false,
      errorsOnWrite: true,
      ...options
    }
    this.map = map
  }

  public readonly options: PortOptions
  public readonly map: ConnectionFunctionMap<LocalInterface>

  public connect (connectOpts: Net.NetConnectOpts) {
    return new Promise<Connection<LocalInterface, RemoteInterface>>((resolve, reject) => {
      const socket = Net.connect(connectOpts)

      socket.once('error', reject)
      socket.on('ready', () => {
        socket.off('error', reject)

        resolve(Connection.new<LocalInterface, RemoteInterface>(this.map, socket, this.options))
      })
    })
  }
}
