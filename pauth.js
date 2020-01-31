const https = require('https');
const fs = require('fs');

class PauthBuilder {
  async build() {
    const permsText = await fs.promises.readFile('pauth_perms.json')
    const allPerms = JSON.parse(permsText);
    return new Pauth(allPerms);
  }
}

class Pauth {

  constructor(allPerms) {
    this._allPerms = allPerms;
  }

  async authenticate(email) {
    const emauthUrl = `https://emauth.io/verify?email=${email}`;
    const token = await new Promise((resolve, reject) => {
      const req = https.get(emauthUrl, (res) => {

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });

        res.on('error', (e) => {
          reject(e);
        });
      });
    });

    return token;
  }

  async getPerms(token) {
    return new Perms(this._allPerms, token);
  }

  async persistPerms() {
    const permsJson = JSON.stringify(this._allPerms, null, 2);
    await fs.promises.writeFile('pauth_perms.json', permsJson);
  }
}

class Perms {
  constructor(allPerms, token) {
    this._allPerms = allPerms;
    this._token = token;
    // TODO: extract from JWT
    this._ident = token;
  }

  canRead(path) {
    const parts = parsePath(path);
    const perms = this._getPerms(parts);
    
    return perms.readers.public === true ||
      perms.readers[this._ident] === true ||
      this.canWrite(path);
  }

  canWrite(path) {
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    return perms.writers.public === true ||
      perms.writers[this._ident] === true ||
      this.canManage(path);
  }

  canManage(path) {
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    return perms.managers[this._ident] === true ||
      this.isOwner(path);
  }

  isOwner(path) {
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    return perms.owners[this._ident] === true;
  }

  _getPerms(pathParts) {
    const perms = {
      readers: {},
      writers: {},
      managers: {},
      owners: {},
    };
    let curPath = '';
    for (const part of pathParts) {
      curPath += '/' + part;
      if (this._allPerms[curPath]) {
        Object.assign(perms, this._allPerms[curPath]);
      }
    }

    return perms;
  }
}

function arrayHas(a, item) {
  return -1 !== a.indexOf(item);
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

module.exports = {
  PauthBuilder,
};
