#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createHandler } = require('./index.js');

const webfsHandler = createHandler();
const httpServer = http.createServer(webfsHandler);
httpServer.listen(3000);
