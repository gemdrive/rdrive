const { spawn } = require('child_process');
const { parsePath, encodePath } = require('./utils.js');


async function listRemotes() {
  const cmd = spawn('rclone', ['listremotes']);
  let allData = '';

  cmd.stdout.setEncoding('utf8');

  cmd.stdout.on('data', (data) => {
    allData += data;
  });

  return new Promise((resolve, reject) => {
    cmd.stdout.on('end', () => {
      const remotes = allData.split('\n')
        .slice(0, -1)
        .map(r => r.slice(0, -1));

      resolve(remotes);
    });

    cmd.stdout.on('error', (e) => {
      reject(e);
    });
  });
}

async function rcloneLs(reqPath) {
  const pathParts = parsePath(reqPath);
  const rclonePath = pathParts[0] + ':' +  encodePath(pathParts.slice(1)).slice(1);
  const ls = spawn('rclone', ['lsjson', rclonePath]);

  ls.stdout.setEncoding('utf8');

  let json = '';

  return new Promise((resolve, reject) => {
    ls.stdout.on('data', (data) => {
      json += data;
    });

    ls.stdout.on('end', () => {
      try {
        const out = JSON.parse(json);
        resolve(out);
      }
      catch (e) {
        reject(e);
      }
    });
  })
}

function rcloneCat(reqPath, offset, count) {
  const pathParts = parsePath(reqPath);
  const rclonePath = pathParts[0] + ':' +  encodePath(pathParts.slice(1)).slice(1);

  const args = ['cat'];

  if (offset) {
    args.push('--offset');
    args.push(offset);
  }

  if (count) {
    args.push('--count');
    args.push(count);
  }

  args.push(rclonePath);

  const cat = spawn('rclone', args);

  return cat.stdout;
}

async function rcat(reqPath, inStream) {
  const rclonePath = genRclonePath(reqPath);
  const cmd = spawn('rclone', ['rcat', rclonePath]);
  inStream.pipe(cmd.stdin);

  return new Promise((resolve, reject) => {
    cmd.stdin.on('close', () => {
      resolve();
    });
  });
}

async function rcloneDelete(reqPath) {
  const rclonePath = genRclonePath(reqPath);
  const cmd = spawn('rclone', ['delete', rclonePath]);
}

function genRclonePath(reqPath) {
  const pathParts = parsePath(reqPath);
  const rclonePath = pathParts[0] + ':' +  encodePath(pathParts.slice(1)).slice(1);
  return rclonePath;
}


module.exports = {
  listRemotes,
  ls: rcloneLs,
  cat: rcloneCat,
  rcat,
};
