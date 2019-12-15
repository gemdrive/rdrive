const fs = require('fs');
const path = require('path');
const url = require('url');


function createHandler(options) {

  let rootPath = '/';

  if (options && options.rootPath) {
    rootPath = options.rootPath;
  }

  return async function(req, res) {
    const u = url.parse(req.url); 
    const reqPath = decodeURIComponent(u.pathname.slice(rootPath.length));

    if (reqPath.endsWith('remfs.json')) {

      const fsPath = path.join('./', path.dirname(reqPath));

      const remfs = await buildRemfsDir(fsPath);
      res.write(JSON.stringify(remfs, null, 2));
      res.end();
    }
    else {
      serveItem(req, res, rootPath, reqPath); 
    }
  };
}

async function serveItem(req, res, rootPath, reqPath) {

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

  // render simple html interface
  if (stats.isDirectory()) {
    await renderHtmlDir(req, res, rootPath, reqPath, fsPath);
  }
  else {

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
}

async function renderHtmlDir(req, res, rootPath, reqPath, fsPath) {
  let filenames;
  try {
    filenames = await fs.promises.readdir(fsPath);
  }
  catch (e) {
    res.statusCode = 500;
    res.write("Error reading directory");
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/html');

  let pathParts = reqPath.split('/');

  let listing;
  if (pathParts.length > 1) {
    pathParts.pop();
    const parentUrl = rootPath + pathParts.join('/');
    listing = `<a href=${parentUrl}>..[parent]</a> &#128193`;
  }
  else {
    listing = '';
  }

  for (const filename of filenames) {

    const url = rootPath + reqPath + '/' + filename;
    const childFsPath = path.join(fsPath, filename);

    let childStats;
    try {
      childStats = await fs.promises.stat(childFsPath);
    }
    catch (e) {
      console.error("This one shouldn't happen");
      console.error(e);
      continue;
    }

    let link;
    if (childStats.isDirectory()) {
      link = `<a href=${url}>${filename}</a> &#128193`;
    }
    else {
      link = `<a target='_blank' href=${url}>${filename}</a>`;
    }

    listing += `
      <div>
        ${link}
      </div>
    `;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>remFS</title>
      </head>

      <body>
        <div style='margin: 0 auto; max-width: 640px; font-size: 24px;'>
          ${listing}
        </div>
      </body>
    </html>
  `;

  res.write(html);
  res.end();
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
    const childFsPath = path.join(fsPath, filename);

    let stats;
    try {
      stats = await fs.promises.stat(childFsPath);
    }
    catch (e) {
      console.error("This one shouldn't happen");
      console.error(e);
      continue;
    }

    totalSize += stats.size;

    if (stats.isDirectory()) {
      //remfs.children[filename] = {
      //  type: 'dir',
      //  size: stats.size,
      //};
      remfs.children[filename] = await buildRemfsDir(childFsPath);
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
    case '.jpg':
    case '.JPEG':
    case '.JPG':
      return 'image/jpeg';
  }
}


module.exports = {
  createHandler,
};
