const { Transform } = require('stream');


class ByteCounterStream extends Transform {

  constructor(n, callback) {
    super();

    this._n = n;
    this._callback = callback;
    this._count = 0;
  }

  _transform(chunk, enc, cb) {

    this._count += chunk.length;

    if (this._count > this._n) {
      this._callback(this._count);
      this._count = 0;
    }

    this.push(chunk);
    cb();
  }
}


module.exports = {
  ByteCounterStream,
};
