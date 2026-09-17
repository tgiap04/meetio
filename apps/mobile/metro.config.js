// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro must see the whole yarn workspace, not just this app — otherwise it
// cannot resolve `@meetio/shared` hoisted at the workspace root.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// nodeLinker: node-modules (yarn 4) keeps a flat layout, but disable
// hierarchical lookup disabling only where hoisting could pull in the wrong copy.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
