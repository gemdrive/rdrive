function parseToken(req, tokenName) {
  if (req.headers[tokenName]) {
    return req.headers[tokenName];
  }

  if (req.body){
    const body = JSON.parse(req.body);
    if (body.params && body.params[tokenName]) {
      return body.params[tokenName];
    }
  }

  return null;
}

function parsePath(path) {
  if (path.endsWith('/')) {
    path = path.slice(0, path.length - 1);
  }

  if (path === '' || path === '/') {
    return [];
  }

  return path.split('/');
}


function encodePath(parts) {
  return '/' + parts.join('/');
}

module.exports = {
  parseToken,
  parsePath,
  encodePath,
};
