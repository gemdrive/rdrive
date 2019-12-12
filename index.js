const fs = require('fs');
const path = require('path');


function createHandler(options) {

  let rootPath = '/';

  if (options && options.rootPath) {
    rootPath = options.rootPath;
  }

  return async function(req, res) {
    const reqPath = req.url.slice(rootPath.length);

    if (reqPath.endsWith('remfs.json')) {

      const fsPath = path.join('./', path.dirname(reqPath));

      const remfs = await buildRemfsDir(fsPath);
      res.write(JSON.stringify(remfs, null, 2));
      res.end();
    }
    else {
      serveFile(req, res, reqPath); 
    }
  };
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

  const rangeHeader = req.headers['range'];

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

    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${originalSize}`);
    res.statusCode = 206;

    //sendFile = sendFile.slice(range.start, range.end + 1);
    stream = fs.createReadStream(fsPath, {
      start: range.start,
      end: range.end,
    });
  }
  else {
    res.setHeader('Content-Length', `${stats.size}`);
    stream = fs.createReadStream(fsPath);
  }

  res.setHeader('Accept-Ranges', 'bytes');

  const mime = getMime(path.extname(reqPath));
  if (mime) {
    res.setHeader('Content-Type', mime);
  }

  stream.on('error', (e) => {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
  });
  stream.pipe(res);
}

async function buildRemfsDir(fsPath) {

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


  const remfs = {
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
      remfs.children[filename] = {
        type: 'dir',
        size: stats.size,
      };
    }
    else {
      remfs.children[filename] = {
        type: 'file',
        size: stats.size,
      };
    }
  }

  remfs.size = totalSize;

  return remfs;
}


function getMime(ext) {
  switch (ext) {
    case '.js':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.jpeg':
      return 'image/jpeg';
  }
}


module.exports = {
  createHandler,
};
