import Net from 'net'
import Crypto from 'crypto'

import LBComms from '.'

interface CTest extends LBComms.PortInterface {
  echo: [args: [arg0: any], returns: any], // Returns the 1st parameter
  read: [args: [size: number], returns: Promise<Buffer>], // Returns random bytes
  error: [args: [message?: string], returns: void] // throws an error
}

const time = () => Math.round(Date.now() / 1000)
const key = '0'.repeat(64)

const run = async () => {
  const map: LBComms.PortCallbackMap<CTest> = {
    echo: (_, arg0) => arg0,
    read: (_, size) => new Promise<Buffer>((resolve, reject) => Crypto.randomBytes(size, (error, buffer) => error ? reject(error) : resolve(buffer))),
    error: (_, message) => { throw new Error(message) }
  }

  if (process.argv.length <= 3) {
    const server = new LBComms.Server(Net.createServer(), map, { key })
    await server.listen(Number(process.argv[2]))
  } else {
    const client = new LBComms.Agent(map, { key })
    const connection = await client.connect({
      host: process.argv[2],
      port: Number(process.argv[3])
    })

    console.log(connection)
    console.log(await connection.exec('echo', 'Hello'))
  }
}

run()
