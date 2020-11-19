import makeClient, { MyClient } from "./socket/client"
import makeServer, { MyServer } from "./socket/server"
import AppData from './app-data.json'
import MacAddress from 'macaddress'
import { AddressInfo } from "net"
import Readline from 'readline'

/**
 * Parses an hh:mm string. For example 14:50
 * @param time 
 */
const parseHMString = (time: string) => {
    const [h,m] = time.split(':')
    return (+h)*60*60 + (+m)*60
}
const secondsSinceDay = (date: Date = new Date()) => date.getHours()*60*60 + date.getMinutes()*60 + date.getSeconds()
const MAX_SCORE = 100

export type AppServer = MyServer & {
    scoreTable: { [_: string]: { score: number, answerTime: Date } }
    optionsMetadata: { [_: string]: number }
}
export type AppClient = MyClient & {
    mac?: string
    waitForMacAddress: () => Promise<AppClient>
    answer: (question: string) => Promise<string>
    endWithInfo: (info: string) => void
    on(event: 'received-mac-address', listener: (mac: string) => void): AppClient
}
export const makeAppServer = (port?: number) => {
    const startTime = parseHMString(AppData["time-range"][0])
    const endTime = parseHMString(AppData["time-range"][1])

    const server = makeServer(port) as AppServer
    server.scoreTable = {}
    server.optionsMetadata = AppData['mcq-options'].reduce((p, opt) => ({ ...p, [opt]: 0 }), {})
    server.on('connected-client', client => (
        makeAppClient(client)
        .waitForMacAddress()
        .then(client => (
            client.request('question', { question: AppData['intro-question'] })
            .then(data => ({ client, data }))
        ))
        .then(({client, data}) => {
            const { answer } = data
            const secs = secondsSinceDay()
            const clientData = server.scoreTable[client.mac]
            
            switch(answer?.toString()) {
                case '1':
                    if (secs >= startTime && secs <= endTime) {
                        if (clientData) {
                            client.endWithInfo('U cannot participate again. Out.')
                        } else {
                            return (
                                client.request('question', { question: AppData.mcq }).then(data => ({ client, data }))
                            )
                        }
                    } else {
                        client.endWithInfo('Sorry, no MCQ 4 u')
                    }
                    break
                case '2':
                    let str = ''
                    if (secs >= endTime) {
                        if (clientData) str = `Your score is ${clientData.score}/${MAX_SCORE}`
                        else str = 'Seems like you never answered the question. So, 0 for you.'

                        str += `\n\nAlso, the number of responses each option for the MCQ has received: ${JSON.stringify(server.optionsMetadata)}`
                    } else str = 'The time is not right to view the score'
                    
                    client.endWithInfo(str)
                    break
                case '3':
                    client.endWithInfo('Okie bye')
                    break
                default:
                    client.endWithInfo('Invalid option: ' + answer)
                    break
            }
        })
        .then(inp => {
            if (!inp) return
            const { client, data } = inp
            
            console.log(`${client.mac} answered with "${data.answer}" at ${new Date()}`)
            
            const score = data.answer === AppData["mcq-answer"] ? MAX_SCORE : 0
            server.scoreTable[client.mac] = { score, answerTime: new Date() }

            if (typeof server.optionsMetadata[data.answer] !== 'undefined') {
                server.optionsMetadata[data.answer] += 1
            }
            client.endWithInfo(`Thank you for participating. Your response is registered against your MAC address - ${client.mac}`)
        })
    ))

    return server
}

export const makeAppClient = (sock: MyClient) => {
    const client = sock as AppClient
    client.waitForMacAddress = () => (
        new Promise((resolve, reject) => {
            client.once('json', ({ mac }) => {
                if (!mac) {
                    client.end()
                    reject(new Error('mac address not sent!'))
                }
                client.mac = mac
                client.emit('received-mac-address', mac)
                resolve(client)
            })
        })
    )
    client.on('received-boundary', () => {
        MacAddress.one()
        .then(mac => client.sendJSON({ mac }))
        .catch(error => {
            console.error('could not obtain mac address', error)
            client.end()
        })
    })
    client.handleRequest(
        async (type, data) => {
            if (type === 'question') {
                const answer = client.answer && await client.answer(data.question)
                return { answer }
            }
        }
    )
    client.endWithInfo = info => {
        client.sendJSON({ info })
        client.end()
    }
    return client
}
export const makeInteractiveAppClient = (address: AddressInfo) => {
    makeClient(address, sock => {
        console.log('[I] ctrl+c to exit')

        const rl = Readline.createInterface({ input: process.stdin, output: process.stdout })
        
        const client = makeAppClient(sock)
        client.on('json', json => {
            json.info && console.log(`[I] ${json.info}`)
        })
        client.answer = async question => {
            console.log(`[Q] ${question}`)
            const ans: string = await new Promise(resolve => rl.question('[A] ', resolve))
            return ans
        }
        client.on('close', () => process.exit(0))
    })

}

if (require.main === module) {
    const { argv } = process
    const getArgument = (arg: string) => argv.indexOf(arg) >= 0 && argv[argv.indexOf(arg) + 1]
    
    if (argv.indexOf('server') >= 0) {
        makeAppServer(+(getArgument('--port') || 5545))
    }
    
    if (argv.indexOf('client') >= 0) {
        makeInteractiveAppClient({
            address: getArgument('--address') || '127.0.0.1',
            port: +(getArgument('--port') || 5545),
            family: 'ipv4'
        })
    }
    
}