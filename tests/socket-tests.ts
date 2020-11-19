import { describe } from "mocha";
import assert from 'assert'
import makeClient from "../socket/client";
import makeServer, { MyServer } from "../socket/server";

const HOST = '127.0.0.1'
const PORT = 5000

const ADDR = { address: HOST, port: PORT, family: 'ipv4' }

describe('Main', () => {
    let server: MyServer
    before(() => {
        server = makeServer(PORT)
    })
    after(() => {
        server.close()
    })

    it('should connect a client & obtain boundary', function (done) {
        let serverBoundary: Buffer
        makeClient(ADDR, client => {
            client.on('received-boundary', ({boundary}) => {
                assert.ok(serverBoundary)
                assert.deepStrictEqual(boundary, serverBoundary)
                client.end(done)
            })
        })
        server.once('connected-client', client => {
            serverBoundary = client.boundary
        })
    })
    it('should send/receive JSONs', function (done) {
        /**
         * Basic echo server test with a few rounds of testing
         */
        const ROUNDS_TO_DO = 5

        let roundsDone = 0
        const TEST_JSON = { test: true, str: 'wow cool string' }
        makeClient(ADDR, client => {
            client.on('json', json => {
                assert.deepStrictEqual(json, TEST_JSON)
                // echo
                client.sendJSON(json)
            })
        })
        server.once('connected-client', client => {
            client.sendJSON(TEST_JSON)
            client.on('json', json => {
                roundsDone += 1
                assert.deepStrictEqual(json, TEST_JSON)

                if (roundsDone >= ROUNDS_TO_DO) {
                    client.end(done)
                } else {
                    client.sendJSON(json)
                }
            })
        })
    })
    it('should handle concurrent requests', function (done) {
        /**
         * Sends multiple concurrent requests to & fro a single client
         */
        const REQ_COUNT = 50
        makeClient(ADDR, client => {
            client.handleRequest(
                (type, data) => {
                    if (type === 'increment') {
                        return { number: data.number+1 }
                    }
                    throw new Error('unknown request: ' + type)
                }
            )
        })
        server.once('connected-client', client => {
            Promise.all(
                [...Array(REQ_COUNT)].map (() => {
                    const number = Math.random()*100
                    client.request('increment', { number })
                    .then(data => assert.strictEqual(data.number, number+1))
                    .catch(assert.fail)
                })
            )
            .then(() => client.end(done))
        })
    })
})