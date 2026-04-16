import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve as resolvePath } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import colors from 'picocolors';
import { ResolvedConfig } from 'vite';

import { Data, isString } from './utils';
import {
  DEFAULT_UPX_OPTIONS,
  upxJSON,
  RequiredOptions,
  OptionsResolver,
} from './options';

interface ResolvedUpxBuildOptions {
  outDir: string;
  outName: string;
}

/**
 * 规范化 plugin.json 内容，确保 upx 包内入口固定。
 * @param pluginOptions 原始插件配置
 * @returns upx 使用的 plugin.json 内容
 */
const formatPluginOptions = (pluginOptions: Data) =>
  ({
    ...pluginOptions,
    main: 'index.html',
    logo: basename(String(pluginOptions.logo || '')),
    preload: 'preload.js',
  }) as upxJSON;

/**
 * 写入构建目录中的 plugin.json。
 * @param pluginOptions 插件配置
 * @param to 目标目录
 * @returns 写入 Promise
 */
const writePluginJson = (pluginOptions: upxJSON, to: string) =>
  writeFile(
    `${to}/plugin.json`,
    JSON.stringify(pluginOptions, null, 2),
    'utf-8',
  );

const tempRE = /\[(\w+)\]/g;

/**
 * 根据模板生成 upx 输出文件名。
 * @param temp 文件名模板
 * @param pluginOptions 插件配置
 * @returns 输出文件名
 */
const generateOutName = (temp: string, pluginOptions: upxJSON) =>
  temp.replace(tempRE, (str, key: keyof upxJSON) => {
    const value = pluginOptions[key];

    return isString(value) ? value : str;
  });

/**
 * 解析 upx 构建选项。
 * @param input Vite 构建输出目录
 * @param buildOptions 用户配置的 upx 选项
 * @returns 归一化后的 upx 构建选项
 */
const resolveBuildOptions = (
  input: string,
  buildOptions: RequiredOptions['upx'],
): ResolvedUpxBuildOptions => {
  const userOptions =
    buildOptions && typeof buildOptions === 'object' ? buildOptions : {};

  return {
    outDir: userOptions.outDir ? resolvePath(userOptions.outDir) : input,
    outName:
      userOptions.outName ||
      DEFAULT_UPX_OPTIONS.outName ||
      '[pluginName]_[version].upx',
  };
};

/**
 * 准备 upx 输出文件路径。
 * @param input Vite 构建输出目录
 * @param buildOptions upx 配置
 * @param pluginOptions 插件配置
 * @returns upx 输出文件绝对路径
 */
const prepareOutFile = async (
  input: string,
  buildOptions: RequiredOptions['upx'],
  pluginOptions: upxJSON,
) => {
  const resolvedOptions = resolveBuildOptions(input, buildOptions);

  await mkdir(resolvedOptions.outDir, { recursive: true });

  return resolvePath(
    resolvedOptions.outDir,
    generateOutName(resolvedOptions.outName, pluginOptions),
  );
};

/**
 * 校验 upx 输入目录是否存在。
 * @param input 输入目录
 * @returns 校验 Promise
 */
const ensureInputDir = async (input: string) => {
  let inputStat;

  try {
    inputStat = await stat(input);
  } catch (_error) {
    throw new Error(`[uTools]: upx 输入目录不存在: ${input}`);
  }

  if (!inputStat.isDirectory()) {
    throw new Error(`[uTools]: upx 输入路径不是目录: ${input}`);
  }
};

/**
 * 将构建目录先打成 asar，再压缩为 upx。
 * @param input 构建目录
 * @param out 输出文件
 * @returns 构建 Promise
 */
const doBuild = async (input: string, out: string) => {
  const tempDir = await mkdtemp(resolvePath(tmpdir(), 'utools-upx-'));
  const tempAsarFile = resolvePath(tempDir, 'plugin.asar');

  try {
    const { createPackage } = await import('@electron/asar');

    await createPackage(input, tempAsarFile);
    await pipeline(
      createReadStream(tempAsarFile),
      createGzip({ level: 9 }),
      createWriteStream(out),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const buildUpx = async (
  input: string,
  options: RequiredOptions,
  logger: ResolvedConfig['logger'],
) => {
  logger.info(colors.green('\nbuilding for upx....'));

  try {
    const pluginOptions = formatPluginOptions(OptionsResolver.upxData);

    await ensureInputDir(input);
    await writePluginJson(pluginOptions, input);

    const out = await prepareOutFile(input, options.upx, pluginOptions);
    await doBuild(input, out);

    logger.info(`${colors.green('✓')} build upx success`);
    logger.info(colors.magenta(out));
  } catch (error: any) {
    logger.error(
      `${colors.red('build upx failed:')}\n${error.stack || error.message}`,
    );
  }
};

export default buildUpx;
