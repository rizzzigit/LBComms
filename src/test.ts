import Net from 'net'
import Crypto from 'crypto'

import { Port, PortInterface } from '.'

interface CTest extends PortInterface {
  echo: [args: [arg0: any], returns: any], // Returns the 1st parameter
  read: [args: [size: number], returns: Promise<Buffer>] // Returns random bytes
}

const time = () => Math.round(Date.now() / 1000)
const key = '0'.repeat(64)

if (process.argv.length <= 3) {
  Net.createServer((socket) => {
    const port = new Port<CTest, {}>(socket, {
      echo: (arg0) => arg0, // Implementations for PortInterface defined above,
      read: (size) => new Promise<Buffer>((resolve, reject) => Crypto.randomBytes(size, (error, buffer) => error ? reject(error) : resolve(buffer)))
    }, {
      key,
      blockingExecutions: true
    })
  }).listen(Number(process.argv[2]))
} else {
  const socket = Net.connect({
    host: process.argv[2],
    port: Number(process.argv[3])
  }).on('connect', async () => {
    const port = new Port<{}, CTest>(socket, {}, {
      key
    })
    let reqCount = 0
    let resCount = 0

    await Promise.all([
      ...Array(1000).fill(async () => {
        while (true) {
          // await port.exec('echo', 'Hello, world!')
          reqCount++
          await port.exec('read', 1024 * 4)
          resCount++
        }
      }),
      async () => {
        while (true) {
          console.log('Request sent:', reqCount, 'Response received:', resCount)

          reqCount = 0
          resCount = 0
          await new Promise<void>((resolve) => setTimeout(resolve, 1000))
        }
      },
      async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10000))
        await port.destroy()
      }
    ].map((f) => f()))
  })
}
