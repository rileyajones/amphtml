const assert = require('assert');
const {execSync} = require('child_process');
const fastGlob = require('fast-glob');
const {readFileSync, writeFileSync} = require('fs');

/**
 * Gets the names of the files that were built by the AMP build system.
 * @return {Promise<string[]>}
 */
function getBuiltFiles() {
  return fastGlob('build/*');
}

/**
 * Verifies all expected output files exist.
 * @return {Promise<void>}
 */
async function verifyOutputFiles() {
  const expectedFiles = new Set(
    readFileSync('build-system/test-configs/built-files.out', 'utf-8').split(
      '\n'
    )
  );
  const files = new Set(await getBuiltFiles());
  assert(files.size, 'No files found');
  // assert.deepStrictEqual(files, expectedFiles);
  assert(files.size === expectedFiles.size, 'Number of files does not match');
  for (const expectedFile of expectedFiles) {
    assert(files.has(expectedFile), `File ${expectedFile} does not exist`);
  }

  for (const file of files) {
    assert(expectedFiles.has(file), `File ${file} should not exist`);
  }
}

/**
 * Recompute the built-files file.
 * @return {Promise<void>}
 */
async function rebuildExpectedOutput() {
  writeFileSync(
    'build-system/test-configs/built-files.out',
    (await getBuiltFiles()).join('\n')
  );
}

/**
 * Run tests that check AMP build system.
 * @return {Promise<void>}
 */
async function buildTests() {
  // await rebuildExpectedOutput();
  execSync('amp clean');
  execSync('amp dist');
  await verifyOutputFiles();
}

module.exports = {
  buildTests,
};

buildTests.description = 'Run tests checking AMPs build output';
