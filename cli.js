#!/usr/bin/env node
const process = require('process');

const { createWebFSServer } = require('./index.js');

const options = {};

const patchbay = process.argv[2] === '--patchbay';
if (patchbay) {
  const http = require('patchbay-http');
  options.httpServer = http.createServer();
  options.httpServer.setPatchbayServer('https://patchbay.pub');
  //srv.setPatchbayServer('http://localhost:9001');
  options.httpServer.setPatchbayChannel('/webfs-test');
  options.rootPath = '/req/webfs-test';
}
else {
  const http = require('http');
  options.httpServer = http.createServer();
}

const srv = createWebFSServer(options);
srv.start();
