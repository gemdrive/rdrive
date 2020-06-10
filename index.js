const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const http = require('https');
const { spawn } = require('child_process');
const { renderHtmlDir } = require('./render_html_dir.js');
const { PauthBuilder } = require('pauth');
const { parseToken, parsePath, encodePath, buildRemfsDir, getMime } = require('./utils.js');
const { handleUpload } = require('./upload.js');
const { handleDelete } = require('./delete.js');
const { handleConcat } = require('./concat.js');
const { handleRemoteDownload } = require('./remote_download.js');
const { handleImage } = require('./images.js');
const rclone = require('./rclone.js');


async function createHandler(options) {

  let rootPath = '/';

  if (options && options.rootPath !== undefined) {
    rootPath = options.rootPath;
  }

  let fsRoot = '.';
  if (options && options.dir) {
    fsRoot = options.dir;
  }

  let securityMode;
  if (options && options.securityMode) {
    securityMode = options.securityMode;
  }

  let ownerEmail;
  if (options && options.ownerEmail) {
    ownerEmail = options.ownerEmail;
  }

  const pauth = await new PauthBuilder()
    .ownerEmail(ownerEmail)
    .build();

  const listeners = {};
  const emit = (fullPathStr, event) => {

    let pathStr = fullPathStr;
    let path = parsePath(pathStr);

    event.path = fullPathStr;

    for (let i = path.length; i >= 0; i--) {

      path = path.slice(0, i);
      pathStr = encodePath(path);

      if (listeners[pathStr]) {
        for (const listener of listeners[pathStr]) {
          if (pauth.canRead(listener.token, fullPathStr)) {
            listener.callback(event);
          }
        }
      }
    }
  };

  return async function(req, res) {

    const u = url.parse(req.url); 
    const reqPath = decodeURIComponent(u.pathname.slice(rootPath.length));

    if (reqPath.includes('//') || reqPath.includes('..')) {
      res.statusCode = 400;
      res.write("Invalid path. Cannot contain '//' or '..'");
      res.end();
      return;
    }

    const params = querystring.parse(u.query);

    const token = parseToken(req);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }

    const perms = await pauth.getPerms(token);

    if (params['pauth-method'] !== undefined) {
      await pauth.handle(req, res, rootPath, token);
      return;
    } 

    if (params['remfs-method'] === 'remote-download') {
      await handleRemoteDownload(req, res, fsRoot, reqPath, pauth, emit);
      return;
    }

    if (params.download === 'true') {
      res.setHeader('Content-Disposition', 'attachment');
    } 

    if (params.events === 'true') {

      if (!perms.canRead(reqPath)) {
        res.statusCode = 403;
        res.write("Unauthorized");
        res.end();
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      // this header is for disabling nginx buffering so SSE messages are sent
      // right away.
      res.setHeader('X-Accel-Buffering', 'no');

      const callback = (event) => {
        const payload = JSON.stringify(event);
        res.write(`event: update\ndata: ${payload}\n\n`);
      };

      if (!listeners[reqPath]) {
        listeners[reqPath] = [];
      }

      listeners[reqPath].push({
        token,
        callback,
      });

      // TODO: clean up old listeners
      console.log(listeners);
    }
    else if (req.method === 'GET' || req.method === 'HEAD' ||
        (req.method === 'POST' && req.headers['content-type'] === 'text/plain')) {

      if (req.method === 'POST') {
        req.body = await parseBody(req);

        // TODO: fix. Used to be part of code now in pauth
        //else if (body.method === 'concat') {
        //  await handleConcat(req, res, body.params, fsRoot, reqPath, pauth);
        //}
      }

      if (reqPath.startsWith('/.gemdrive/images')) {
        handleImage(req, res, fsRoot, reqPath, pauth, emit);
        return;
      }

      if (!perms.canRead(reqPath)) {
        res.statusCode = 403;
        res.write("Unauthorized");
        res.end();
        return;
      }

      if (reqPath.endsWith('remfs.json')) {

        if (reqPath === '/remfs.json') {

          const remotes = await rclone.listRemotes();

          const remfs = {
            type: 'dir',
            size: 4096,
            children: {},
          };

          for (const remote of remotes) {
            remfs.children[remote] = {
              type: 'dir',
              size: 4096,
            };
          }

          res.write(JSON.stringify(remfs, null, 2));
          res.end();
        }
        else {

          const pathParts = parsePath(reqPath);
          const path = encodePath(pathParts.slice(0, -1));
          try {
            const lsResult = await rclone.ls(path);
            res.write(JSON.stringify(rcloneDirToRemfs(lsResult), null, 2));
          }
          catch (e) {
            res.statusCode = 404;
            res.write("Not found");
          }
          res.end();
        }

        //const fsPath = path.join(fsRoot, path.dirname(reqPath));

        //const remfs = await buildRemfsDir(fsPath);
        //res.write(JSON.stringify(remfs, null, 2));
        //res.end();
      }
      else {
        serveItem(req, res, fsRoot, rootPath, reqPath); 
      }
    }
    else if (req.method === 'PUT') {

      if (!perms.canWrite(reqPath)) {
        res.statusCode = 403;
        res.write("Unauthorized");
        res.end();
        return;
      }

      // create directory when request path ends in '/', otherwise upload file
      if (reqPath.endsWith('/')) {
        //const fsPath = fsRoot + reqPath;

        //try {
        //  await fs.promises.mkdir(fsPath);
        //  emit(reqPath, {
        //    type: 'create',
        //  });
        //}
        //catch (e) {
        //  console.error(e);
        //  res.statusCode = 400;
        //  res.write(e.toString());
        //}

        res.statusCode = 500;
        res.write("create directory not implemented");
        res.end();
      }
      else {
        await handleUpload(req, res, fsRoot, reqPath, pauth, emit);
      }
    }
    else if (req.method === 'DELETE') {
      await handleDelete(req, res, fsRoot, reqPath, pauth, emit);
    }
  };
}

