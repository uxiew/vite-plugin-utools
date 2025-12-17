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
      // preload 相关配置
      preload: {
        // 热更新
        watch: true,
        // window上的挂载名，为空则表示直接将导出挂载到window下
        name: "preload",
        // 是否压缩
        minify: false,
      },
      upx: {
        outDir: "dist",
        outName: "[pluginName]_[version].upx",
      },
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
      "@ver5/vite-plugin-utools/utools"
    ]
  },
  "include": [
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

直接使用 window.electron 即可。（记住：utools 只支持部分 electorn 模块功能！）

```
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

## preload.name

默认值：`preload`

`preload.js`在`window`的挂载名

## preload.watch

默认值：`true`

`preload.js`修改后重新构建，配合 uTools 开发者工具开启`隐藏插件后完全退出`使用

## preload.minify

默认值：`false`

启用文件的压缩

## preload.onGenerate

默认值：`undefined`
返回值：`(preloadCode:string) => string(required)`

可以通过该函数，修改`preload.js`内容。
该函数的返回值会被设置为`preload.js`的内容。

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

插件提供了完整的 Mock 功能，让你在开发环境中无需 uTools 即可测试插件功能。

## 🚀 新版本 Mock 功能特性

- **完整的 uTools API Mock** - 基于官方 `utools-api-types` 实现所有 API
- **智能 Preload 分析** - 自动分析项目中的 preload 脚本并生成对应 Mock
- **用户自定义支持** - 提供清晰的文件结构，支持用户扩展和覆盖 Mock 行为
- **增量更新** - 自动生成的文件不会覆盖用户自定义内容
- **TypeScript 支持** - 完整的类型定义和智能提示

## 基础配置

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    utools({
      mock: {
        enabled: true, // 启用 Mock 功能
        showDevIndicator: true, // 显示开发环境指示器 
      }
    })
  ]
})
```

## 高级配置

创建 `utools.mock.ts` 文件进行详细配置：

```typescript
import { MockConfig } from '@ver5/vite-plugin-utools'

const config: MockConfig = {
  enabled: true,
  showDevIndicator: true, 

  // uTools API Mock 配置
  utoolsApi: {
    enabled: true,
    customMethods: {
      // 自定义通知方法
      showNotification: (text: string) => {
        console.log('Custom notification:', text);
        // 在页面上显示自定义通知
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed; top: 20px; right: 20px;
          background: #4CAF50; color: white;
          padding: 12px 20px; border-radius: 4px;
          z-index: 10000;
        `;
        notification.textContent = text;
        document.body.appendChild(notification);
        setTimeout(() => document.body.removeChild(notification), 3000);
      }
    },

    // dbStorage 初始数据
    dbStorage: {
      prefix: 'my_app_mock_',
      initialData: {
        'user_settings': JSON.stringify({
          theme: 'dark',
          language: 'zh-CN'
        })
      }
    }
  },

  // Preload API Mock 配置
  preloadApi: {
    enabled: true,
    mountName: 'preload', // 挂载到 window.preload
    customMethods: {
      // 自定义方法实现
      executeCode: async (code: string, language: string) => {
        console.log(`Executing ${language} code:`, code);
        return {
          success: true,
          output: `Mock execution result for ${language}`
        };
      }
    }
  }
}

export default config
```

## 🎯 智能 Mock 文件管理

 插件会：

1. **自动分析** preload 文件中的导出方法
2. **生成 Mock 文件结构**（默认位于 `utools/_mock`）：
   ```
   utools/_mock/
   ├── main.js                  # 浏览器端入口，加载拆分后的 Mock 运行时
   ├── runtime-config.js        # 暴露 manifest、配置与用户覆写引用
   ├── runtime-reporting.js     # 事件 ID、摘要与日志记录工具
   ├── runtime-signatures.js    # 针对签名生成的统一工厂
   ├── runtime-notify.js        # Toast 管理器与样式注入
   ├── runtime-bootstrap.js     # 安装 window.utools 代理与命名空间代理
   ├── manifest.json            # 签名清单
   ├── config.json              # Mock 配置快照
   ├── preload-bridge.ts        # preload 桥接模块（自动更新）
   ├── utools-api.ts            # uTools API 辅助模块（自动更新）
   ├── preload-mock.ts          # ✅ 包含自动区域与自定义区域的预载 Mock
   ├── utools-mock.ts           # ✅ 包含自动区域与自定义区域的 uTools Mock
   └── index.ts                 # MockConfig 聚合入口
   ```

   若根目录不存在 `utools.mock.ts`，生成器会创建一个引用 `utools/_mock/index.ts` 的默认文件。

3. **智能更新** - 自动覆盖 `preload-mock.ts`、`utools-mock.ts` 中标记为 “AUTO-GENERATED” 的代码块，保留其余自定义实现。

### 生成的辅助模块

- `utools/_mock/utools-api.ts`：提供 `createMockUtoolsApi` 等工具，统一封装 `window.utools` 相关的默认模拟实现，可在自定义覆写时复用或参考。
- `utools/_mock/preload-bridge.ts`：根据 `manifest.preloadName` 生成的桥接器，确保前端代码总是访问到最新的 preload 方法，同时支持在 `utools.mock.ts` 中通过 `customMethods` 动态覆写。
- `utools.mock.ts`：若用户未提供自定义配置，会自动生成并导出 `utools/_mock/index.ts`。

> 生成目录中的 `/* AUTO-GENERATED ... */` 区域会在重新分析后更新，保留该区域外的自定义实现即可。

## 📝 自定义 Mock 行为

### 使用辅助函数快速声明 Mock

```ts
import {
  defineMockConfig,
  definePreloadMocks,
  defineUtoolsMocks
} from '@ver5/vite-plugin-utools';

