import Net, { Server } from 'net'
import { makeClientFromSocket, MyClient } from './client'

export type MyServer = Server & {
    on(ev: 'connected-client', listener: (client: MyClient) => void): MyServer
}

const makeServer = (port: number) => {
    const server = Net.createServer()
    server.on('close', () => {})
    
    server.on('connection', conn => {
        makeClientFromSocket(conn, client => (
            client.sendBoundary(undefined, () => (
                server.emit('connected-client', client)
            ))
        ))
    })

    server.listen(port, '0.0.0.0', () => {
        console.log(`listening on ${port}`)
    })
    return server as MyServer
}
export default makeServer