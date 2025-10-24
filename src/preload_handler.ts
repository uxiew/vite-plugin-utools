import { join } from "node:path";
import { PRELOAD_FILENAME, UTOOLS_BUILD_MODE, UTOOLS_PRELOAD } from "./constant";
import { createPreloadFilter, NodeBuiltin } from "./utils";
import { OptionsResolver, type RequiredOptions } from "./options";
import { build, InlineConfig, Plugin, ResolvedConfig } from 'vite';
import MagicString from "magic-string";
import type { OutputChunk, ProgramNode, AstNode } from 'rollup';
import escapeRegexStr from "@jsbits/escape-regex-str";
import { buildTsd, generateTypes } from "./prepare";
import { purgePreloadbundle } from "./preload_analyzer";


/**
 * 构建 preload.js 文件
 * @param options 插件选项
 * @param isDev 是否为开发模式
 */
export async function buildPreload(options: RequiredOptions) {
    await build(viteBuildConfig(options));
}

function viteBuildConfig(options: RequiredOptions): InlineConfig {
    const { preload: { watch, name, minify, onGenerate }, external } = options;
    // preload file's path
    const preloadPath = OptionsResolver.upxsData.preload
    external.unshift('electron')
    const filter = createPreloadFilter(preloadPath)

    return {
        mode: UTOOLS_PRELOAD,
        plugins: [
            preloadPlugin(options),
        ],
        build: {
            minify,
            watch: watch ? {} : undefined,
            emptyOutDir: false,
            lib: {
                entry: preloadPath,
                formats: ["cjs"],
                fileName: 'preload'
            },
            rollupOptions: {
                external: [...NodeBuiltin, ...external],
                input: preloadPath,
                output: {
                    format: 'cjs',
                    exports: 'named',
                    entryFileNames: PRELOAD_FILENAME,
                    inlineDynamicImports: false,
                    // 定义代码块（chunks）的命名规则
                    // [name] 将由 manualChunks 函数提供
                    chunkFileNames: join('node_modules', '[name].js'),
                    // 手动分包
                    // manualChunks: (id) => (filter(id) ? 'preload' : getNodeModuleName(id) || 'lib'),
                    manualChunks: (id) => {
                        // 假设 filter(id) 是用来识别你的入口文件（如 preload.ts）的逻辑
                        // 入口文件的逻辑保持不变
                        if (filter(id)) {
                            return 'preload';
                        }

                        // 处理 node_modules 里的依赖
                        const lastIndex = id.lastIndexOf('node_modules');
                        if (lastIndex > -1) {
                            const modulePath = id.substring(lastIndex + 'node_modules/'.length);
                            // 'jsdom/lib/jsdom/living/generated/Element.js'

                            const parts = modulePath.split('/');
                            // ['jsdom', 'lib', 'jsdom', 'living', 'generated', 'Element.js']

                            // 识别包名
                            const scopeOrName = parts.shift();
                            const packageName = scopeOrName?.startsWith('@') ? `${scopeOrName}/${parts.shift()}` : scopeOrName;

                            // 将剩余的路径部分（包括文件名）用 '-' 连接起来
                            // 1. 去掉最后一个元素的文件扩展名
                            const lastPartIndex = parts.length - 1;
                            parts[lastPartIndex] = parts[lastPartIndex].replace(/\.[^/.]+$/, "");
                            // 2. 用 '-' 连接
                            const flattenedPath = parts.join('-');
                            // 'lib-jsdom-living-generated-Element'

                            // 组合成 '包名/扁平化后的路径'
                            return `${packageName}/${flattenedPath}`;
                        }

                        // 其他你自己写的、非入口、非 node_modules 的代码，可以统一放到一个文件里
                        return 'lib';
                    },
                },
            }
        },
    }
}

function preloadPlugin(options: RequiredOptions): Plugin {
    const { preload: { watch, name, minify, onGenerate }, external } = options;

    let rc: ResolvedConfig

    return {
        name: 'vite:@ver5/utools-preload',
        configResolved(config) {
            rc = config
        },
        generateBundle(opts, bundle) {
            const preloadChunk = bundle[PRELOAD_FILENAME] as OutputChunk;
            if (!preloadChunk) return;

            let { code: preloadCode, exports: exportNames } = preloadChunk
            exportNames = exportNames.filter((name) => name !== 'default')

            delete bundle[PRELOAD_FILENAME]

            // console.log('preloadCode\n', preloadCode)

            return Promise.resolve().then(() => {
                //预处理：清理 CommonJS 导出，转为全局对象导出
                preloadCode = purgePreloadbundle(preloadCode)

                const scode = new MagicString(preloadCode);
                // clear needless code
                /* 'use strict'; 's length */
                scode.update(12, 13, name ? `;\nwindow.${name} = Object.create(null);` : '')

                // remove external `require('xxx')`
                external.forEach((mod) => {
                    scode.replace(new RegExp(escapeRegexStr(`require('${mod}')`)), 'void 0')
                })

                const globalBase = name ? `window.${name}` : 'window';

                // 移除 `export { ... };` 这样的聚合导出语句
                // ^ -> 行首; \s* -> 任意空格; \{ -> {; [^}]+ -> { 和 } 之间的任意字符; \};? -> }; 或 }
                const declarationRegex = /^export\s*\{[^}]+\};?/gm;
                scode.replaceAll(declarationRegex, '');

                if (exportNames?.length > 0) {
                    const exportsString = exportNames.join(', ');
                    const assignment = `window.${name} = { ${exportsString} };`;

                    // 追加到代码末尾
                    scode.append(assignment);
                }

                // 生成 type? 
                buildTsd(generateTypes(name), 'preload.d.ts')

                // @ts-expect-error onGenerate is function
                const source = onGenerate ? onGenerate.call(scode, scode.toString()) : scode.toString()
                this.emitFile({
                    type: 'asset',
                    fileName: 'preload.js',
                    name: 'preload.js',
                    source
                })
            })
        }
    }
} 