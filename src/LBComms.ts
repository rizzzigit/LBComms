import Crypto from 'crypto'
import Net from 'net'
import LBSerializer from '@rizzzi/lb-serializer'

export enum PortCommand {
  SetDelimiter,
  Request,
  Response,
  Padding
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
  randomBytesSize: number
}

export interface PortEvents {

}

export class Port<LocalInterface extends PortInterface, RemoteInterface extends PortInterface> {
  public constructor (socket: Net.Socket, callbacks: PortCallbackMap<LocalInterface>, options?: Partial<PortOptions>) {
    this.options = {
      randomBytesSize: 4,
      blockingEvaluations: false,
      ...options
    }
    this.socket = socket
    this.serializer = new LBSerializer.Serializer({
      ranodmBytesSize: this.options.randomBytesSize
    })
    this.encryption = {
      key: this.options.key ? Buffer.from(this.options.key, 'hex') : undefined
    }
    this.callbacks = {
      ...callbacks,
      np: () => {}
    }
    this.pendingRemoteCalls = {}
    this.isWriteQueueRunning = false
    this.writeQueue = []
    this.delimiter = {
      local: Buffer.alloc(0),
      remote: Buffer.alloc(0)
    }

    this._init()
  }

  public readonly options: PortOptions
  public readonly socket: Net.Socket
  public readonly serializer: LBSerializer.Serializer
  public readonly encryption: { key?: Buffer }
  public readonly callbacks: PortCallbackMap<LocalInterface>
  public readonly pendingRemoteCalls: {
    [key: string]: {
      resolve: (data: any) => void
      reject: (error: Error) => void
    }
  }

  public readonly delimiter: {
    local: Buffer
    remote: Buffer
  }

  public async ping (passCount: number = 1) {
    let ping = 0

    for (let pass = 0; passCount > pass; pass++) {
      const start = Date.now()
      await this.exec('np')
      const stop = Date.now()

      ping += (stop - start)
    }

    return ping / passCount
  }

  public buildRequest (token: Buffer, name: string, ...args: Array<any>) {
    return Buffer.concat([token, this.serializer.serialize({ name, args })])
  }

  public parseRequest (buffer: Buffer): {
    token: Buffer
    name: string
    args: Array<any>
  } {
    const { options: { randomBytesSize } } = this

    const token = buffer.slice(0, randomBytesSize)
    const { name, args } = this.serializer.deserialize(buffer.slice(token.length))

    return { token, name, args }
  }

  public buildRseponse (token: Buffer, result: any) {
    const buffer = Buffer.concat([token, this.serializer.serialize(result)])

    return buffer
  }

  public parseResponse (buffer: Buffer): {
    token: Buffer
    data?: any
  } {
    const { options: { randomBytesSize } } = this
    const token = buffer.slice(0, randomBytesSize)
    const data = this.serializer.deserialize(buffer.slice(randomBytesSize))

    return { token, data }
  }

  public encrypt (buffer: Buffer) {
    if (this.encryption.key) {
      const iv = Crypto.randomBytes(16)
      const cipher = Crypto.createCipheriv('aes256', this.encryption.key, iv)

      return Buffer.concat([
        Buffer.from([0]),
        iv,
        cipher.update(buffer),
        cipher.final()
      ])
    } else {
      return Buffer.concat([
        Buffer.from([1]),
        buffer
      ])
    }
  }

  public decrypt (buffer: Buffer) {
    if (buffer[0] === 0) {
      const iv = buffer.slice(1, 17)
      if (!this.encryption.key) {
        throw new Error('No encryption key specified to decrypt the buffer')
      }

      const decipher = Crypto.createDecipheriv('aes256', this.encryption.key, iv)
      return Buffer.concat([
        decipher.update(buffer.slice(17)),
        decipher.final()
      ])
    } else if (buffer[0] === 1) {
      return buffer.slice(1)
    } else {
      throw new Error(`Invalid byte: 0x${buffer.slice(0, 1).toString('hex')}`)
    }
  }

  public buildPayload (command: PortCommand, ...data: Array<Buffer>) {
    const buffer = Buffer.concat([Buffer.from([command]), ...data])

    return this.encrypt(buffer)
  }

  public parsePayload (buffer: Buffer): {
    command: PortCommand,
    argData: Buffer
  } {
    const decrypt = this.decrypt(buffer)

    const command = decrypt[0]
    const argData = decrypt.slice(1)

    return { command, argData }
  }

  public sendPayload (buffer: Buffer) {
    const { delimiter, options: { randomBytesSize } } = this

    let sink = Buffer.alloc(0)
    if (!delimiter.local.length) {
      const newDelimiter = Crypto.randomBytes(randomBytesSize)
      sink = Buffer.concat([sink, newDelimiter])
      delimiter.local = newDelimiter
    }

    if (buffer.indexOf(delimiter.local) > -1) {
      let newDelimiter: Buffer
      do {
        newDelimiter = Crypto.randomBytes(randomBytesSize)
      } while (buffer.indexOf(delimiter.local) > -1)

      sink = Buffer.concat([sink, this.buildPayload(PortCommand.SetDelimiter, newDelimiter), delimiter.local])
      delimiter.local = newDelimiter
    }

    sink = Buffer.concat([sink, buffer, delimiter.local])
    return this.write(sink)
  }

