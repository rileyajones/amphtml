const argv = require('minimist')(process.argv.slice(2));
const debounce = require('../common/debounce');
const {
  INABOX_EXTENSION_SET,
  buildBinaries,
  buildExtensionCss,
  buildExtensionJs,
  buildNpmBinaries,
  buildNpmCss,
  declareExtension,
  dedupe,
  getBentoBuildFilename,
  getExtensionsFromArg,
} = require('./extension-helpers');
const {bentoBundles, verifyBentoBundles} = require('../compile/bundles.config');
const {compileJison} = require('./compile-jison');
const {endBuildStep, watchDebounceDelay} = require('./helpers');
const {existsSync, mkdirSync} = require('fs');
const {getBentoName} = require('./bento-helpers');
const {log} = require('../common/logging');
const {red} = require('kleur/colors');
const {watch} = require('chokidar');

// All declared components.
const COMPONENTS = {};

/**
 * Initializes all components from build-system/compile/bundles.config.bento.json
 * if not already done and populates the given components object.
 * @param {?Object} componentsObject
 * @param {boolean=} includeLatest
 */
function maybeInitializeComponents(componentsObject, includeLatest = false) {
  if (Object.keys(componentsObject).length === 0) {
    verifyBentoBundles();
    bentoBundles.forEach((c) => {
      declareExtension(
        c.name,
        c.version,
        // TODO(rileyajones): Remove this once the bento build process fully seperated.
        '0.1',
        c.options,
        componentsObject,
        includeLatest
      );
    });
  }
}

/**
 * Process the command line arguments --nocomponents, --components, and
 * --components_from and return a list of the referenced components.
 *
 * @param {boolean=} preBuild
 * @return {!Array<string>}
 */
function getComponentsToBuild(preBuild = false) {
  let componentsToBuild = [];
  if (argv.extensions) {
    if (typeof argv.extensions !== 'string') {
      log(red('ERROR:'), 'Missing list of components.');
      process.exit(1);
    } else if (argv.extensions === 'inabox') {
      argv.extensions = INABOX_EXTENSION_SET.join(',');
    }
    const explicitComponents = argv.extensions.replace(/\s/g, '').split(',');
    componentsToBuild = dedupe(componentsToBuild.concat(explicitComponents));
  }
  if (argv.extensions_from) {
    const componentsFrom = getExtensionsFromArg(argv.extensions_from);
    componentsToBuild = dedupe(componentsToBuild.concat(componentsFrom));
  }
  if (
    !preBuild &&
    !argv.nocomponents &&
    !argv.extensions &&
    !argv.extensions_from &&
    !argv.core_runtime_only
  ) {
    const allComponents = Object.values(COMPONENTS).map((c) => c.name);
    componentsToBuild = dedupe(componentsToBuild.concat(allComponents));
  }
  return componentsToBuild;
}

/**
 * Watches for non-JS changes within an extensions directory to trigger
 * recompilation.
 *
 * @param {string} componentsDir
 * @param {string} name
 * @param {string} version
 * @param {boolean} hasCss
 * @param {?Object} options
 * @return {Promise<void>}
 */
async function watchComponent(componentsDir, name, version, hasCss, options) {
  /**
   * Steps to run when a watched file is modified.
   */
  function watchFunc() {
    buildComponent(name, version, hasCss, {
      ...options,
      continueOnError: true,
      isRebuild: true,
      watch: false,
    });
  }

  const cssDeps = `${componentsDir}/**/*.css`;
  const jisonDeps = `${componentsDir}/**/*.jison`;
  const ignored = /dist/; //should not watch npm dist folders.
  watch([cssDeps, jisonDeps], {ignored}).on(
    'change',
    debounce(watchFunc, watchDebounceDelay)
  );
}

/**
 * Copies components from
 * src/bento/components/$name/$name.js
 * to
 * dist/v0/$name-$version.js
 *
 * Optionally copies the CSS at components/$name/$version/$name.css into
 * a generated JS file that can be required from the components as
 * `import {CSS} from '../../../build/$name-0.1.css';`
 *
 * @param {string} name Name of the extension. Must be the sub directory in
 *     the components directory and the name of the JS and optional CSS file.
 * @param {string} version Version of the extension. Must be identical to
 *     the sub directory inside the extension directory
 * @param {boolean} hasCss Whether there is a CSS file for this extension.
 * @param {?Object} options
 * @param {!Array=} extraGlobs
 * @return {!Promise<void>}
 */
async function buildComponent(name, version, hasCss, options = {}, extraGlobs) {
  options.extraGlobs = extraGlobs;
  options.npm = true;
  options.bento = true;

  if (options.compileOnlyCss && !hasCss) {
    return;
  }
  const componentsDir = `src/bento/components/${name}/${version}`;
  if (options.watch) {
    await watchComponent(componentsDir, name, version, hasCss, options);
  }

  const promises = [];
  if (hasCss) {
    if (!existsSync('build/css')) {
      mkdirSync('build/css', {recursive: true});
    }
    promises.push(buildExtensionCss(componentsDir, name, version, options));
    if (options.compileOnlyCss) {
      await Promise.all(promises);
      return;
    }
  }
  promises.push(compileJison(`${componentsDir}/**/*.jison`));
  promises.push(buildNpmBinaries(componentsDir, name, options));
  promises.push(buildNpmCss(componentsDir, options));
  if (options.binaries) {
    promises.push(buildBinaries(componentsDir, options.binaries, options));
  }
  if (options.isRebuild) {
    await Promise.all(promises);
    return;
  }

  const bentoName = getBentoName(name);
  promises.push(
    buildExtensionJs(componentsDir, bentoName, {
      ...options,
      wrapper: 'none',
      filename: await getBentoBuildFilename(
        componentsDir,
        bentoName,
        'standalone',
        options
      ),
      // Include extension directory since our entrypoint may be elsewhere.
      extraGlobs: [...(options.extraGlobs || []), `${componentsDir}/**/*.js`],
    })
  );
  await Promise.all(promises);
}

/**
 * Build all the Bento components
 *
 * @param {!Object} options
 * @return {!Promise<void>}
 */
async function buildBentoComponents(options) {
  const startTime = Date.now();
  maybeInitializeComponents(COMPONENTS);
  const toBuild = getComponentsToBuild();
  const results = Object.values(COMPONENTS)
    .filter(
      (component) => options.compileOnlyCss || toBuild.includes(component.name)
    )
    .map((component) =>
      buildComponent(
        component.name,
        component.version,
        component.hasCss,
        {...options, ...component},
        component.extraGlobs
      )
    );

  await Promise.all(results);
  if (!options.compileOnlyCss && results.length > 0) {
    endBuildStep(
      options.minify ? 'Minified all' : 'Compiled all',
      'components',
      startTime
    );
  }
}

module.exports = {buildBentoComponents};
