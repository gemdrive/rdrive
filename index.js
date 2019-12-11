const fs = require('fs');
const path = require('path');
const http = require('patchbay-http');


const requestPrefix = 'pb-req-';
const responsePrefix = 'pb-res-';

class WebFSServer {
  async start() {
    const rootChannel = '/webfs-test';
    const prefix = '/req' + rootChannel;

    this.httpServer = http.createServer(async (req, res) => {
      const reqPath = req.url.slice(prefix.length);


      if (reqPath.endsWith('webfs.json')) {

        const fsPath = path.join('./', path.dirname(reqPath));

        const webfs = await buildWebfsDir(fsPath);
        res.write(JSON.stringify(webfs, null, 2));
        res.end();
      }
      else {
        serveFile(req, res, reqPath); 
      }
    });

    this.httpServer.setPatchbayServer('https://patchbay.pub');
    //srv.setPatchbayServer('http://localhost:9001');
    this.httpServer.setPatchbayChannel(rootChannel);
    this.httpServer.listen();
  }
}

async function serveFile(req, res, reqPath) {

  res.on('error', (e) => {
    console.error(e);
  });

  const fsPath = path.join('./', reqPath);

  let stats
  try {
    stats = await fs.promises.stat(fsPath);
  }
  catch (e) {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
    return;
  }

  const rangeHeader = req.headers['pb-req-range'];

  // TODO: parse byte range specs properly according to
  // https://tools.ietf.org/html/rfc7233
  if (rangeHeader) {

    const range = {};
    const right = rangeHeader.split('=')[1];
    const rangeParts = right.split('-');
    range.start = Number(rangeParts[0]);
    range.end = stats.size - 1;

    if (rangeParts[1]) {
      // Need to add one because HTTP ranges are inclusive
      range.end = Number(rangeParts[1]);
    }

    const originalSize = stats.size;

    res.setHeader(responsePrefix + 'Content-Range', `bytes ${range.start}-${range.end}/${originalSize}`);
    res.statusCode = 206;

    //sendFile = sendFile.slice(range.start, range.end + 1);
    stream = fs.createReadStream(fsPath, {
      start: range.start,
      end: range.end,
    });
  }
  else {
    res.setHeader(responsePrefix + 'Content-Length', `${stats.size}`);
    stream = fs.createReadStream(fsPath);
  }

  res.setHeader(responsePrefix + 'Accept-Ranges', 'bytes');

  stream.on('error', (e) => {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
  });
  stream.pipe(res);
}

async function buildWebfsDir(fsPath) {

  let filenames;
  try {
    filenames = await fs.promises.readdir(fsPath);
  }
  catch (e) {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
    return;
  }


  const webfs = {
    type: 'dir',
    children: {},
  };

  let totalSize = 0;

  for (const filename of filenames) {
    const childPath = path.join(fsPath, filename);

    let stats;
    try {
      stats = await fs.promises.stat(childPath);
    }
    catch (e) {
      console.error("This one shouldn't happen");
      console.error(e);
      continue;
    }

    totalSize += stats.size;

    if (stats.isDirectory()) {
      webfs.children[filename] = {
        type: 'dir',
        size: stats.size,
      };
    }
    else {
      webfs.children[filename] = {
        type: 'file',
        size: stats.size,
      };
    }
  }

  webfs.size = totalSize;

  return webfs;
}

function createWebFSServer() {
  return new WebFSServer();
}

module.exports = {
  createWebFSServer
};
