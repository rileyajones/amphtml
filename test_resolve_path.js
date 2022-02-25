const fs = require('fs');

const {resolvePath} = require('./build-system/babel-config/import-resolver.js');

const paths = Array.from(
  new Set(fs.readFileSync('paths', 'utf-8').split('\n'))
).filter(Boolean);

paths.forEach((path) => {
  console.log(resolvePath(path));
});
