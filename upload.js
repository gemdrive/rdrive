const fs = require('fs');
const path = require('path');
const { parseToken, parsePath, encodePath, buildRemfsDir } = require('./utils.js');


async function handleUpload(req, res, fsRoot, reqPath, pauth) {
  const tokenName = 'remfs-token';
  const token = parseToken(req, tokenName);

  const perms = await pauth.getPerms(token);

  if (!perms.canWrite(reqPath)) {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
    return;
  }

  console.log(reqPath);
  const fsPath = fsRoot + '/' + reqPath;
  const pathParts = parsePath(reqPath);

  // TODO: Might not need to traverse here. Maybe just check if the parent
  // path exists.
  let curDir = fsRoot;
  for (const pathPart of pathParts.slice(0, pathParts.length - 1)) {
    curDir += '/' + pathPart;

    try {
      await fs.promises.stat(curDir);
    }
    catch (e) {
      res.statusCode = 400;
      res.write(e.toString());
      res.end();
      return;
    }
  }

  const stream = fs.createWriteStream(fsPath);

  req.pipe(stream);

  req.on('end', async () => {
    const remfsPath = path.dirname(fsPath);
    const filename = path.basename(fsPath);

    const remfs = await buildRemfsDir(remfsPath);
    res.write(JSON.stringify(remfs.children[filename], null, 2));

    res.end();
  });
}

module.exports = {
  handleUpload,
};
