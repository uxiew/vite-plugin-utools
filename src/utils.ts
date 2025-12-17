import { builtinModules } from 'node:module';
import { basename, dirname, resolve } from 'node:path';

import { Alias, AliasOptions } from 'vite';

import { NodePath, types } from '@babel/core';
import { parse } from '@babel/parser';
import { createFilter } from '@rollup/pluginutils';

const Modules = [
  ...builtinModules,
  'assert/strict',
  'diagnostics_channel',
  'dns/promises',
  'fs/promises',
  'path/posix',
  'path/win32',
  'readline/promises',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'timers/promises',
  'util/types',
  'wasi',
];
export const NodeBuiltin = [...new Set([...Modules, ...Modules.map((id) => `node:${id}`)])];

export const cwd = process.cwd();

export type Data = Record<any, any>;

export const genStatements = (source: string) => parse(source).program.body;

export const ensureHoisted = (statements: types.Statement[]) =>
  statements.forEach((node) => {
    //@ts-ignore
    node._blockHoist = 3;
  });


const includeRE = /\.[jt]sx?$/i;
export const transformFilter = createFilter(includeRE, 'node_modules');

export const createPreloadFilter = (preloadPath: string) =>
  createFilter([preloadPath, preloadPath.replace(includeRE, '')]);

export const isObject = (val: unknown): val is Data => !!val && typeof val === 'object';

export const isUndef = (val: unknown): val is undefined | null => (val === void 0) || (val === null);

export const isString = (val: unknown): val is string => typeof val === 'string';

const isMatch = (source: string, find: string | RegExp) =>
  isString(find) ? find === source || source.startsWith(`${find}/`) : source.match(find);

export type ReplaceAlias = (path: string) => string;
export const createReplaceAlias = (aliasOpts: AliasOptions = []): ReplaceAlias => {
  const aliasEntires: Alias[] = Array.isArray(aliasOpts)
    ? aliasOpts
    : Object.entries(aliasOpts).map(([find, replacement]) => ({ find, replacement }));

  return (path) => {
    const entry = aliasEntires.find(({ find }) => isMatch(path, find));
    return entry ? resolve(cwd, path.replace(entry.find, entry.replacement)) : path;
  };
};

export const getModuleName = (id: string) => {
  const lastIndex = id.lastIndexOf('node_modules');
  if (!~lastIndex) return void 0;

  return id.slice(lastIndex + 'node_modules/'.length).match(/^(\S+?)\//)?.[1];
};

// HACK
// look from source:https://github.com/vitejs/vite/blob/main/packages/vite/src/node/logger.ts#L144 & https://github.com/alexeyraspopov/picocolors/blob/main/picocolors.js#LL31C29-L31C48
export const getLocalUrl = (coloredStr: string) => {
  ["[1m", "[22m", "[36m", "[39m", '[32m'].forEach((color) => {
    coloredStr = coloredStr.replaceAll(color, '').replace(/\x1b/gim, '')
  })

  const urlArr = coloredStr.split(': ')
  return urlArr[urlArr.length - 1].trim()
}
