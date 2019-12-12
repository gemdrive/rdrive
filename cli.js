#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createHandler } = require('./index.js');

const remfsHandler = createHandler();
const httpServer = http.createServer(remfsHandler);
httpServer.listen(3000);
