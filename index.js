const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const { renderHtmlDir } = require('./render_html_dir.js');
const { PauthBuilder } = require('./pauth.js');
const { parseToken, parsePath, encodePath, buildRemfsDir, getMime } = require('./utils.js');
const { handleUpload } = require('./upload.js');
const { handleDelete } = require('./delete.js');
const { handleConcat } = require('./concat.js');


async function createHandler(options) {

  let rootPath = '/';

  if (options && options.rootPath !== undefined) {
    rootPath = options.rootPath;
  }

  let fsRoot = '.';
  if (options && options.dir) {
    fsRoot = options.dir;
  }

  const pauth = await new PauthBuilder().build();

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

    const tokenName = 'remfs-token';
    const token = parseToken(req, tokenName);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }

    if (params.method !== undefined) {
      if (params.method === 'verify') {
        const success = pauth.verify(params.key);
        if (success) {
          res.write("Verification succeeded. You can close this tab and return to your previous session.");
        }
        else {
          res.write("Verification failed. It may have expired.");
        }
        res.end();
      }

      // TODO: maybe not return here?
      return;
    }

    if (req.headers['content-type'] === 'application/json') {

      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });

      req.on('end', async () => {
        try {
          const body = JSON.parse(data);

          const trimmedPath = reqPath.endsWith('/') ? reqPath.slice(0, reqPath.length - 1) : reqPath;
          if (body.method === 'authenticate') {
            try {
              const newToken = await pauth.authenticate(body.params.email);
              res.write(newToken);
            }
            catch (e) {
              console.error(e);
              res.write("Verification expired");
            }
            res.end();
          }
          else if (body.method === 'authorize') {
            try {
              const newToken = await pauth.authorize(token, body.params);
              if (newToken === null) {
                res.write("User does not have permissions to do that");
              }
              else {
                res.write(newToken);
              }
            }
            catch (e) {
              console.error(e);
              res.write("Authorization failed");
            }
            res.end();
          }
          else if (body.method === 'addReader') {
            await pauth.addReader(token, trimmedPath, body.params.email);
            res.write(`Added reader ${body.params.email} to ${trimmedPath}`);
            res.end();
          }
          else if (body.method === 'removeReader') {
            await pauth.removeReader(token, trimmedPath, body.params.email);
            res.write(`Removed reader ${body.params.email} from ${trimmedPath}`);
            res.end();
          }
          else if (body.method === 'addWriter') {
            await pauth.addWriter(token, trimmedPath, body.params.email);
            res.write(`Added writer ${body.params.email} to ${trimmedPath}`);
            res.end();
          }
          else if (body.method === 'addManager') {
            await pauth.addManager(token, trimmedPath, body.params.email);
            res.write(`Added manager ${body.params.email} to ${trimmedPath}`);
            res.end();
          }
          else if (body.method === 'addOwner') {
            await pauth.addOwner(token, trimmedPath, body.params.email);
            res.write(`Added owner ${body.params.email} to ${trimmedPath}`);
            res.end();
          }
          else if (body.method === 'concat') {
            await handleConcat(req, res, body.params, fsRoot, reqPath, pauth);
          }
          else {
            res.statusCode = 400;
            res.write(`Invalid method '${body.method}'`);
            res.end();
          }
        }
        catch (e) {
          res.statusCode = 400;
          res.write(e.toString());
          res.end();
        }
      });

      return;
    }


    if (req.method === 'GET' || req.method === 'HEAD' ||
        (req.method === 'POST' && req.headers['content-type'] === 'text/plain')) {

      if (req.method === 'POST') {
        req.body = await parseBody(req);
      }

      const perms = await pauth.getPerms(token);

      if (!perms.canRead(reqPath)) {
        res.statusCode = 403;
        res.write("Unauthorized");
        res.end();
        return;
      }

      if (reqPath.endsWith('remfs.json')) {

        const fsPath = path.join(fsRoot, path.dirname(reqPath));

        const remfs = await buildRemfsDir(fsPath);
        res.write(JSON.stringify(remfs, null, 2));
        res.end();
      }
      else {
        serveItem(req, res, fsRoot, rootPath, reqPath); 
      }
    }
    else if (req.method === 'PUT') {
      await handleUpload(req, res, fsRoot, reqPath, pauth);
    }
    else if (req.method === 'DELETE') {
      await handleDelete(req, res, fsRoot, reqPath, pauth);
    }
  };
}

async function serveItem(req, res, fsRoot, rootPath, reqPath) {

  res.setHeader('Cache-Control', 'max-age=3600');
  res.on('error', (e) => {
    console.error(e);
  });

  const fsPath = path.join(fsRoot, reqPath);

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
