import { randomBytes } from 'crypto'
import { AddressInfo, connect, Socket } from 'net'

const BOUNDARY_LEN = 8

export type MyClient = Socket & { 
    boundary?: Buffer
    sendBoundary: (b?: Buffer, cb?: (err?: Error) => void) => void
    sendJSON: (json: any, cb?: (err?: Error) => void) => void 

    request: (type: string, data: any, timeout?: number) => Promise<any>
    handleRequest: (respond: (type: string, data: any) => Promise<any> | any) => void

    on(event: 'received-boundary', listener: (data: {boundary: Buffer}) => void)
    on(event: 'json', listener: (data: {[_: string]: any}) => void)
}

const makeClient = ({address, port}: AddressInfo, onClient?: (client: MyClient) => void) => {
    const client = connect({ port, localAddress: address })
    makeClientFromSocket(client, onClient)
}
export const makeClientFromSocket = (socket: Socket, onClient?: (client: MyClient) => void) => {
    const client = socket as MyClient

    client.sendBoundary = (boundary, cb) => {
        client.boundary = boundary || randomBytes(BOUNDARY_LEN)
        client.write(client.boundary)
        cb && cb()
    }
    client.sendJSON = (json, cb) => {
        const buff = Buffer.concat([
            Buffer.from ( JSON.stringify(json) ),
            client.boundary
        ])
        client.write(buff)
        cb && cb()
    }
    client.request = (type, data, timeout) => {
        const tag = randomBytes(4).toString('hex')
        const json = { tag, request: { type, data } }

        client.sendJSON(json)

        return new Promise((resolve, reject) => {
            const rejectPromise = err => {
                reject(err)
                client.off('json', listener)
            }
            const listener = json => {
                if (json.tag === tag && json.response) {
                    if (json.response.error) rejectPromise(new Error(json.response.error))
                    else {
                        resolve(json.response.data)
                        client.off('json', listener)
                    }
                }
            }
            client.on('json', listener)
        })
    }
    client.handleRequest = handler => {
        client.on('json', json => {
            if (json.request) {
                const tag = json.tag
                ;(async () => {
                    try {
                        const data = await handler(json.request.type, json.request.data)
                        client.sendJSON({ tag, response: { data } })
                    } catch (error) { 
                        client.sendJSON({ tag, response: { error: error.message } }) 
                    }
                })()
            }
        })
    }

    let currentBuffer = Buffer.from([])
    client.on('data', data => {
        if (!client.boundary || client.boundary.length < BOUNDARY_LEN) {
            const bytesRem = BOUNDARY_LEN - (client.boundary?.length || 0)
            client.boundary = Buffer.concat([ client.boundary || Buffer.from([]), data.slice(0, bytesRem) ])
            data = data.slice(bytesRem)

            if (client.boundary.length === BOUNDARY_LEN) {
                //console.log('received boundary: ', client.boundary.toString('hex'))
                client.emit('received-boundary', { boundary: client.boundary })
            }
        }
        currentBuffer = Buffer.concat([ currentBuffer, data ])

        if (currentBuffer.length > BOUNDARY_LEN) {
            let idx = 0
            do {
                idx = currentBuffer.indexOf(client.boundary)
                if (idx < 0) break

                const buff = currentBuffer.slice(0, idx)
                let json: any
                try {
                    json = JSON.parse(buff.toString('utf-8'))
                } catch (error) {
                    console.error('error in parsing ', buff.toString('utf-8'), error)
                    client.emit('parsing-error', { buffer: buff, error })
                }   
                currentBuffer = currentBuffer.slice(idx + BOUNDARY_LEN)
                if (json) client.emit('json', json)
            } while (idx > 0)
        }
    })

    onClient && onClient(client)
}
export default makeClient