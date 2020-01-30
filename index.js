const fs = require('fs');
const path = require('path');
const url = require('url');
const { renderHtmlDir } = require('./render_html_dir.js');
const { Pauth, Perms } = require('./pauth.js');


function createHandler(options) {

  let rootPath = '/';

  if (options && options.rootPath) {
    rootPath = options.rootPath;
  }

  const autho = new Pauth();

  return async function(req, res) {
    const u = url.parse(req.url); 
    const reqPath = decodeURIComponent(u.pathname.slice(rootPath.length));


    if (req.headers['content-type'] === 'application/json') {

      const token = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
          data += chunk;
        });

        req.on('end', async () => {
          try {
            const body = JSON.parse(data);
            console.log(body);
            if (body.method === 'authenticate') {
              const token = await autho.authenticate(body.params.email);
              resolve(token);
            }
          }
          catch (e) {
            reject(e);
          }
        });
      });

      res.write(token);
      res.end();
      return;
    }

    //const remfs = await getRemfs(reqPath);
    //const perms = new Perms(remfs.perms);

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

async function getRemfs(path) {
  const parts = parsePath(path);

  const remfs = {};
  const localRemfs = await readLocalRemfs('./');
  Object.assign(remfs, localRemfs);

  let curPath = '.';
  for (const part of parts) {
    curPath += '/' + part;
    console.log(curPath);
    const localRemfs = await readLocalRemfs(curPath);
    Object.assign(remfs, localRemfs);
  }

  return remfs;
}

async function readLocalRemfs(fsPath) {
  const localRemfsPath = path.join(fsPath, 'remfs.json');
  try {
    const localRemfsDataText = await fs.promises.readFile(localRemfsPath, {
      encoding: 'utf8',
    });
    const localRemfsData = JSON.parse(localRemfsDataText);
    return localRemfsData;
  }
  catch (e) {
    //console.log("no remfs in", fsPath);
  }
}

function parsePath(path) {
  if (path.endsWith('/')) {
    path = path.slice(0, path.length - 1);
  }

  if (path === '' || path === '/') {
    return [];
  }

  return path.slice(1).split('/');
}

async function serveItem(req, res, rootPath, reqPath) {

  res.setHeader('Cache-Control', 'max-age=3600');
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
    let isWebDir = false;
    const localRemfsPath = path.join(fsPath, 'remfs.json');
    try {
      const localRemfsDataText = await fs.promises.readFile(localRemfsPath, {
        encoding: 'utf8',
      });
      const localRemfsData = JSON.parse(localRemfsDataText);
      isWebDir = localRemfsData.ext.http && localRemfsData.ext.http.isWebDir;
      redirect = localRemfsData.ext.http && localRemfsData.ext.http.redirect;

      if (redirect) {
        res.statusCode = 307;
        res.setHeader('Location', redirect.location);
        res.write("Temporary Redirect");
        res.end();
        return;
      }
    }
    catch (e) {
      //console.log(e);
    }

    if (isWebDir) {
      const indexPath = path.join(fsPath, 'index.html');
      const stream = fs.createReadStream(indexPath)
      stream.on('error', (e) => {
        res.statusCode = 404;
        res.write("Not Found");
        res.end();
      });
      stream.pipe(res);
    }
    else {
      await renderHtmlDir(req, res, rootPath, reqPath, fsPath);
    }
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

  const localRemfs = await readLocalRemfs(fsPath);
  Object.assign(remfs, localRemfs);

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
      remfs.children[filename] = {
        type: 'dir',
        size: stats.size,
      };
      //remfs.children[filename] = await buildRemfsDir(childFsPath);
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
    case '.svg':
      return 'image/svg+xml';
  }
}


module.exports = {
  createHandler,
};
