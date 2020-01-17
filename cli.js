#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createHandler } = require('./index.js');

const port = process.argv[2];

const remfsHandler = createHandler();
const httpServer = http.createServer(remfsHandler);
httpServer.listen(port);
