const fs = require('fs');
const path = require('path');
const { parseToken, parsePath, encodePath } = require('./utils.js');

async function handleDelete(req, res, fsRoot, reqPath, pauth, emit) {
  const tokenName = 'remfs-token';
  const token = parseToken(req, tokenName);

  const perms = await pauth.getPerms(token);

  const pathParts = parsePath(reqPath);
  const parentDirParts = pathParts.slice(0, pathParts.length - 1);
  const parentDir = encodePath(parentDirParts);

  if (!perms.canWrite(parentDir)) {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
    return;
  }

  const fsPath = path.join(fsRoot, reqPath);

  let stats;
  try {
    stats = await fs.promises.stat(fsPath);
  }
  catch (e) {
    res.statusCode = 400;
    res.write(`Error deleting '${reqPath}' (not found)`);
    res.end();
    return;
  }

  if (stats.isFile()) {
    try {
      await fs.promises.unlink(fsPath);
      emit(reqPath, {
        type: 'delete',
      });
    }
    catch (e) {
      res.statusCode = 400;
      res.write(`Error deleting '${reqPath}'`);
      res.end();
      return;
    }
  }
  else {
    try {
      await fs.promises.rmdir(fsPath, { recursive: true });
      emit(reqPath, {
        type: 'delete',
      });
    }
    catch (e) {
      res.statusCode = 400;
      res.write(`Error deleting '${reqPath}'`);
      res.end();
      return;
    }
  }

  res.end();
}

module.exports = {
  handleDelete,
};