async function serveItem(req, res, fsRoot, rootPath, reqPath) {

  res.setHeader('Cache-Control', 'max-age=3600');
  res.on('error', (e) => {
    console.error(e);
  });

  //const fsPath = path.join(fsRoot, reqPath);

  //let stats
  //try {
  //  stats = await fs.promises.stat(fsPath);
  //}
  //catch (e) {
  //  res.statusCode = 404;
  //  res.write("Not Found");
  //  res.end();
  //  return;
  //}

  // TODO: cache this when they first ls the path above
  let lsResult;
  try {
    lsResult = await rclone.ls(reqPath);
  }
  catch (e) {
    res.statusCode = 404;
    res.write("Not found");
    res.end();
    return;
  }

  const isFile = lsResult.length === 1 && lsResult[0].Name === path.basename(reqPath);
  const remfs = isFile ? rcloneFileToRemfs(lsResult[0]) : rcloneDirToRemfs(lsResult);

  if (remfs.type === 'dir') {
    res.statusCode = 404;
    res.write("Not found");
    res.end();
    return;
  // render simple html interface
  //if (stats.isDirectory()) {
    //let isWebDir = false;
    //const localRemfsPath = path.join(fsPath, 'remfs.json');
    //try {
    //  const localRemfsDataText = await fs.promises.readFile(localRemfsPath, {
    //    encoding: 'utf8',
    //  });
    //  const localRemfsData = JSON.parse(localRemfsDataText);
    //  isWebDir = localRemfsData.ext.http && localRemfsData.ext.http.isWebDir;
    //  redirect = localRemfsData.ext.http && localRemfsData.ext.http.redirect;

    //  if (redirect) {
    //    res.statusCode = 307;
    //    res.setHeader('Location', redirect.location);
    //    res.write("Temporary Redirect");
    //    res.end();
    //    return;
    //  }
    //}
    //catch (e) {
    //  //console.log(e);
    //}

    //if (isWebDir) {
    //  const indexPath = path.join(fsPath, 'index.html');
    //  const stream = fs.createReadStream(indexPath)
    //  stream.on('error', (e) => {
    //    res.statusCode = 404;
    //    res.write("Not Found");
    //    res.end();
    //  });
    //  stream.pipe(res);
    //}
    //else {
    //  await renderHtmlDir(req, res, rootPath, reqPath, fsPath);
    //}
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
      range.end = remfs.size - 1;

      if (rangeParts[1]) {
        // Need to add one because HTTP ranges are inclusive
        range.end = Number(rangeParts[1]);
      }

      const originalSize = remfs.size;

      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${originalSize}`);
      res.statusCode = 206;

      res.setHeader('Content-Length', range.end - range.start + 1);

      //sendFile = sendFile.slice(range.start, range.end + 1);
      //stream = fs.createReadStream(fsPath, {
      //  start: range.start,
      //  end: range.end,
      //});
      stream = rclone.cat(reqPath, range.start, range.end + 1 - range.start);
    }
    else {
      res.setHeader('Content-Length', `${remfs.size}`);
      stream = rclone.cat(reqPath);
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


function rcloneDirToRemfs(rclone) {
  const remfs = {
    type: 'dir',
    size: 4096,
    children: {},
  };
  for (const item of rclone) {
    remfs.children[item['Name']] = {
      type: item['IsDir'] ? 'dir' : 'file',
      size: item['IsDir'] ? 4096 : item['Size'],
    };
  }
  return remfs;
}

function rcloneFileToRemfs(item) {
  return {
    type: 'file',
    size: item['Size'],
  };
}



async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });

    req.on('end', async () => {
      resolve(data);
    });

    req.on('error', async (err) => {
      reject(err);
    });
  });
}


module.exports = {
  createHandler,
};
