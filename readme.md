# Ashoka CS-1340 A4P2

## Project structure

The project is written in NodeJS + typescript

1. `app.ts` contains all the logic for the assigment. `app-data.json` contains the data to run the server
2. `socket/` contains the logic for starting a TCP server & client. It also contains the code to setup a random binary boundary to differentiate between messages
3. `tests/` contains the tests for the correctness of the server/client comms

## Running the project

1. Clone
2. In terminal, run `yarn` or `npm install`
3. To run the server app, run `yarn start:server` or `npm run start:server`
4. To run a client app, run `yarn start:client` or `npm run start:client`
5. To run both in the same process, run `yarn start` or `npm run start`

Also:
- The app server supports concurrent access to clients
- The app supports clients from other other computers and LANs