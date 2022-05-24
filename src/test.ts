import Net from 'net'
// import Crypto from 'crypto'

import { Port, PortInterface } from '.'

interface CTest extends PortInterface {
  echo: [args: [arg0: any], returns: any] // Returns the 1st parameter
}

const time = () => Math.round(Date.now() / 1000)

if (process.argv.length <= 3) {
  Net.createServer((socket) => {
    const port = new Port<CTest, {}>(socket, {
      echo: (arg0) => arg0 // Implementations for PortInterface defined above
    })
  }).listen(Number(process.argv[2]))
} else {
  const socket = Net.connect({
    host: process.argv[2],
    port: Number(process.argv[3])
  }).on('connect', async () => {
    const port = new Port<{}, CTest>(socket, {})
    let count = 0

    await Promise.all([
      ...Array(2000).fill(async () => {
        while (true) {
          await port.exec('echo', 'Hello, world!')
          count++
        }
      }),
      async () => {
        while (true) {
          console.log(count)
          count = 0
          await new Promise<void>((resolve) => setTimeout(resolve, 1000))
        }
      }
    ].map((f) => f()))
  })
}
