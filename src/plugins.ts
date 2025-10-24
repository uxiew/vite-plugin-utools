import path from 'node:path';
import { build as viteBuild, Plugin, ResolvedConfig } from 'vite';

import buildUpxs from './buildUpxs';
import { PRELOAD_FILENAME, SSR_MODE, UTOOLS_BUILD_MODE, UTOOLS_PRELOAD } from './constant';
import {
  getLocalUrl,
  isUndef,
} from './utils';
import { OptionsResolver, RequiredOptions } from './options';
import { writeUpxsFiles, getDistPath, copyUpxsFiles, getUtoolsPath } from './prepare';
import { buildPreload } from './preload_handler';

let localUrl = ''
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
      const { logger, command } = rc
      const log = logger.info
      logger.info = (info) => {
        // info = info.includes(SSR_MODE) ? info.replace(SSR_MODE, "uTools bundle") : info
        if (info.includes('Local')) {
          writeUpxsFiles(rc, localUrl = getLocalUrl(info))
        }
        log(info)
      }
      // build preload.js 
      buildPreload(options)
    },
    configureServer(server) {
      const pluginJsonPath = path.resolve(getUtoolsPath(), 'plugin.json');
      // server.
      let lastUpdateTime = 0;
      server.watcher.on('change', (file) => {
        if (file === pluginJsonPath && Date.now() - lastUpdateTime > 500) {
          lastUpdateTime = Date.now();
          console.log('[file changed]', path.basename(file))
          OptionsResolver.refreshUpxsJSON(options.configFile)
          writeUpxsFiles(server.config, localUrl)
          copyUpxsFiles(server.config)
        }
      })
    }
  };
};

export const buildPlugin = (options: RequiredOptions): Plugin => {
  const { preload: { name, onGenerate }, external } = options
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
      buildPreload(options).then(() => {
        copyUpxsFiles(config)
      })
    }
  };
};

/** 构建 upx 文件 */
export const buildUpxsPlugin = (options: RequiredOptions): Plugin => {

  let config: ResolvedConfig;

  return {
    name: 'vite:utools-build-upx',
    apply: 'build',
    configResolved: (c) => {
      config = c;
    },
    closeBundle: async () => {
      if (config.mode === UTOOLS_PRELOAD && config.isProduction) {
        writeUpxsFiles(config, localUrl)
        if (!options.configFile || !options.upxs) return;
        await buildUpxs(config.build.outDir, options, config.logger);
      }
    },
  };
};
