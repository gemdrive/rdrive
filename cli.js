#!/usr/bin/env node

const { createWebFSServer } = require('./index.js');

const srv = createWebFSServer();
srv.start();
