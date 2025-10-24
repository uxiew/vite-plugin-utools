import type MagicString from 'magic-string';
import { normalizePath } from 'vite';
import { basename, dirname, isAbsolute, resolve, resolve as resolvePath } from 'node:path';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { cwd, Data, isObject, isUndef } from './utils';
import { loadPkg, validatePluginJson } from './prepare';

export interface PreloadOptions {
  watch?: boolean;
  // window 环境下的 preload 导出内容的挂载属性
  name?: string;
  minify?: boolean;
  onGenerate?: (this: MagicString, code: string) => string
}

export interface UpxsJSON {
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

export interface UpxsOptions {
  outDir?: string;
  outName?: string;
}

export interface MockOptions {
  /**
   * Whether to enable the mock
   * @default true in development, false in production
   */
  enabled?: boolean;

  /**
   * Mock data for different environments
   */
  mockData?: {
    [key: string]: any;
  };

  /**
   * Custom mock functions
   */
  customMocks?: {
    [key: string]: Function;
  };

  /**
   * Whether to show development indicator
   * @default true
   */
  showDevIndicator?: boolean;

  /**
   * Custom styles for development indicator
   */
  devIndicatorStyles?: string;

  /**
   * uTools API Mock configuration
   */
  utoolsApi?: {
    enabled?: boolean;
    customMethods?: {
      [key: string]: Function;
    };
    dbStorage?: {
      prefix?: string;
      initialData?: {
        [key: string]: any;
      };
    };
  };

  /**
   * Directory used to emit generated mock assets.
   * Defaults to `.utools_mock`.
   */
  directory?: string;

  /**
   * Preload API Mock configuration
   */
  preloadApi?: {
    enabled?: boolean;
    mountName?: string;
    customMethods?: {
      [key: string]: Function;
    };
  };
}

export interface Options {
  configFile?: string;
  noEmit?: boolean;
  external?: string[],
  preload?: PreloadOptions | null
  /** @deprecated upx 插件选项 */
  upx?: UpxsOptions | null
  upxs?: UpxsOptions | null
  mock?: MockOptions | null
}

export type NestedRequired<T> = {
  // [P in keyof T]-?: Exclude<T[P], undefined | null>
  [P in keyof T]-?: NestedRequired<Exclude<T[P], undefined | null>>;
};

export type RequiredOptions = NestedRequired<Options>;

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
    external: [],
    preload: {
      watch: true,
      name: 'preload',
      minify: false,
    },
    upxs: {
      outDir: 'dist',
      outName: '[pluginName]_[version].upx',
    },
    mock: {
      enabled: true,
      showDevIndicator: true,
      mockData: {},
      customMocks: {},
    },
  };

  static resolvedOptions: RequiredOptions;
  // 插件的一些信息
  static upxsData: Required<UpxsJSON>

  constructor(public options: Options) {
    OptionsResolver.resolvedOptions = this.resolve(options);
    OptionsResolver.upxsData = OptionsResolver.refreshUpxsJSON(options.configFile)
  }

  /**
   * @description 获取插件的 upx 选项
   * @returns {UpxsOptions} 插件的 upx 选项
   */
  get resolvedOptions() {
    return OptionsResolver.resolvedOptions
  }

  // 插件的 preload 路径
  static get preloadPath() {
    return OptionsResolver.upxsData.preload
  }

  private resolve(options: Options) {
    return Object.entries(
      {
        ...this.defaultOptions,
        ...options,
      }).reduce((ret, [key, defaultVal]) => {

        // @ts-ignore
        const optsVal = this.options[key];
        if (this.options['upx']) this.options['upxs'] = this.options['upx'];

        if ((key === 'upxs' || key === 'mock') && isUndef(optsVal)) {
          ret[key] = false
          return ret
        }

        if (key === 'external') {
          ret[key] = Array.isArray(optsVal) ? optsVal : [optsVal]
        } else {
          ret[key] = isUndef(optsVal) ? defaultVal : (isObject(defaultVal) && isObject(optsVal) ? { ...defaultVal, ...optsVal } : optsVal);
        }
        return ret;

      }, {} as any);
  }

  /**
  * @description 刷新并获取 plugin json 文件
  * @param configPath plugin.json 文件路径
  * @returns {UpxsJSON} 插件的 upx 选项
  */
  static refreshUpxsJSON(configPath?: string) {
    if (!configPath) throw new Error(`[uTools]: 必须指定 configFile❌`);

    const jsonFilePath = isAbsolute(configPath) ? configPath : resolvePath(cwd, configPath);
    try {
      OptionsResolver.upxsData = JSON.parse(readFileSync(jsonFilePath, 'utf8'));
    } catch {
      throw new Error(`[uTools]: plugin.json 解析错误❌!`);
    }
    validatePluginJson(OptionsResolver.upxsData);

    // plugin.json 所在目录
    const jsonFileDir = dirname(jsonFilePath)
    const preloadEntryFile = resolvePath(jsonFileDir, normalizePath(OptionsResolver.upxsData.preload));
    const logoFile = resolvePath(jsonFileDir, normalizePath(OptionsResolver.upxsData.logo));
    if (!existsSync(preloadEntryFile)) throw new Error(`[uTools]: ${preloadEntryFile} 不存在, 请检查是否存在❌!`);
    if (!existsSync(logoFile)) throw new Error(`[uTools]: ${logoFile} 不存在, 请检查是否存在❌!`);

    OptionsResolver.upxsData.preload = preloadEntryFile
    OptionsResolver.upxsData.logo = logoFile
    return OptionsResolver.upxsData;
  }

}