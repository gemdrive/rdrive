#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createHandler } = require('./index.js');

const args = process.argv
  .slice(2)
  .map(arg => arg.split('='))
  .reduce((args, [value, key]) => {
      args[value] = key;
      return args;
  }, {});

//if (!args['--dir']) {
//  console.log("Usage: remfs-server [--port=PORT] [--dir=DIR]");
//  process.exit(1);
//}
//

const port = args['--port'] ? args['--port'] : 9001;
const dir = args['--dir'] ? args['--dir'] : './';
const rootPath = args['--root-path'] ? args['--root-path'] : '';

(async () => {
  const remfsHandler = await createHandler({ rootPath, dir });
  const httpServer = http.createServer(remfsHandler);
  httpServer.listen(port);
})();