  public async evaluatePayload (buffer: Buffer) {
    const { command, argData } = this.parsePayload(buffer)

    if (command === PortCommand.Request) {
      const { token, name, args } = this.parseRequest(argData)
      const result = await (async () => {
        try {
          return await this.execLocal(name, ...args)
        } catch (error) {
          return error
        }
      })()

      await this.sendPayload(this.buildPayload(PortCommand.Response, this.buildRseponse(token, result)))
    } else if (command === PortCommand.Response) {
      const { pendingRemoteCalls } = this
      const { token, data } = this.parseResponse(argData)
      const tokenStr = token.toString('hex')

      const { [tokenStr]: { resolve, reject } } = pendingRemoteCalls
      delete pendingRemoteCalls[tokenStr]

      if (data instanceof Error) {
        reject(data)
      } else {
        resolve(data)
      }
    } else if (command === PortCommand.SetDelimiter) {
      const { delimiter } = this
      delimiter.remote = argData
    } else if (command === PortCommand.Padding) {
      //
    }
  }

  public async exec<Name extends keyof RemoteInterface> (name: Name, ...args: RemoteInterface[Name][0]): Promise<RemoteInterface[Name][1]> {
    const { pendingRemoteCalls, options: { randomBytesSize } } = this

    const token = await (async () => {
      let token: Buffer
      do {
        token = Crypto.randomBytes(randomBytesSize)
      } while (token.toString('hex') in pendingRemoteCalls)
      return token
    })()
    const tokenStr = token.toString('hex')
    const payload = this.buildPayload(PortCommand.Request, this.buildRequest(token, <string> name, ...args))
    const promise = new Promise<RemoteInterface[Name][1]>((resolve, reject) => (pendingRemoteCalls[tokenStr] = { resolve, reject }))

    this.sendPayload(payload)
    return promise
  }

  public async execLocal<Name extends keyof LocalInterface> (name: Name, ...args: LocalInterface[Name][0]): Promise<LocalInterface[Name][1]> {
    return await this.callbacks[name](...args)
  }

  public async _write (buffer: Buffer) {
    await new Promise<void>((resolve, reject) => this.socket.write(buffer, (error) => error ? reject(error) : resolve()))
  }

  public isWriteQueueRunning: boolean
  public readonly writeQueue: Array<{
    buffer: Buffer
    resolve: () => void
    reject: (error: Error) => void
  }>

  public async runWriteQueue () {
    const { writeQueue } = this
    if (this.isWriteQueueRunning) {
      return
    }

    this.isWriteQueueRunning = true
    try {
      while (writeQueue.length) {
        const aggregate: Array<{
          resolve: () => void
          reject: (error: Error) => void
        }> = []
        let sink = Buffer.alloc(0)

        while (writeQueue.length) {
          const { buffer, resolve, reject } = <typeof writeQueue[0]> writeQueue.shift()
          sink = Buffer.concat([sink, buffer])
          aggregate.push({ resolve, reject })
        }

        try {
          await this._write(sink)

          for (const { resolve } of aggregate) {
            resolve()
          }
        } catch (error: any) {
          for (const { reject } of aggregate) {
            reject(error)
          }
        }
      }
    } finally {
      this.isWriteQueueRunning = false
    }
  }

  public async write (buffer: Buffer) {
    return await new Promise<void>((resolve, reject) => {
      this.writeQueue.push({ buffer, resolve, reject })
      if (!this.isWriteQueueRunning) {
        this.runWriteQueue()
      }
    })
  }

  public async _init () {
    const { socket, options: { randomBytesSize, blockingEvaluations }, delimiter } = this

    let sink = Buffer.alloc(0)

    let dataCallback = () => {}

    socket.on('data', (data) => {
      sink = Buffer.concat([sink, data])
      dataCallback()
    })
    socket.on('close', () => {
      dataCallback()
    })

    while (!socket.destroyed) {
      if (!sink.length) {
        await new Promise<void>((resolve) => { dataCallback = resolve })
      }

      if (!delimiter.remote.length) {
        if (sink.length < randomBytesSize) {
          continue
        }

        delimiter.remote = sink.slice(0, randomBytesSize)
        sink = sink.slice(randomBytesSize)
      }

      let delimiterIndex
      while (sink.length && ((delimiterIndex = sink.indexOf(delimiter.remote)) > -1)) {
        const payload = sink.slice(0, delimiterIndex)
        sink = sink.slice(delimiterIndex + delimiter.remote.length)

        if (payload.length) {
          const evaluationTask = this.evaluatePayload(payload)
          if (blockingEvaluations) {
            await evaluationTask
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}
