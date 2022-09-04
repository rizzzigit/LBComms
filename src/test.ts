import Net from 'net'
import Crypto from 'crypto'

import LBComms from '.'

interface CTest extends LBComms.ConnectionFunctions {
  echo: [args: [arg0: any], returns: any], // Returns the 1st parameter
  read: [args: [size: number], returns: Promise<Buffer>], // Returns random bytes
  error: [args: [message?: string], returns: void] // throws an error
}

const time = () => Math.round(Date.now() / 1000)
const key = Buffer.from('0'.repeat(64), 'hex')

const run = async () => {
  const map: LBComms.ConnectionFunctionMap<CTest> = {
    echo: (_, arg0) => arg0,
    read: (_, size) => new Promise<Buffer>((resolve, reject) => Crypto.randomBytes(size, (error, buffer) => error ? reject(error) : resolve(buffer))),
    error: (_, message) => { throw new Error(message) }
  }

  if (process.argv.length <= 3) {
    const server = new LBComms.Server(Net.createServer(), map, { key })
    await server.listen(Number(process.argv[2]))
  } else {
    const client = new LBComms.Agent<CTest, CTest>(map, { key })
    const connection = await client.connect({
      host: process.argv[2],
      port: Number(process.argv[3])
    })

    const timeout = Date.now() + 10000
    let count = 0
    while (true) {
      console.log(++count)
      await connection.exec('read', 16 * 1024)

      if (timeout < Date.now()) {
        break
      }
    }

    await connection.destroy()
  }
}

const run2 = async () => {
  const listener = Net.createServer()
  listener.listen(8080)
  listener.on('connection', (socket) => {
    const e = new LBComms.Connection<{}, {}>({}, socket)

    e.on('error', (error) => console.log('Server error', error))
  })

  const e = new LBComms.Connection<{}, {}>({})

  while (true) {
    await new Promise<void>((resolve, reject) => {
      const socket = Net.connect({ port: 8080 })

      socket.once('error', reject)
      socket.once('ready', () => (async () => {
        socket.off('error', reject)

        e.attach(socket)
        e.on('error', (error) => console.log('Client error', error))
        await e.destroy(new Error('test'))
        e.detach()
      })().then(resolve, reject))
    })
  }
}

run2()
