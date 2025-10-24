import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve as resolvePath } from 'node:path';
import { createGzip } from 'node:zlib';

import colors from 'picocolors';
import { ResolvedConfig } from 'vite';

import { cwd, Data, isString } from './utils';
import { UpxsOptions as BuildUpxOptions, NestedRequired, UpxsJSON, RequiredOptions, OptionsResolver } from './options';

const formatPluginOptions = (pluginOptions: Data, needPreload: boolean) => {
  pluginOptions.main = 'index.html';
  pluginOptions.logo = basename(pluginOptions.logo);
  pluginOptions.preload = needPreload ? 'preload.js' : void 0;

  return pluginOptions as UpxsJSON;
};


const writePluginJson = (pluginOptions: UpxsJSON, to: string) =>
  writeFile(`${to}/plugin.json`, JSON.stringify(pluginOptions), 'utf-8');

const tempRE = /\[(\w+)\]/g;
const generateOutName = (temp: string, pluginOptions: UpxsJSON) =>
  temp.replace(tempRE, (str, key: keyof UpxsJSON) => {
    const value = pluginOptions[key];

    return isString(value) ? value : str;
  });

/**
* upx 输出目录
*/
const prepareOutDir = async (buildOptions: NestedRequired<BuildUpxOptions>, pluginOptions: UpxsJSON) => {
  await mkdir(buildOptions.outDir, { recursive: true });

  return resolvePath(buildOptions.outDir, generateOutName(buildOptions.outName, pluginOptions));
};

const TEMPORARY_DEST = resolvePath(cwd, `./.utools_${Math.random()}`);

const doBuild = async (input: string, out: string) => {
  // 动态导入ESM模块以避免构建时的CommonJS/ESM冲突
  const { createPackage } = await import('@electron/asar');
  await createPackage(input, TEMPORARY_DEST);

  await new Promise<void>((resolve, reject) =>
    createReadStream(TEMPORARY_DEST)
      .pipe(createGzip())
      .pipe(createWriteStream(out))
      .on('error', reject)
      .on('finish', () => resolve())
  ).finally(() => unlink(TEMPORARY_DEST));
};

export const buildUpx = async (input: string, options: RequiredOptions, logger: ResolvedConfig['logger']) => {
  const { upx: buildOptions, preload } = options;

  logger.info(colors.green('\nbuilding for upx....'));

  try {
    const pluginOptions = formatPluginOptions(OptionsResolver.upxsData, !!preload);
    logger.info(`${colors.green('plugin.json for building upx:')}\n${JSON.stringify(pluginOptions, null, 2)}`);

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
