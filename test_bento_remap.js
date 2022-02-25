const {
  getRemapBentoDependencies,
  getRemapBentoNpmDependencies,
} = require('./build-system/compile/bento-remap.js');
const {bentoBundles} = require('./build-system/compile/bundles.config.js');

console.log(getRemapBentoDependencies());
console.log(getRemapBentoNpmDependencies());
