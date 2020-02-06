const https = require('https');
const fs = require('fs');

class PauthBuilder {
  async build() {

    let permsText;
    try {
      permsText = await fs.promises.readFile('pauth_perms.json')
    }
    catch (e) {
      await fs.promises.writeFile('pauth_perms.json', '{"/":{"readers":{"public":true}}}');
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
    if (!this.canManage(token, path)) {
      throw new Error(`User does not have Manager permissions for path '${path}'`);
    }

    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }

    if (!this._allPerms[path].readers) {
      this._allPerms[path].readers = {};
    }

    this._allPerms[path].readers[ident] = true;
    await this._persistPerms();
  }

  async addWriter(token, path, ident) {
    if (!this.canManage(token, path)) {
      throw new Error(`User does not have Manager permissions for path '${path}'`);
    }

    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }

    if (!this._allPerms[path].writers) {
      this._allPerms[path].writers = {};
    }

    this._allPerms[path].writers[ident] = true;
    await this._persistPerms();
  }

  async addManager(token, path, ident) {
    if (!this.isOwner(token, path)) {
      throw new Error(`User does not have Owner permissions for path '${path}'`);
    }

    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }

    if (!this._allPerms[path].managers) {
      this._allPerms[path].managers = {};
    }

    this._allPerms[path].managers[ident] = true;
    await this._persistPerms();
  }

  async addOwner(token, path, ident) {
    if (!this.isOwner(token, path)) {
      throw new Error(`User does not have Owner permissions for path '${path}'`);
    }

    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }

    if (!this._allPerms[path].owners) {
      this._allPerms[path].owners = {};
    }

    this._allPerms[path].owners[ident] = true;
    await this._persistPerms();
  }

  async getPerms(token) {
    return new Perms(this, token);
  }

  canRead(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);
    
    return perms.readers.public === true ||
      perms.readers[ident] === true ||
      this.canWrite(token, path);
  }

  canWrite(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    return perms.writers.public === true ||
      perms.writers[ident] === true ||
      this.canManage(token, path);
  }

  canManage(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    return perms.managers[ident] === true ||
      this.isOwner(token, path);
  }

  isOwner(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    console.log(perms);

    return perms.owners[ident] === true;
  }

  _getPerms(pathParts) {
    const perms = {
      readers: {},
      writers: {},
      managers: {},
      owners: {},
    };

    Object.assign(perms.readers, this._allPerms['/'].readers);
    Object.assign(perms.writers, this._allPerms['/'].writers);
    Object.assign(perms.managers, this._allPerms['/'].managers);
    Object.assign(perms.owners, this._allPerms['/'].owners);

    let curPath = '';
    for (const part of pathParts) {
      curPath += '/' + part;
      if (this._allPerms[curPath]) {
        Object.assign(perms.readers, this._allPerms[curPath].readers);
        Object.assign(perms.writers, this._allPerms[curPath].writers);
        Object.assign(perms.managers, this._allPerms[curPath].managers);
        Object.assign(perms.owners, this._allPerms[curPath].owners);
      }
    }

    return perms;
  }

  async _persistPerms() {
    const permsJson = JSON.stringify(this._allPerms, null, 4);
    await fs.promises.writeFile('pauth_perms.json', permsJson);
  }

  async _persistTokens() {
    const tokensJson = JSON.stringify(this._tokens, null, 4);
    await fs.promises.writeFile('pauth_tokens.json', tokensJson);
  }

  _getIdent(token) {
    if (this._tokens[token]) {
      return this._tokens[token];
    }
    else {
      return 'public';
    }
  }
}

class Perms {
  constructor(pauth, token) {
    this._pauth = pauth;
    this._token = token;
  }

  canRead(path) {
    return this._pauth.canRead(this._token, path);
  }

  canWrite(path) {
    return this._pauth.canWrite(this._token, path);
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
