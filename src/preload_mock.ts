import path, { basename, dirname, resolve } from "node:path";
import { OptionsResolver, type RequiredOptions } from "./options";
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { analyzePreloadFile, generateMockCode } from "./preload_analyzer";

/**
 * Mock plugin for uTools development using the new manifest-driven runtime.
 */
export function preloadMockPlugin(options: RequiredOptions): Plugin {

    let preloadPath = OptionsResolver.upxsData.preload
    let preloadId = basename(preloadPath)
    let preloadMockId = preloadId.replace('.ts', '.mock.ts')
    let preloadMockPath = resolve(dirname(preloadPath), preloadMockId)
    let server: ViteDevServer;

    const { preload } = options;

    let rc: ResolvedConfig;

    return {
        name: '@ver5/utools-mock',
        enforce: 'pre',
        apply: 'serve',
        configResolved(cfg) {
            rc = cfg;
        },
        configureServer(_server) {
            server = _server
            if (!existsSync(preloadMockPath)) {
                try {
                    const realCode = readFileSync(preloadPath, 'utf-8');
                    const exportsInfo = analyzePreloadFile(realCode, preloadPath);

                    // 2. 生成终极脚手架
                    const mockedCode = generateMockCode(preload.name, exportsInfo);

                    writeFileSync(preloadMockPath, mockedCode);
                    console.log(`[uTools Mock] Successfully scaffolded ${preloadMockId}.`);
                }
                catch (e: any) {
                    rc.logger.info(`[uTools Mock] Failed to scaffold mock file: ${e.message}`);
                }
            }
            //     return null
        },
        resolveId(id) {
            // 如果是开发模式，则重定向到 mock 文件
            if (id.endsWith(preloadId) && server) {
                return preloadMockPath;
            }
            return null;
        },
        transformIndexHtml() {
            if (!server) return;

            const rawBase = server?.config.base ?? '';
            const mockDir = path.relative(rc.root, preloadMockPath);
            // 使用 / 开头，确保是根目录相对路径
            const base = rawBase.endsWith('/') ? rawBase.replace(/\/+$/, '') : rawBase;
            const normalisedDir = mockDir.replace(/^\/+/, '').replace(/\\/g, '/');
            const mockModuleSrc = path.resolve(base, normalisedDir);
            // const mockModuleSrc = `${base}/utools/preload_mock.ts`;

            const globalName = preload.name
            const injectionCode = `
        console.log('[uTools Mock] 开始注入 preload mocks...');
        // 从 mock 文件中导入所有内容
        import defaultExport from '${mockModuleSrc}';
        const { window: _, ${globalName}:__ } = defaultExport;

        // 规则 1：默认导出直接挂载到 window
        if (typeof _ === 'object' && _ !== null) {
          Object.assign(window, _);
          console.log('[uTools Mock] 默认导出挂载到 window:', _);
        }

        // 规则 2：所有命名导出挂载到 window.preload
        window.${globalName} = __;
        console.log('[uTools Mock] 命名导出挂载到 window.${globalName}:', __);
      `;
            return [
                {
                    tag: 'script',
                    attrs: { type: 'module' },
                    children: injectionCode,
                    injectTo: 'head-prepend',
                }
            ];
        }
    };
}