import type MagicString from 'magic-string';
import { normalizePath, InlineConfig, RollupCommonJSOptions } from 'vite';
import { basename, dirname, isAbsolute, resolve, resolve as resolvePath } from 'node:path';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { cwd, Data, isObject, isUndef } from './utils';
import { loadPkg, validatePluginJson } from './prepare';
import { RollupOptions } from 'rollup';

export interface upxJSON {
  name: string;
  logo: string;
  main?: string,
  preload?: string,
  features?: Data;
  pluginName?: string;
  description?: string;
  author?: string;
  homepage?: string;
  version?: string;
}

export interface upxOptions {
  outDir?: string;
  outName?: string;
}

export interface Options {
  configFile: string;
  watch?: boolean;
  /**
   * window 环境下的 preload 导出内容的挂载属性
   * @default 'preload'
   */
  name?: string;
  minify?: boolean;
  onGenerate?: (this: MagicString) => string
  external?: RollupOptions['external'],
  define?: InlineConfig['define'],
  // /** @deprecated upx 插件选项 */
  upx?: upxOptions | null,
  mock?: {
    enabled: boolean,
    showBadge?: boolean
  },
  /**
   * 额外的 Vite 配置，用于合并到 preload 的构建配置中
   */
  viteConfig?: InlineConfig
}

export type NestedRequired<T> = {
  [P in keyof T]-?: Exclude<T[P], undefined | null>
  // [P in keyof T]-?: P extends 'viteConfig' | 'external' | 'define' ? Exclude<T[P], undefined | null> : NestedRequired<Exclude<T[P], undefined | null>>;
};

export type RequiredOptions = NestedRequired<Options>;

/**
 * 解析目标路径到预加载文件的绝对路径
 * @param targetPath 目标路径
 * @returns 预加载文件的绝对路径
 */
export const resolvePathToPreload = (targetPath: string) => resolve(dirname(getPreloadPath()), targetPath)

/**
 * 获取plugin.json 中指向的 preload 路径
 * @param options 
 * @returns 
 */
export function getPreloadPath() {
  return OptionsResolver.upxData.preload
}

/**
 * 获取 preload 文件的 id（文件名），去除后缀名(js/ts)
 * @returns preload 文件的 id（文件名）
 */
export function getPreloadId() {
  return basename(getPreloadPath()).replace(/\.(ts|js)$/, '')
}

/**
 * @description 插件选项解析器
 * @param {Options} options 插件选项
 * @returns {RequiredOptions} 解析后的插件选项
 * @throws {Error} 插件选项校验失败时抛出错误
 * @example
 * const optionsResolver = new OptionsResolver(options);
 * const resolvedOptions = optionsResolver.resolvedOptions;
 */
export class OptionsResolver {
  // 默认选项
  defaultOptions: Options = {
    configFile: '',
    external: [],
    watch: true,
    name: 'preload',
    minify: false,
    mock: {
      enabled: true,
      showBadge: true
    },
    upx: {
      outDir: 'dist',
      outName: '[pluginName]_[version].upx',
    }
  };

  static resolvedOptions: RequiredOptions;
  // 插件的一些信息
  static upxData: Required<upxJSON>

  constructor(public options: Options) {
    OptionsResolver.resolvedOptions = this.resolve(options);
    OptionsResolver.upxData = OptionsResolver.refreshUpxJSON(options.configFile)
  }

  /**
   * @description 获取插件的 upx 选项
   * @returns {upxOptions} 插件的 upx 选项
   */
  get resolvedOptions() {
    return OptionsResolver.resolvedOptions
  }

  // 插件的 preload 路径
  static get preloadPath() {
    return OptionsResolver.upxData.preload
  }

  private resolve(options: Options) {
    return Object.entries(
      {
        ...this.defaultOptions,
        ...options,
      }).reduce((ret, [key, defaultVal]) => {

        // @ts-ignore
        const optsVal = this.options[key];
        if (this.options['upx']) this.options['upx'] = this.options['upx'];

        if ((key === 'upx') && isUndef(optsVal)) {
          ret[key] = false
          return ret
        }

        if (key === 'external') {
          if (typeof optsVal === 'function') {
            ret[key] = optsVal;
          } else {
            ret[key] = Array.isArray(optsVal) ? optsVal : (isUndef(optsVal) ? [] : [optsVal])
          }
        } else {
          ret[key] = isUndef(optsVal) ? defaultVal : (isObject(defaultVal) && isObject(optsVal) ? { ...defaultVal, ...optsVal } : optsVal);
        }
        return ret;

      }, {} as any);
  }

  /**
  * @description 刷新并获取 plugin.json 文件
  * @param configPath plugin.json 文件路径
  * @returns {upxJSON} 插件的 upx 选项
  */
  static refreshUpxJSON(configPath?: string) {
    if (!configPath) throw new Error(`[uTools]: 必须指定 configFile❌`);

    const jsonFilePath = isAbsolute(configPath) ? configPath : resolvePath(cwd, configPath);
    try {
      OptionsResolver.upxData = JSON.parse(readFileSync(jsonFilePath, 'utf8'));
    } catch (e) {
      throw new Error(`[uTools]: 分析 plugin.json 时发生错误❌!`, { cause: e });
    }
    validatePluginJson(OptionsResolver.upxData);

    // plugin.json 所在目录
    const jsonFileDir = dirname(jsonFilePath)
    const preloadEntryFile = resolvePath(jsonFileDir, normalizePath(OptionsResolver.upxData.preload));
    const logoFile = resolvePath(jsonFileDir, normalizePath(OptionsResolver.upxData.logo));
    if (!existsSync(preloadEntryFile)) throw new Error(`[uTools]: ${preloadEntryFile} 不存在, 请检查是否存在❌!`);
    if (!existsSync(logoFile)) throw new Error(`[uTools]: ${logoFile} 不存在, 请检查是否存在❌!`);

    OptionsResolver.upxData.preload = preloadEntryFile
    OptionsResolver.upxData.logo = logoFile
    return OptionsResolver.upxData;
  }

}