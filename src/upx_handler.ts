import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve as resolvePath } from 'node:path';
import { createGzip } from 'node:zlib';

import colors from 'picocolors';
import { ResolvedConfig } from 'vite';

import { cwd, Data, isString } from './utils';
import { upxOptions as BuildUpxOptions, NestedRequired, upxJSON, RequiredOptions, OptionsResolver } from './options';

const formatPluginOptions = (pluginOptions: Data) => {
  pluginOptions.main = 'index.html';
  pluginOptions.logo = basename(pluginOptions.logo);
  pluginOptions.preload = 'preload.js';

  return pluginOptions as upxJSON;
};


const writePluginJson = (pluginOptions: upxJSON, to: string) =>
  writeFile(`${to}/plugin.json`, JSON.stringify(pluginOptions), 'utf-8');

const tempRE = /\[(\w+)\]/g;
const generateOutName = (temp: string, pluginOptions: upxJSON) =>
  temp.replace(tempRE, (str, key: keyof upxJSON) => {
    const value = pluginOptions[key];

    return isString(value) ? value : str;
  });

/**
* upx 输出目录
*/
const prepareOutDir = async (buildOptions: NestedRequired<BuildUpxOptions>, pluginOptions: upxJSON) => {
  await mkdir(buildOptions.outDir, { recursive: true });

  return resolvePath(buildOptions.outDir, generateOutName(buildOptions.outName, pluginOptions));
};

const TEMPORARY_DEST = resolvePath(cwd, `./.utools_${Math.random()}`);

import { pipeline } from 'node:stream/promises';

const doBuild = async (input: string, out: string) => {
  // 动态导入ESM模块以避免构建时的CommonJS/ESM冲突
  const { createPackage } = await import('@electron/asar');
  await createPackage(input, TEMPORARY_DEST);

  try {
    await pipeline(
      createReadStream(TEMPORARY_DEST),
      createGzip(),
      createWriteStream(out)
    );
  } finally {
    await unlink(TEMPORARY_DEST);
  }
};

export const buildUpx = async (input: string, options: RequiredOptions, logger: ResolvedConfig['logger']) => {
  const { upx: buildOptions } = options;

  logger.info(colors.green('\nbuilding for upx....'));

  try {
    const pluginOptions = formatPluginOptions(OptionsResolver.upxData);
    // logger.info(`${colors.green('plugin.json for building upx:')}\n${JSON.stringify(pluginOptions, null, 2)}`);

    await writePluginJson(pluginOptions, input);

    const out = await prepareOutDir(buildOptions, pluginOptions);
    await doBuild(input, out);

    logger.info(`${colors.green('✓')} build upx success`);
    logger.info(colors.magenta(out));
  } catch (error: any) {
    logger.error(`${colors.red('build upx failed:')}\n${error.stack || error.message}`);
  }
};

export default buildUpx;
