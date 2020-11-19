import { describe } from "mocha";
import assert from 'assert'
import makeClient from "../socket/client";
import makeServer, { MyServer } from "../socket/server";
import { AppServer, makeAppClient, makeAppServer } from "../app";

const HOST = '127.0.0.1'
const PORT = 5000

const ADDR = { address: HOST, port: PORT, family: 'ipv4' }

describe('Main', () => {
    let server: AppServer

    before(() => {
        server = makeAppServer(PORT)
    })
    after(() => {
        server.close()
    })

    it('should receive a mac address', function (done) {
        let receivedMac = false
        makeClient(ADDR, sock => {
            const client = makeAppClient(sock)
            client.answer = async question => {
                return '3'
            }
            client.on('json', json => {
                if (json.info) {
                    assert.ok(receivedMac)
                    client.end(done)
                }
            })
        })
        server.once('connected-client', client => {
            client.on('received-mac-address', mac => {
                console.log('mac: ', mac)
                receivedMac = true
            })
        })
    })
})