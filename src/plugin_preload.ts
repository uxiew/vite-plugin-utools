import { join } from "node:path";
import { PRELOAD_FILENAME, UTOOLS_PRELOAD } from "./constant";
import { createPreloadFilter, NodeBuiltin } from "./utils";
import { build, InlineConfig, Plugin, ResolvedConfig, mergeConfig, type Rollup } from 'vite';
import MagicString from "magic-string";
import type { OutputChunk, ProgramNode, AstNode } from 'rollup';
import escapeRegexStr from "@jsbits/escape-regex-str";
import { buildPreloadTsd } from "./prepare";
import { purgePreloadbundle, fillPreloadTsd } from "./preload_analyzer";
import { OptionsResolver, type RequiredOptions } from "./options";

// Track the current watcher to close it when a new build starts
let currentWatcher: Rollup.RollupWatcher | null = null;

/**
 * 构建 preload.js 文件
 * @param options 插件选项
 * @param isDev 是否为开发模式
 */
export async function buildPreload(options: RequiredOptions) {
    // Close existing watcher if any
    if (currentWatcher) {
        // console.log('[uTools Preload] Closing previous watcher...');
        await currentWatcher.close();
        currentWatcher = null;
    }

    const result = await build(viteBuildConfig(options));

    // Store the watcher if in watch mode
    if ('on' in result) {
        currentWatcher = result as Rollup.RollupWatcher;
    }
}

