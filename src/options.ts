import type MagicString from 'magic-string';
import { normalizePath, InlineConfig } from 'vite';
import { basename, dirname, isAbsolute, resolve, resolve as resolvePath } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { cwd, Data, isObject, isUndef } from './utils';
import { validatePluginJson } from './prepare';
import { RollupOptions } from 'rollup';

export interface upxJSON {
  name: string;
  logo: string;
  main?: string;
  preload?: string;
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

export const DEFAULT_UPX_OPTIONS: upxOptions = {
  outName: '[pluginName]_[version].upx',
};

export interface Options {
  /**
   * plugin.json 相对文件
   */
  configFile: string;
  /**
   * 是否启用 watch 模式
   * @default true
   */
  watch?: boolean;
  /**
   * window 环境下的 preload 导出内容的挂载属性
   * @default 'preload'
   * @example
   * ```ts
   * name: 'v5' => window.v5
   * ```
   */
  name?: string;
  /**
   * 是否启用 minify
   */
  minify?: boolean;
  /**
   * 在生成 preload 文件之前的回调，用来修改 preload.js
   */
  onGenerate?: (code: MagicString, fileName: string) => string | void;
  /** 不需要处理的外部依赖 */
  external?: RollupOptions['external'];
  /** 预加载文件的全局变量 */
  define?: InlineConfig['define'];
  /**
   * 生成 upx 插件。
   * - `true`：使用默认配置
   * - `false | null | undefined`：不生成
   * - `object`：合并自定义配置
   *
   * 默认输出到当前 Vite 的 `build.outDir`，除非显式传入 `outDir`。
   * @default false
   */
  upx?: boolean | upxOptions | null;
  /**
   * 是否启用 mock
   */
  mock?: {
    enabled?: boolean;
    showBadge?: boolean;
  };
  /**
   * 是否启用 vConsole
   * @default false
   * @example
   * ```ts
   * vconsole: true
   * ```
   * ```ts
   * vconsole: 'https://lib.baomitu.com/vConsole/vconsole.min.js'
   * ```
   */
  vconsole?: /**
     * 是否启用 vConsole 或者设置 vConsole 源文件
     * @default false
     */
    boolean | string;
  /**
   * 额外的 Vite 配置，用于合并到 preload 的构建配置中
   */
  viteConfig?: InlineConfig;
}

export type NestedRequired<T> = {
  [P in keyof T]-?: Exclude<T[P], undefined | null>;
  // [P in keyof T]-?: P extends 'viteConfig' | 'external' | 'define' ? Exclude<T[P], undefined | null> : NestedRequired<Exclude<T[P], undefined | null>>;
};

export type RequiredOptions = NestedRequired<Options>;

/**
 * 解析目标路径到预加载文件的绝对路径
 * @param targetPath 目标路径
 * @returns 预加载文件的绝对路径
 */
export const resolvePathToPreload = (targetPath: string) =>
  resolve(dirname(getPreloadPath()), targetPath);

/**
 * 获取plugin.json 中指向的 preload 路径
 * @param options
 * @returns
 */
export function getPreloadPath() {
  return OptionsResolver.upxData.preload;
}

/**
 * 获取 preload 文件的 id（文件名），去除后缀名(js/ts)
 * @returns preload 文件的 id（文件名）
 */
export function getPreloadId() {
  return basename(getPreloadPath()).replace(/\.(ts|js)$/, '');
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
      showBadge: true,
    },
    vconsole: false,
    upx: DEFAULT_UPX_OPTIONS,
  };

  static resolvedOptions: RequiredOptions;
  // 插件的一些信息
  static upxData: Required<upxJSON>;

  constructor(public options: Options) {
    OptionsResolver.resolvedOptions = this.resolve(options);
    OptionsResolver.upxData = OptionsResolver.refreshUpxJSON(
      options.configFile,
    );
  }

  /**
   * @description 获取插件的 upx 选项
   * @returns {upxOptions} 插件的 upx 选项
   */
  get resolvedOptions() {
    return OptionsResolver.resolvedOptions;
  }

  // 插件的 preload 路径
  static get preloadPath() {
    return OptionsResolver.upxData.preload;
  }

  /**
   * 归一化 upx 选项。
   * @param userVal 用户传入的 upx 配置
   * @param defaultVal 默认 upx 配置
   * @returns 归一化后的 upx 配置，未启用时返回 false
   */
  private resolveUpxOptions(
    userVal: Options['upx'],
    defaultVal: Options['upx'],
  ) {
    if (isUndef(userVal) || userVal === false || userVal === null) {
      return false;
    }

    if (userVal === true) {
      return { ...(defaultVal as upxOptions) };
    }

    return isObject(defaultVal) && isObject(userVal)
      ? { ...defaultVal, ...userVal }
      : userVal;
  }

  private resolve(options: Options) {
    const defaultOptions = this.defaultOptions;

    const allKeys = new Set([
      ...Object.keys(defaultOptions),
      ...Object.keys(options),
    ]);

    return Array.from(allKeys).reduce((ret, key) => {
      // @ts-ignore
      const userVal = options[key];
      // @ts-ignore
      const defaultVal = defaultOptions[key];

      if (key === 'upx') {
        ret[key] = this.resolveUpxOptions(userVal, defaultVal);
        return ret;
      }

      if (key === 'external') {
        if (typeof userVal === 'function') {
          ret[key] = userVal;
        } else {
          ret[key] = Array.isArray(userVal)
            ? userVal
            : isUndef(userVal)
              ? []
              : [userVal];
        }
      } else {
        ret[key] = isUndef(userVal)
          ? defaultVal
          : isObject(defaultVal) && isObject(userVal)
            ? { ...defaultVal, ...userVal }
            : userVal;
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

    const jsonFilePath = isAbsolute(configPath)
      ? configPath
      : resolvePath(cwd, configPath);
    OptionsResolver.upxData = JSON.parse(readFileSync(jsonFilePath, 'utf8'));
    validatePluginJson(OptionsResolver.upxData);

    // plugin.json 所在目录
    const jsonFileDir = dirname(jsonFilePath);
    const preloadEntryFile = resolvePath(
      jsonFileDir,
      normalizePath(OptionsResolver.upxData.preload),
    );
    const logoFile = resolvePath(
      jsonFileDir,
      normalizePath(OptionsResolver.upxData.logo),
    );
    if (!existsSync(preloadEntryFile))
      throw new Error(
        `[uTools]: ${preloadEntryFile} 不存在, 请检查是否存在❌!`,
      );
    if (!existsSync(logoFile))
      throw new Error(`[uTools]: ${logoFile} 不存在, 请检查是否存在❌!`);

    OptionsResolver.upxData.preload = preloadEntryFile;
    OptionsResolver.upxData.logo = logoFile;
    return OptionsResolver.upxData;
  }
}