const autoGeneratedPreloadMocks = definePreloadMocks({
  /* AUTO-GENERATED PRELOAD MOCK START */
  // CLI 会在这里写入根据 preload.ts 检测到的方法
  /* AUTO-GENERATED PRELOAD MOCK END */
});

const autoGeneratedUtoolsMocks = defineUtoolsMocks({
  /* AUTO-GENERATED UTOOLS MOCK START */
  // CLI 会在这里写入常用的 utools API scaffold
  /* AUTO-GENERATED UTOOLS MOCK END */
});

export default defineMockConfig({
  preloadApi: {
    customMethods: definePreloadMocks({
      ...autoGeneratedPreloadMocks,
      // 在此添加或重写预载逻辑
    })
  },
  utoolsApi: {
    customMethods: defineUtoolsMocks({
      ...autoGeneratedUtoolsMocks,
      // 在此添加或重写 window.utools 行为
    })
  }
});
```

这三个辅助函数是零开销的语法糖，可以获得完整的类型推断，并引导团队成员在同一位置集中定义 Mock 行为。

> 如果需要在不同环境合并多个配置块，可使用 `applyMockOverrides(baseConfig, { preload, utools })` 辅助函数，它会自动合并 `customMethods`。

### 自定义 uTools API

编辑 `utools/_mock/utools-mock.ts`：

```ts
import { defineUtoolsMocks } from '@ver5/vite-plugin-utools';

const autoGeneratedUtoolsMocks = defineUtoolsMocks({
  /* AUTO-GENERATED UTOOLS MOCK START */
  // 自动生成的默认实现
  /* AUTO-GENERATED UTOOLS MOCK END */
});

export const utoolsMocks = defineUtoolsMocks({
  ...autoGeneratedUtoolsMocks,
  showNotification(text) {
    console.log('[Mock override] showNotification', text);
    return true;
  }
});
```

### 自定义 Preload API

编辑 `utools/_mock/preload-mock.ts`：

```ts
import { definePreloadMocks } from '@ver5/vite-plugin-utools';

const autoGeneratedPreloadMocks = definePreloadMocks({
  /* AUTO-GENERATED PRELOAD MOCK START */
  // 自动生成的默认实现
  /* AUTO-GENERATED PRELOAD MOCK END */
});

export const preloadMocks = definePreloadMocks({
  ...autoGeneratedPreloadMocks,
  executeCode(code, language) {
    console.log('[Mock override] executeCode', code, language);
    return Promise.resolve({ success: true, output: 'done' });
  }
});
```

## 🔧 开发体验

- **详细日志** - 控制台显示所有 Mock API 调用
- **热重载支持** - 配置文件修改后自动重新加载
- **类型安全** - 完整的 TypeScript 类型支持

## 🧠 Mock 运行时工作流

1. **EnhancedPreloadAnalyzer** 会解析 `preload.ts`，同时收集通过 `window.xxx` 或 `window['xxx']` 挂载的 API，并为每个方法生成唯一的 `namespace` 与 `id` 标识。
2. **MockManifestBuilder** 使用这些签名写入 `manifest.json`，在签名哈希变更或 `MANIFEST_VERSION`（当前为 `1.2.0`）更新时，自动重写 `utools/_mock` 目录中的 `main.js`、`preload-bridge.ts` 等文件。
3. **mock main.js** 会根据命名空间自动挂载 Mock：
   - `window.preload` 对应模块导出的 API。
   - 其他命名空间（如 `window.codeRunner`）在保留原对象的同时注入 Mock。
   - 所有事件 ID 均由 `createEventId()` 生成，以兼容缺少 `crypto.randomUUID()` 的旧环境。
4. **preload-bridge.ts** 仅桥接 `manifest.preloadName` 下的 API，并支持按照 `id`、`name`、`namespace.method` 顺序查找覆写函数。

> **提示**：若需要强制同步最新运行时代码，可删除 `utools/_mock` 目录，执行 `pnpm --filter @ver5/vite-plugin-utools build` 后再次运行项目或调用 `MockManifestBuilder` 重新生成 Mock 资产。

# TODO

- [x] 生成 ts 类型
- [x] 完整的 uTools API Mock 实现
- [x] 智能 preload 分析和 Mock 生成
- [x] 用户自定义 Mock 支持
- [ ] preload 自动 reload

# 参考

- https://github.com/13enBi/vite-plugin-utools/
- https://github.com/uTools-Labs/utools-api-types
