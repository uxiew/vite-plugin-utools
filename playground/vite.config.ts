import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import utools from '@ver5/vite-plugin-utools'
import path from 'node:path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    utools({
      configFile: path.resolve(__dirname, 'utools/plugin.json'),
      // external: ['@electron/asar'],
      mock: {
        enabled: true,
        showBadge: true
      },
      upx: {
        outDir: 'dist',
        outName: '[pluginName]_[version].upx',
      }
    })
  ],
})
