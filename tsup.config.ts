import { defineConfig } from 'tsup'

//  "tsup-node src/index.ts --target node16 --clean --sourcemap --dts --format cjs,esm ",
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      cli: 'cli/cli.ts'
    },
    minify: "terser",
    target: ["node18"],
    dts: {
      entry: 'src/index.ts'
    },
    shims: true,
    format: ["esm", "cjs"],
    sourcemap: false,
    clean: true,
    external: ['vite', 'electron']
  },
  {
    entry: {
      utoolsApiMockImpl: 'src/mocks/utoolsApiMockImpl.ts'
    },
    minify: "terser",
    target: ["esnext"],
    dts: false,
    shims: false, // Disable shims for browser
    format: ["esm", "cjs"],
    sourcemap: false,
    clean: false, // Don't clean to avoid deleting index build
  }
])