function viteBuildConfig(options: RequiredOptions): InlineConfig {
    const { watch, minify, external, define, viteConfig } = options;
    // preload file's path
    const preloadPath = OptionsResolver.upxData.preload

    // Normalize external to array for internal use if possible, or leave it to user
    const filter = createPreloadFilter(preloadPath)

    return mergeConfig({
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
                external: (source, importer, isResolved) => {
                    if (NodeBuiltin.includes(source)) return true;
                    if (source === 'electron' || source === 'original-fs') return true;
                    if (Array.isArray(external)) return external.includes(source);
                    if (typeof external === 'function') return external(source, importer, isResolved);
                    return false;
                },
                input: preloadPath,
                output: {
                    format: 'cjs',
                    exports: 'named',
                    entryFileNames: PRELOAD_FILENAME,
                    // 定义代码块（chunks）的命名规则
                    // [name] 将由 manualChunks 函数提供
                    chunkFileNames: join('node_modules', '[name].js'),
                    // 手动分包
                    // manualChunks: (id) => (filter(id) ? 'preload' : getNodeModuleName(id) || 'lib'),
                    manualChunks: (id) => {
                        // 假设 filter(id) 是用来识别你的入口文件（如 preload.ts）的逻辑
                        // 入口文件的逻辑保持不变
                        if (filter(id)) return undefined;

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
        define,
    } as InlineConfig, viteConfig || {})
}

function preloadPlugin(options: RequiredOptions): Plugin {
    const { name, onGenerate, external, vconsole } = options;

    let rc: ResolvedConfig

    return {
        name: 'vite:@ver5/utools-preload',
        configResolved(config) {
            rc = config
        },
        generateBundle(_, bundle) {
            // 0️⃣ 遍历所有 bundle，处理 onGenerate
            if (onGenerate) {
                for (const fileName in bundle) {
                    if (fileName === PRELOAD_FILENAME) continue;
                    const chunk = bundle[fileName];
                    if (chunk.type === 'chunk') {
                        const scode = new MagicString(chunk.code)
                        const source = onGenerate(scode, fileName)
                        if (source) {
                            chunk.code = source;
                        } else if (scode.hasChanged()) {
                            chunk.code = scode.toString()
                        }
                    }
                }
            }

            const preloadChunk = bundle[PRELOAD_FILENAME] as OutputChunk;
            if (!preloadChunk) return;

            let { code: rawCode, exports: exportNames } = preloadChunk
            exportNames = exportNames.filter((name) => name !== 'default')

            delete bundle[PRELOAD_FILENAME]

            return Promise.resolve().then(() => {
                // 1️⃣ 预处理：清理 CommonJS 导出，转为全局对象导出
                const { code: preloadCode, hasDefaultExport, exportMap } = purgePreloadbundle(rawCode)

                // const scode = new MagicString(preloadCode);
                // 已经在上面处理过了，这里重新生成一个
                const scode = new MagicString(preloadCode);

                // clear needless code
                // 2️⃣ 在 "use strict" 后添加 
                const useStrictMatch = /("|')use strict\1\s*;?/.exec(preloadCode);
                // Debug log
                if (vconsole) {
                    console.log('\n[uTools] Preload 中注入 vConsole 代码');
                }

                const injectCode = `\nwindow.${name} = Object.create(null);` + (vconsole ? `
;(function(){
  var q=window.__UTOOLS_LOG_QUEUE__=window.__UTOOLS_LOG_QUEUE__||[];
  var log=function(t,a){
     if(window.__UTOOLS_VCONSOLE_READY__) return;
     q.push({t:t,a:a});
  };
  ['log','info','warn','error','debug'].forEach(function(t){
      var o=console[t];
      console[t]=function(){
          o.apply(console,arguments);
          log(t,Array.from(arguments));
      }
  });
  window.addEventListener('error',function(e){
      log('error',[e.message+(e.filename?' ('+e.filename+':'+e.lineno+')':'')]);
  });
})();
` : '');

                if (useStrictMatch) {
                    const insertPos = useStrictMatch.index + useStrictMatch[0].length;
                    scode.appendLeft(insertPos, injectCode);
                } else {
                    scode.prepend(injectCode);
                }

                // 3️⃣ remove external `require('xxx')`
                // external.forEach((mod) => {
                //     scode.replace(new RegExp(escapeRegexStr(`require('${mod}')`)), 'void 0')
                // })

                // 移除 `export { ... };` 这样的聚合导出语句
                // ^ -> 行首; \s* -> 任意空格; \{ -> {; [^}]+ -> { 和 } 之间的任意字符; \};? -> }; 或 }
                const declarationRegex = /^export\s*\{[^}]+\};?/gm;
                scode.replaceAll(declarationRegex, '');

                if (exportNames?.length > 0) {
                    const exportsString = exportNames.map(k => {
                        const localName = exportMap[k] || k;
                        return k === localName ? k : `${k}: ${localName}`;
                    }).join(', ');
                    const assignment = `window.${name} = { ${exportsString} };`;

                    // 追加到代码末尾
                    scode.append(assignment);
                }

                // 生成 preload 类型定义
                buildPreloadTsd(fillPreloadTsd(name, hasDefaultExport))

                // onGenerate 已经在上面此时处理过了，这里不需要再处理
                // const source = onGenerate ? onGenerate.call(scode) : scode.toString()

                // 但是为了确保 preload.js 的最终逻辑（注入代码等）也能被 onGenerate 获取到（如果用户需要在注入后修改），
                // 或者说 onGenerate 的目的通常是修改源码。
                // 如果用户想修改最终生成的代码，应该在最后处理？
                // 之前的逻辑是最后处理。
                // 但是现在我们遍历了所有 chunk。
                // 
                // 对于 preloadChunk，它在 bundle 中存在，会被上面的循环处理一次。
                // 但是 preloadChunk 还是 build 的原始输出。
                // 这里我们对 preloadChunk 做了 purgePreloadbundle 等一系列操作，产生了新的代码 scode。
                // 如果用户想在这个阶段修改，我们需要再次调用 onGenerate 吗？
                // 
                // 原始逻辑：
                // const scode = new MagicString(preloadCode) ... 修改 scode ... const source = onGenerate(scode)
                // 
                // 现在的逻辑：
                // 1. 上面的循环处理了原始的 bundle[PRELOAD_FILENAME]。
                // 2. 这里我们又拿了 rawCode (可能已经被修改了) 继续处理。
                //    注意：bundle[PRELOAD_FILENAME].code 此时可能已经被 onGenerate 修改过了。
                //    rawCode 引用的是字符串，是值拷贝吗？OutputChunk.code 是 string。
                //    所以 let { code: rawCode } = preloadChunk; // rawCode 是最新的。
                // 
                // 3. 接下来进行 purgePreloadbundle(rawCode)。这时候已经是修改过的代码了。
                // 4. 然后进行注入 use strict 等操作。
                // 
                // 如果用户希望修改注入后的代码，我们应该在这里再次调用 onGenerate 吗？
                // 通常 onGenerate 是为了修改编译后的代码。
                // 考虑到兼容性，用户可能之前的用法就是修改这个最终阶段的代码。
                // 
                // 如果我们让用户在第一步就能修改 preload.js，那么这里 purgePreloadbundle 可能会受到影响？
                // 比如用户注入了一些不符合 purgePreloadbundle 预期的代码。
                // 
                // 方案：
                // 1. 对于 PRELOAD_FILENAME，我们在最后再调用一次 onGenerate？
                //    或者在上面循环中跳过 PRELOAD_FILENAME？
                // 
                // 为了保持兼容性，且支持修改其他 split chunks：
                // 1. 遍历 bundle，如果是 PRELOAD_FILENAME，则跳过（或者仅做简单处理，不建议两次修改）。
                //    或者约定：对 PRELOAD_FILENAME，onGenerate 在最后调用。对其他 file，在遍历时调用。

                // 决定：在遍历时跳过 PRELOAD_FILENAME，保持原有逻辑在最后调用，但参数改为 (scode, fileName)。
                // 这样能最大程度兼容原有逻辑。

                const source = onGenerate ? (onGenerate(scode, 'preload.js') || scode.toString()) : scode.toString()

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