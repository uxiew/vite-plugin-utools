# @ver5/vite-plugin-utools

[Utools](https://u.tools/docs/developer/preload.html) for Vite

- 自动配置开发环境的地址
- 支持直接打包出插件 upx
- 支持 preload.js 模块化
- 支持 uTools api 模块化

# 安装

```bash
npm i @ver5/vite-plugin-utools -D
```

# 配置

在 `vite.config.js` 中添加配置

```js
import utools from "@ver5/vite-plugin-utools";

export default {
  plugins: [
    utools({
      // plugin.json 路径
      configFile: "./utools/plugin.json",
      // 不需要打包的库
      external: ["electron"],
      // 热更新
      watch: true,
      // window上的挂载名，为空则表示直接将导出挂载到window下
      name: "preload",
      // 是否压缩
      minify: false,
      // 额外的 Vite 配置 (用于 preload 构建)
      viteConfig: {
        plugins: []
      },
      upx: {
        outDir: "dist",
        outName: "[pluginName]_[version].upx",
      },
      // Mock 功能配置
      mock: {
        enabled: true,
        showBadge: true
      }
    }),
  ],
};
```

### typescript 开发配置

在`tsconfig.json`中添加配置：

```json
{
  "compilerOptions": {
    "types": [
      // utools api 提示
      "@ver5/vite-plugin-utools/utools"
    ]
  },
  "include": [
    // window 下注入提示
    "utools/*.ts",
  ],
}
```


## 准备开发

如果你是一个全新的 vite 的项目中可以先运行，那么可以先运行下面的命令：

```sh
npx utools
```

会在项目根目录生成名为 utools 文件夹和模版文件。当然了你也可以不运行该命令，直接进行参考上面的配置，进行 utools 开发了。

指定生成的文件夹名

```sh
npx utools --dir utools-dir-name
```

### preload 文件支持 ts 和 npm 库

> 注意 ⚠️：需要在`configFile`的`plugin.json`文件中指定 preload 入口文件，假如你的`preload:'./plugin/index.ts'`表示相对当前`plugin.json`所在路径，之后会自动转换。

### 默认支持部分可用 electron 模块

直接使用 `window.electron` 即可。（记住：utools 只支持部分 electorn 模块功能！）

```ts
export const hello = () => window.utools.showNotification("你好👋！")
export const clearClipboard = () => window.electron.clipboard.clear()
```

假设 preload 入口文件是`index.ts`，并且配置了 preload 的`name: 'demo'`

```js
// index.ts
import { readFileSync } from "fs";

// 所有需要挂载到`window`上的函数或其他，都需要导出使用（记住：只能在入口文件中导出！）
export const hello = () => window.utools.showNotification("你好👋！");
export const clearClipboard = () => window.electron.clipboard.clear();
export const readPlugin = () => readFileSync("./plugin.json");
```

最终转换为`preload.js`：

```js
"use strict";
window["demo"] = Object.create(null);

const { readFileSync } = require("fs");

window["demo"].hello = window.utools.showNotification("你好👋！");
window["demo"].clearClipboard = () => window.electron.clipboard.clear();
window["demo"].readPlugin = () => readFileSync("./plugin.json");
```

当然了也支持导入其他文件，和 npm 模块。

### 支持 preload npm 模块分割

保持`preload.js`的简洁。

运行`npm run dev`显示示例：

```sh
vite v4.1.4 building for utools-build-mode...
✓ 32 modules transformed.
dist/preload.js                 2.35 kB
dist/node_modules/lib.js       53.28 kB │ gzip: 12.22 kB
dist/node_modules/auth.js   53.71 kB │ gzip: 13.11 kB
dist/node_modules/@xmldom.js  122.16 kB │ gzip: 30.23 kB
```

启动项目后，生成的`dist`文件夹中就会包括所需的开发文件了，在“uTools 开发者工具”中指向目标目录中的`plugin.json`即可！

# upx 打包

插件的 `plugin.json` 文件必须项
以下字段不设置，会自动取`package.json`中对应的自动字段，没有的话，则报错！

```json
"name": "demo", // uTools 开发者工具中的项目 id
"pluginName": "demo",
"version": "0.0.1",
"description": "demo",
"author": "chandlerVer5",
"homepage": "https://github.com/chandlerVer5",
"preload": "preload.js",
```

可将 vite 构建后的产物打包成 uTools 的 upx 离线包

# 配置项

## configFile

（必须）
默认值：`''`

插件`plugin.json`文件路径

## noEmit

默认值：`undefined`

如果当前项目属于 typescript 项目，或者 设置`emitTypes:true`会自动生成名为`preload.d.ts`的类型文件（相对于`configFile`中的`preload`路径）。

基本上有两个作用：

1. 自动配置 utools api 的类型声明
2. 自动配置 electron 的类型声明
3. 生成相应的 typescript 类型

> 如果不生效，请尝试`preload.d.ts`的类型声明添加到`tsconfig.json`的`include`中，以便生效！

## external

默认值：`electron`，而且 `electron` 总是会被排除掉。

对于不想打包的包，可以先`external`排除掉，例如`external: ['tiktoken']`,，然后通过 [vite-plugin-static-copy](https://github.com/sapphi-red/vite-plugin-static-copy) 复制到目标目录。

## name

默认值：`preload`

`preload.js`在`window`的挂载名

## watch

默认值：`true`

`preload.js`修改后重新构建，配合 uTools 开发者工具开启`隐藏插件后完全退出`使用

## minify

默认值：`false`

启用文件的压缩

## onGenerate

默认值：`undefined`
返回值：`(preloadCode:string) => string(required)`

可以通过该函数，修改`preload.js`内容。
该函数的返回值会被设置为`preload.js`的内容。

## viteConfig 

默认值：`undefined`

额外的 Vite 配置，用于合并到 preload 的构建配置中。可以用于注入插件、配置别名等。

## upx.outDir

默认值： `dist`

插件打包输出路径

## upx.outName

默认值：`[pluginName]_[version].upx`

插件输出文件名

# `preload.ts` 类型声明

如果你的 preload 脚本中使用了 typescript，那么你可以在`preload.d.ts`中添加类型声明。

例如：

```typescript
export const hello: () => void;
export const clearClipboard: () => void;
export const readPlugin: () => string;

// ---- export default 形式的导出会直接挂在到 window 下----
const users = { ... };
export default users;  // 显式命名对象

// ----支持默认导出，必须具名----
export default function aa (){
}
const bb = ''
export default bb

// 只支持如下匿名默认导出
export default {

}
```


# Mock 功能

插件提供了 Mock 功能，让你在浏览器开发环境中（`npm run dev`）无需打开 uTools 即可测试插件功能。

## 面向接口开发

插件会自动分析你的 `preload.ts` 文件，并在同级目录下生成 `_mock.auto.ts` 文件。
建议不要修改 `_mock.auto.ts`，而是创建一个同名的 `.mock.ts` 文件（例如 `preload.ts` -> `preload.mock.ts`）来进行自定义 Mock。

Mock 系统特性：

*   **自动模拟 window.utools**：提供了一套完整的 `window.utools` API 模拟实现（基于内存）。
*   **自动模拟 preload 导出**：根据 `preload.ts` 的导出，自动挂载 mocks 到 `window.preload`（或其他配置的名称）。
*   **热更新**：修改 `preload.ts` 或 mock 文件后，浏览器会自动刷新，无需重启。
*   **环境隔离**：在真实 uTools 环境中自动失效，不会影响生产环境。

你可以通过 `window.$isMockDev` 变量在代码中判断当前是否处于 Mock 开发环境。

## 目录结构示例

```
utools/
├── preload.ts          # 真实源码
├── _mock.auto.ts       # 自动生成的类型和基础 Mock（勿改）
└── preload.mock.ts     # (可选) 用户自定义覆盖 Mock 实现
```

## 自定义 Mock 示例

在 `preload.mock.ts` 中：

```typescript
// 覆盖默认的 Mock 实现
export const hello = () => {
  console.log('Mock hello called!');
  return 'Mock data';
}

// 模拟 window.utools 行为
window.utools.dbStorage.setItem('test', 'data');
```

# TODO

- [x] 生成 ts 类型
- [x] 完整的 uTools API Mock 实现
- [x] 智能 preload 分析和 Mock 生成
- [x] 用户自定义 Mock 支持
- [x] preload 自动 reload

# 参考

- https://github.com/13enBi/vite-plugin-utools/
- https://github.com/uTools-Labs/utools-api-types
