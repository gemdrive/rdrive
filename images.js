const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { parseToken, parsePath, encodePath, buildRemfsDir } = require('./utils.js');
const rclone = require('./rclone.js');
const { Transform } = require('stream');


async function handleImage(req, res, fsRoot, reqPath, pauth, emit) {

  const parts = parsePath(reqPath);
  const size = parseInt(parts[2]);

  const srcPathStr = encodePath(parts.slice(3));
  const srcPath = path.join(fsRoot, srcPathStr);

  const token = parseToken(req);
  const perms = await pauth.getPerms(token);

  if (!perms.canRead(srcPathStr)) {
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
    return;
  }

  if (size !== 32 && size !== 64 && size !== 128 && size !== 256 && 
    size !== 512 && size !== 1024 && size !== 2048) {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
    return;
  }

  // TODO: fix this branch
  if (srcPathStr.includes('.remfs/images')) {
    const stream = fs.createReadStream(srcPath);

    stream.pipe(res);

    stream.on('error', (e) => {
      console.error(e);
      res.statusCode = 404;
      res.write("Not Found");
      res.end();
    });
  }
  else {

    const thumbDir = path.join(fsRoot, encodePath(parts.slice(0, parts.length - 1)));
    const thumbFsPath = path.join(fsRoot, reqPath);

    const stream = fs.createReadStream(thumbFsPath)
    stream.pipe(res);

    stream.on('error', async (e) => {

      try {
        const srcStream = rclone.cat('/' + srcPath);

        await fs.promises.mkdir(thumbDir, { recursive: true });

        const resizer = sharp()
          .resize(size, size, {
            fit: 'inside',
          });

        const fileWriteStream = fs.createWriteStream(thumbFsPath);
        const thumbFileWriter = new InlineWriteStream(fileWriteStream);

        srcStream
          .pipe(resizer)
          .pipe(thumbFileWriter)
          .pipe(res);
      }
      catch (e) {
        console.error(e);
        res.statusCode = 404;
        res.write("Not Found");
        res.end();
        return;
      }
    });
  }
}

class InlineWriteStream extends Transform {

  constructor(writeStream) {
    super();
    this._writeStream = writeStream;
  }

  _transform(chunk, enc, cb) {
    // TODO: should probably be checking for backpressure here
    this._writeStream.write(chunk);
    this.push(chunk);
    cb();
  }
}


module.exports = {
  handleImage,
};
