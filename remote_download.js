const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const http = require('https');
const { parseToken, parsePath, encodePath } = require('./utils.js');
const { ByteCounterStream } = require('./byte_counter.js');

async function handleRemoteDownload(req, res, fsRoot, reqPath, pauth, emit) {
  const u = url.parse(req.url); 
  const params = querystring.parse(u.query);

  const remoteUrl = url.parse(decodeURIComponent(params.url));
  const remotePath = parsePath(remoteUrl.pathname)
  const filename = decodeURIComponent(remotePath[remotePath.length - 1]);
  const dstPath = encodePath([...parsePath(reqPath), filename]);

  const token = parseToken(req);
  const perms = await pauth.getPerms(token);

  if (perms.canWrite(dstPath)) {

    const fsPath = fsRoot + reqPath + '/' + filename;

    http.get(params['url'], (getRes) => {

      emit(dstPath, {
        type: 'start',
        remfs: {
          size: 0,
        },
      });

      // emit updates every 10MB
      const updateByteCount = 10*1024*1024;
      let count = 0;
      const byteCounter = new ByteCounterStream(updateByteCount, (n) => {
        count += n;
        emit(dstPath, {
          type: 'progress',
          remfs: {
            size: count,
          },
        });
      });

      const stream = fs.createWriteStream(fsPath);
      getRes
        .pipe(byteCounter)
        .pipe(stream);

      getRes.on('end', async () => {
        res.end();

        let stats;
        try {
          stats = await fs.promises.stat(fsPath);
        }
        catch (e) {
          console.error("remote-downalod", e);
        }

        emit(dstPath, {
          type: 'complete',
          remfs: {
            size: stats.size,
          },
        });
      });
    });
  }
  else {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
  }
}


module.exports = {
  handleRemoteDownload,
};
