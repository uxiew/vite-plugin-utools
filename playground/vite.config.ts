import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
// import Inspect from 'vite-plugin-inspect'
import utools from '../src/index';

export default defineConfig((env) => {
  const viteEnv = loadEnv(env.mode, process.cwd()) as unknown as ImportMetaEnv

  const isDev = env.mode === 'development';
  const isProd = env.mode === 'production';
  return {
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
        'utools': path.resolve(process.cwd(), 'utools'),
      },
    },
    plugins: [
      // Inspect(),
      utools({
        // configFile: path.join(process.cwd(), 'utools', 'plugin.json'),
        configFile: './utools/plugin.json',
        external: ['vite', 'vite-plugin-inspect'],
        preload: {
          // 热更新 - 仅在开发环境启用
          watch: isDev,
          // window上的挂载名，为空则表示直接将导出挂载到window下
          name: 'services',
          // 是否压缩 - 生产环境启用压缩
          minify: isProd,
        },
        upxs: {
          outDir: 'dist',
          outName: '[pluginName]_[version].upx',
        },
        mock: {
          enabled: true,
          showDevIndicator: true
        },
      }),
    ],
  }
})
