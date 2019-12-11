#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createWebFSServer } = require('./index.js');

const httpServer = http.createServer();

const srv = createWebFSServer({
  httpServer,
});

srv.start();
