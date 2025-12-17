import path from 'node:path';
import { normalizePath, Plugin, ResolvedConfig } from 'vite';

import buildUpx from './upx_handler';
import {
  getLocalUrl,
  isUndef,
} from './utils';
import { OptionsResolver, RequiredOptions } from './options';
import { prepareUpxFiles, getUtoolsPath } from './prepare';
import { buildPreload } from './plugin_preload';

let localUrl = ''

/**
 * 开发模式下的插件，用于在开发服务器启动时，根据配置文件生成 preload.js 文件
 * @param options 
 * @returns 
 */
export const devPlugin = (options: RequiredOptions): Plugin => {
  if (!options.configFile)
    throw new Error('[utools]: configFile is required!')

  // const path = getPluginJSON().preload || ''

  let isDev = true;

  return {
    name: '@ver5/utools-dev',
    apply: 'serve',
    config: (c, env) => {
      return {
        base: isUndef(c.base) || c.base === '/' ? '' : c.base,
      }
    },
    configResolved(rc) {
      // build preload.js 
      buildPreload(options)
    },
    configureServer(server) {
      server.httpServer?.on('listening', () => {
        const local = server.resolvedUrls?.local[0];
        if (local) {
          localUrl = local;
          prepareUpxFiles(server.config, localUrl);
        }
      });

      const pluginJsonPath = normalizePath(path.resolve(getUtoolsPath(), 'plugin.json'));
      const userConfigPath = normalizePath(options.configFile);

      const handleFileChange = (file: string) => {
        const normalizedFile = normalizePath(file);

        if (normalizedFile === userConfigPath || normalizedFile === pluginJsonPath) {
          console.log(`[uTools] ${path.basename(file)} changed, updating...`);
          try {
            // 重新读取并刷新配置
            OptionsResolver.refreshUpxJSON(options.configFile);
            // 重新写入
            prepareUpxFiles(server.config, localUrl);
          } catch (err) {
            console.error('[uTools] Failed to update plugin.json:', err);
          }
        }
      };
      server.watcher.on('change', handleFileChange);
      server.watcher.on('add', handleFileChange);
    }
  };
};

/**
 * 构建模式下的插件，用于在构建时，根据配置文件生成 preload.js 文件
 * @param options 
 * @returns 
 */
export const buildPlugin = (options: RequiredOptions): Plugin => {
  let config: ResolvedConfig

  return {
    name: 'vite:@ver5/utools-bundle',
    apply({ mode }) {
      return mode === 'production'
    },
    configResolved: (c) => {
      config = c
    },
    buildEnd() {
      const buildOptions = {
        ...options,
        // The preload build was defaulting to watch: true (from options.preload.watch), which caused Vite/Rollup to stay in watch mode even during a production build.
        watch: false
      }
      buildPreload(buildOptions)
    },
    closeBundle: async () => {
      prepareUpxFiles(config, localUrl)
      if (!options.configFile || !options.upx) return;
      await buildUpx(config.build.outDir, options, config.logger);
    },
  };
};
