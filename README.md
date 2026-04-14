# @ver5/vite-plugin-utools

面向 uTools 插件开发的 Vite 插件。

它解决的是两类问题：
- 把 `plugin.json`、`preload`、网页入口和最终 `dist` 产物串起来，让普通 Vite 项目能直接接入 uTools。
- 在浏览器开发态下补齐 `window.utools` 与 `preload` 导出 mock，让前端页面可以先在浏览器中联调，再放到 uTools 开发者工具里验证。

## 功能概览

- 自动读取 `plugin.json`，校验并解析 `preload`、`logo` 等关键字段。
- 开发模式自动构建 `preload.js`，并把开发服务器地址写回生成后的 `plugin.json`。
- 生产模式自动生成 uTools 可用的 `dist/plugin.json`、`dist/preload.js`，并可选构建 `.upx` 包。
- 支持 `preload.ts` 模块化、npm 依赖拆包、命名导出与默认导出挂载。
- 浏览器开发态自动注入 `utools` mock，并根据 `preload.ts` 自动生成 mock 模板。
- 内置 `uTools` 类型声明与 `plugin.json` schema。
- 可选注入 vConsole，便于在 uTools / upx 环境排查错误。

## 适用场景

适合这类项目：
- 主界面是 Vite 应用，但运行环境是 uTools。
- 需要使用 `preload` 暴露文件系统、剪贴板、Electron 能力给页面。
- 希望在浏览器中先调试页面和 preload 接口，而不是每次都切回 uTools 开发者工具。

## 安装

```bash
pnpm add -D @ver5/vite-plugin-utools
```

## 最小目录结构

推荐结构：

```txt
.
├─ src/
├─ utools/
│  ├─ plugin.json
│  ├─ preload.ts
│  └─ logo.png
├─ vite.config.ts
└─ tsconfig.json
```

其中：
- `utools/plugin.json` 是 uTools 插件清单。
- `utools/preload.ts` 是 preload 入口。
- `src/main.ts` 仍然是普通的 Vite 前端入口。

## 快速开始

### 1. 生成基础模板

```bash
npx utools
```

默认会在项目根目录创建 `utools/`。

也可以自定义目录名：

```bash
npx utools --dir plugin-runtime
```

模板命令只负责生成基础文件，不会修改你的 Vite 配置。生成的 `plugin.json` 会默认带上 `$schema`，开箱即可获得字段提示。

### 2. 在 `vite.config.ts` 中接入插件

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import utools from '@ver5/vite-plugin-utools'

