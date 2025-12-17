import { readFileSync, copyFile, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, resolve as resolvePath } from 'node:path';
import { ResolvedConfig } from 'vite';
import colors from 'picocolors';
import { cwd } from './utils';
import { OptionsResolver, upxJSON, getPreloadId, resolvePathToPreload } from './options';


/**
 * @description 获取构建输出目录中的文件路径
 * @param config Vite 配置对象
 * @param fileName 文件名（可选）
 * @returns 文件在目标目录中的绝对路径
 */
export const getUtoolsPath = () => {
  return dirname(OptionsResolver.upxData.preload);
}

/**
 * @description 获取构建输出目录中的文件路径
 * @param config Vite 配置对象
 * @param fileName 文件名（可选）
 * @returns 文件在目标目录中的绝对路径
 */
export const getDistPath = (config: ResolvedConfig, fileName = '') => {
  return resolve(config.root, config.build.outDir, fileName)
}

/**
 * @description 获取 node_modules 中的模块名
 * @param id 模块路径（例如：/xxx/node_modules/locad/index.js）
 * @returns 模块名（例如：locad）
 */
export const getNodeModuleName = (id: string) => {
  const lastIndex = id.lastIndexOf('node_modules');
  if (!~lastIndex) return;
  return id.slice(lastIndex + 'node_modules/'.length).match(/^(\S+?)\//)?.[1];
};

export function copyUpxFiles(config: ResolvedConfig) {
  const { logo } = OptionsResolver.upxData
  copyFile(logo, resolve(getDistPath(config), basename(logo)), (err) => {
    if (err) throw err;
  })
}

export function prepareUpxFiles(config: ResolvedConfig, localUrl?: string) {
  if (!existsSync(getDistPath(config))) mkdirSync(getDistPath(config))
  writeFileSync(getDistPath(config, 'plugin.json'), JSON.stringify({
    ...OptionsResolver.upxData,
    logo: basename(OptionsResolver.upxData.logo),
    preload: 'preload.js',
    development: {
      main: localUrl
    }
  }, null, 2), { encoding: 'utf-8' })
  copyUpxFiles(config);
}


export function validatePluginJson(options: upxJSON) {
  const DOC_URL = 'https://www.u-tools.cn/docs/developer/information/plugin-json.html';

  const requiredKeys = [
    'name',
    'pluginName',
    'description',
    'author',
    // 'homepage',
    'version',
    'logo',
    'features',
  ] as const;

  if (!options.preload) console.warn("no preload file required")
  const pkg = loadPkg() as any

  requiredKeys.forEach((key) => {
    if (!options[key]) {
      options[key] = pkg[key]
      if ('pluginName' === key) options[key] = options['name'].replace(/@\//, '_')
    }
    if (!options[key]) throw new Error(colors.red(`[uTools]: 必须有插件字段 ${key}, 查看: ${colors.bold(DOC_URL)}`));
  });
};

export function loadPkg(dep = false): string[] | object {
  const pkg = JSON.parse(readFileSync(resolvePath(cwd, 'package.json'), 'utf8'))
  return dep ? [...Object.keys(pkg["devDependencies"]), ...Object.keys(pkg["dependencies"])] : pkg
}

/**
 * @description fs 异步生产新的文件，与 preload 在同级目录
 * @param content 要写入的内容
 * @param filename 要写入的文件名
 */
export function buildPreloadTsd(content: string) {
  const dstFileName = '_' + getPreloadId() + '.d.ts'
  writeFileSync(resolvePathToPreload(dstFileName), content)
}