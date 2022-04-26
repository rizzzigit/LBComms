import Net from 'net'

import { Port, PortInterface } from '.'

interface CTest extends PortInterface {
  echo: [args: [arg0: any], returns: any] // Returns the 1st parameter
}

Net.createServer((socket) => {
  const port = new Port<CTest, {}>(socket, {
    echo: (arg0) => arg0 // Implementations for PortInterface defined above
  })
}).listen(8080)

const socket = Net.connect({
  host: 'localhost',
  port: 8080
}).on('connect', async () => {
  const port = new Port<{}, CTest>(socket, {})

  while (true) {
    console.log(await port.exec('echo', 'Hello world!'))
  }
})
