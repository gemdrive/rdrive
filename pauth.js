const https = require('https');


class Pauth {
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
}

class Perms {
  constructor(permsObj) {
    this._obj = {
      readers: [],
      writers: [],
      managers: [],
      owners: [],
    };

    Object.assign(this._obj, permsObj);
  }

  canRead(ident) {
    return arrayHas(this._obj.readers, 'public') ||
      arrayHas(this._obj.readers, ident) ||
      this.canWrite(ident);
  }

  canWrite(ident) {
    return arrayHas(this._obj.writers, 'public') ||
      arrayHas(this._obj.writers, ident) ||
      this.canManage(ident);
  }

  canManage(ident) {
    return arrayHas(this._obj.managers, ident) ||
      this.isOwner(ident);
  }

  isOwner(ident) {
    return arrayHas(this._obj.owners, ident);
  }
}

function arrayHas(a, item) {
  return -1 !== a.indexOf(item);
}

module.exports = {
  Pauth,
  Perms,
};
