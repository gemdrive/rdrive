const https = require('https');
const fs = require('fs');

class PauthBuilder {
  async build() {

    let permsText;
    try {
      permsText = await fs.promises.readFile('pauth_perms.json')
    }
    catch (e) {
      await fs.promises.writeFile('pauth_perms.json', '{}');
    }
    const allPerms = JSON.parse(permsText);

    let tokensText;
    try {
      tokensText = await fs.promises.readFile('pauth_tokens.json');
    }
    catch (e) {
      await fs.promises.writeFile('pauth_tokens.json', '{}');
    }
    const tokens = JSON.parse(tokensText);

    return new Pauth(allPerms, tokens);
  }
}

class Pauth {

  constructor(allPerms, tokens) {
    this._allPerms = allPerms;
    this._tokens = tokens;
  }

  async authenticate(email) {
    const emauthUrl = `https://emauth.io/verify?email=${email}`;

    return new Promise((resolve, reject) => {
      const req = https.get(emauthUrl, (res) => {

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            const token = createToken();
            this._tokens[token] = email;
            this._persistTokens();
            resolve(token);
          }
          else {
            reject(data);
          }
        });

        res.on('error', (e) => {
          reject(e);
        });
      });
    });
  }

  async addReader(token, path, ident) {
    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }

    if (!this._allPerms[path].readers) {
      this._allPerms[path].readers = {};
    }

    this._allPerms[path].readers[ident] = true;
    await this._persistPerms();
  }

  async getPerms(token) {
    return new Perms(this._allPerms, this._tokens, token);
  }

  async _persistPerms() {
    const permsJson = JSON.stringify(this._allPerms, null, 2);
    await fs.promises.writeFile('pauth_perms.json', permsJson);
  }

  async _persistTokens() {
    const tokensJson = JSON.stringify(this._tokens, null, 2);
    await fs.promises.writeFile('pauth_tokens.json', tokensJson);
  }
}

class Perms {
  constructor(allPerms, tokens, token) {
    this._allPerms = allPerms;
    this._token = token;

    if (tokens[token]) {
      this._ident = tokens[token];
    }
    else {
      this._ident = 'public';
    }
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

    Object.assign(perms, this._allPerms['/']);

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

function createToken() {
  const possible = "0123456789abcdefghijkmnpqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function genCluster() {
    let cluster = "";
    for (let i = 0; i < 32; i++) {
      const randIndex = Math.floor(Math.random() * possible.length);
      cluster += possible[randIndex];
    }
    return cluster;
  }

  let id = "";
  id += genCluster();
  //id += '-';
  //id += genCluster();
  //id += '-';
  //id += genCluster();
  return id;
}

module.exports = {
  PauthBuilder,
};