export default defineConfig({
  plugins: [
    vue(),
    utools({
      configFile: './utools/plugin.json',
      name: 'preload',
    }),
  ],
})
```

注意：
- `configFile` 是唯一必填项。

### 3. 在 `tsconfig.json` 中启用类型

> ✨ 已内置完整的 uTools 类型定义（自动合并了 [`utools-api-types`](https://www.npmjs.com/package/utools-api-types)），无需额外安装其他类型包。

```json
{
  "compilerOptions": {
    "types": ["@ver5/vite-plugin-utools/utools"]
  },
  "include": ["src", "utools/**/*.ts"]
}
```

这样可以同时获得：
- `window.utools` 的类型提示。
- `utools/*.ts` 中 preload 相关文件的类型提示。

### 4. 为 `plugin.json` 启用 schema 提示

```json
{
  "$schema": "../node_modules/@ver5/vite-plugin-utools/utools.schema.json"
}
```

如果你的 `plugin.json` 不在项目根目录，而是在默认的 `utools/` 目录下，路径应当相对于该文件本身书写，因此模板默认使用 `../node_modules/...`。

## `preload.ts` 的导出规则

这是这个插件最核心的行为之一。

假设：
- `name: 'preload'`
- `utools/preload.ts` 内容如下：

```ts
export const hello = () => 'hello'
export const copy = (text: string) => window.utools.copyText(text)

export default {
  version: '1.0.0',
}
```

构建后的挂载规则是：
- 所有命名导出挂载到 `window.preload`。
- 默认导出对象直接挂载到 `window`。

也就是页面里可按下面方式访问：

```ts
window.preload.hello()
window.preload.copy('text')
window.version
```

如果你把 `name` 改成 `services`，则命名导出会变成 `window.services.xxx`。

## 浏览器开发态 Mock

开发模式下，插件会自动做两件事：

1. 注入 `window.utools` 的 mock 实现。
2. 根据 `preload.ts` 自动生成 mock 文件，方便你在浏览器里调试页面逻辑。

默认会在 `preload.ts` 同级生成：
- `_mock.auto.ts`
- `preload.mock.ts`

用途分别是：
- `_mock.auto.ts`：根据当前 `preload.ts` 自动生成的类型与默认 mock 内容。
- `preload.mock.ts`：给你覆盖默认 mock 行为的用户文件；首次生成后不会被覆盖。

当 `preload.ts` 更新时，自动 mock 文件会同步刷新，并触发页面全量重载。

### 自定义 mock 行为

你可以直接编辑生成出来的 `preload.mock.ts`，覆盖某些导出：

```ts
import { autoMock } from './_mock.auto'

autoMock.preload.readText = async () => 'mock text'

export default autoMock
```

## 开发流程

### 本地开发

```bash
pnpm vite
```

开发模式下插件会：
- 启动 Vite 页面。
- 同时构建 `preload.js`。
- 将当前 dev server 地址写入生成后的 `plugin.json`。
- 在 `plugin.json` 或原始配置文件变化时重新刷新输出。

然后你只需要在 uTools 开发者工具中指向输出目录内的 `plugin.json` 即可。

### 生产构建

```bash
pnpm vite build
```

生产模式会：
- 构建你的 Vite 页面产物。
- 构建 `preload.js`。
- 生成最终的 `dist/plugin.json`。
- 如果配置了 `upx`，继续打出 `.upx` 文件。

### 包自身构建与发布校验

如果你在维护这个插件仓库本身：

```bash
pnpm build
pnpm test
pnpm verify
```

约定如下：
- `pnpm build` 会先执行 `scripts/bundle-types.js`，确保 `utools.d.ts` 与 `utools.schema.json` 在构建前同步到最新。
- `pnpm test` 只跑测试。
- `pnpm verify` 会串联 `test + build`，适合本地发版前和 CI 使用。

不建议把测试强耦合进普通 `build`，否则会拖慢本地 watch / 调试反馈；更合适的做法是在 `verify`、`release` 和 CI 中强制校验。

## 配置项

### `configFile`

类型：`string`

必填。`plugin.json` 路径。

```ts
utools({
  configFile: './utools/plugin.json',
})
```

### `watch`

类型：`boolean`  
默认值：`true`

是否在开发态监听并重新构建 preload。

### `name`

类型：`string`  
默认值：`'preload'`

命名导出挂载到 `window[name]`。

```ts
utools({
  configFile: './utools/plugin.json',
  name: 'bridge',
})
```

此时 `export const foo = ...` 会挂载到 `window.bridge.foo`。

### `minify`

类型：`boolean`  
默认值：`false`

是否压缩生成的 preload 代码。

### `external`

类型：`RollupOptions['external']`  
默认值：`[]`

用于排除不希望打进 preload 的依赖。`electron`、`original-fs` 会始终作为 external 处理。

典型场景：
- 原生模块无法被 preload 构建正常打包。
- 你希望把某些大型依赖以额外文件形式复制到输出目录。

### `define`

类型：`InlineConfig['define']`

传给 preload 子构建的 `define` 配置。

### `onGenerate`

类型：`(code: MagicString, fileName: string) => string | void`

在最终写出文件前修改生成内容。通常用于：
- 注入额外 banner。
- 调整某些运行时代码。
- 针对 `preload.js` 做最终字符串级 patch。

### `viteConfig`

类型：`InlineConfig`

额外合并到 preload 子构建中的 Vite 配置。适合用于：
- 追加插件。
- 配置别名。
- 调整 Rollup 细节。

### `mock`

类型：

```ts
{
  enabled?: boolean
  showBadge?: boolean
}
```

默认值：

```ts
{
  enabled: true,
  showBadge: true
}
```

作用：
- `enabled` 控制浏览器开发态是否启用 preload mock。
- `showBadge` 控制页面右上角是否显示 mock 调试角标。

### `vconsole`

类型：`boolean | string`  
默认值：`false`

开启后会在 HTML 中自动注入 vConsole，并把 preload 日志队列转发到页面控制台。

```ts
utools({
  configFile: './utools/plugin.json',
  vconsole: true,
})
```

或使用自定义 CDN：

```ts
utools({
  configFile: './utools/plugin.json',
  vconsole: 'https://lib.baomitu.com/vConsole/3.15.0/vconsole.min.js',
})
```

### `upx`

类型：`{ outDir?: string; outName?: string } | null`  
默认值：开发者未配置时视为关闭

用于在生产构建后打出 `.upx` 文件。

```ts
utools({
  configFile: './utools/plugin.json',
  upx: {
    outDir: 'release',
    outName: '[pluginName]_[version].upx',
  },
})
```

说明：
- `outDir` 默认是 `dist`。
- `outName` 默认是 `[pluginName]_[version].upx`。
- 目前适合普通 upx 构建，不适用于加密版 upxs。

## 对外导出

### 默认导出

```ts
import utools from '@ver5/vite-plugin-utools'
```

返回 `Plugin[]`。

### 类型导出

```ts
import type { Options } from '@ver5/vite-plugin-utools'
```

### 分析器导出

```ts
import { analyzePreloadFile } from '@ver5/vite-plugin-utools'
```

适合做：
- 自定义 mock 生成。
- 预加载导出分析。
- 测试场景中的结构检查。

### Mock 运行时导出

```ts
import { MockUToolsApi } from '@ver5/vite-plugin-utools/utoolsMock'
```

同时还导出了：
- `MockDisplay`
- `MockDbStorage`
- `MockDatabase`
- `MockUBrowser`

适合在单元测试或浏览器外环境中手动构造 `window.utools` mock。

### 类型与 schema 导出

- `@ver5/vite-plugin-utools/utools`
- `@ver5/vite-plugin-utools/utools.schema.json`

## 常见问题

### 1. 为什么必须配置 `configFile`？

因为插件需要从 `plugin.json` 反推出：
- preload 入口
- logo 路径
- 插件元信息
- 最终生成到 `dist/plugin.json` 的内容

### 2. 为什么默认导出和命名导出的挂载位置不一样？

这是当前插件的约定：
- 默认导出适合直接暴露到 `window`
- 命名导出适合归类挂到 `window[name]`

这样页面层访问会比较清晰。

### 3. 为什么开发态会生成 `_mock.auto.ts` 和 `preload.mock.ts`？

因为 mock 体系是围绕 `preload.ts` 自动推导的。这样页面开发时既有真实接口形状，又能快速改写返回值。

### 4. 为什么 `vite build` 后还会多一次 preload 构建？

这是插件自己的子构建流程。页面构建和 preload 构建是两条不同链路，插件在生产模式会自动补齐 preload 产物和 `plugin.json`。

### 5. 什么时候需要配置 `external`？

当 preload 中引用了以下内容时通常要考虑：
- 原生模块
- 不适合打包进单文件 preload 的依赖
- 希望手动复制到输出目录的运行时依赖

## 排错建议

### `configFile 未配置`

说明插件初始化时没有传 `configFile`。

### `preload 不存在` 或 `logo 不存在`

说明 `plugin.json` 中的相对路径无法解析到真实文件。注意它们是相对于 `plugin.json` 目录，而不是相对于项目根目录。

### 浏览器里能跑，uTools 里不能跑

优先检查：
- `plugin.json` 里的 `main`、`preload`、`logo` 是否被正确生成到 `dist/`
- preload 中是否依赖了仅浏览器可用的 API
- 是否错误地把 Node/Electron 依赖打包或 external 掉了

### upx 启动后白屏或无日志

可以先开启：

```ts
vconsole: true
```

再重新构建，直接在运行环境里看日志。

## 许可证

MIT
