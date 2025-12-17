import path, { basename } from "node:path";
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mockBadgeScript, mockBadgeStyle, mockWrapperScript, utoolsApiMockScript } from "./mocks/helperMock";
import { getPreloadPath, resolvePathToPreload, type RequiredOptions } from "./options";
import type { IndexHtmlTransformResult, Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { analyzePreloadFile, generateAutoMockCode, generateUserMockCode } from "./preload_analyzer";

/**
 * Mock plugin for uTools development using the new manifest-driven runtime.
 */
export function preloadMockPlugin(options: RequiredOptions): Plugin {
    const preloadPath = getPreloadPath()
    const preloadId = basename(preloadPath)
    const preloadMockId = preloadId.replace('.ts', '.mock.ts')
    const preloadMockPath = resolvePathToPreload(preloadMockId)
    const preloadMockAutoId = resolvePathToPreload('_mock.auto.ts')
    const preloadMockAutoPath = resolvePathToPreload(preloadMockAutoId)

    let server: ViteDevServer;

    const { name: globalName, mock } = options;

    if (!mock.enabled) return { name: '@ver5/utools-mock-dummy' }

    const virtualModuleId = 'virtual:utools-mock-runtime'
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

            const scaffoldMock = () => {
                try {
                    const realCode = readFileSync(preloadPath, 'utf-8');
                    const exportsInfo = analyzePreloadFile(realCode, preloadPath);

                    // 1. 生成自动更新的 mock 文件
                    const autoMockCode = generateAutoMockCode(globalName, exportsInfo);
                    writeFileSync(preloadMockAutoPath, autoMockCode);
                    console.log(`[uTools Mock] Updated ${preloadMockAutoPath}`);

                    // 2. 生成用户 mock 文件（如果不存在）
                    if (!existsSync(preloadMockPath)) {
                        const userMockCode = generateUserMockCode(globalName);
                        writeFileSync(preloadMockPath, userMockCode);
                        console.log(`[uTools Mock] Created ${preloadMockPath}`);
                    }

                    // 3. 生成类型定义
                    // writeFileSync(mockHelperPath, mockToastDstCode);
                } catch (e: any) {
                    rc.logger.info(`[uTools Mock] Failed to scaffold mock file: ${e.message}`);
                }
            };

            // 初始生成
            scaffoldMock();
        },
        handleHotUpdate({ file, server }) {
            if (file === preloadPath) {
                console.log('[uTools Mock] Preload file changed, updating mocks...');
                try {
                    const realCode = readFileSync(preloadPath, 'utf-8');
                    const exportsInfo = analyzePreloadFile(realCode, preloadPath);
                    const autoMockCode = generateAutoMockCode(globalName, exportsInfo);
                    writeFileSync(preloadMockAutoPath, autoMockCode);
                    console.log(`[uTools Mock] Updated ${preloadMockAutoPath}`);

                    // 触发全量刷新，因为 mock 文件变了，可能影响全局
                    server.ws.send({ type: 'full-reload' });
                } catch (e: any) {
                    console.error(`[uTools Mock] Failed to update mock file: ${e.message}`);
                }
            }
        },
        resolveId(id) {
            // 如果是开发模式，则重定向到 mock 文件
            if (id.endsWith(preloadId) && server) {
                return preloadMockPath;
            }
            // Vite 会接手请求，自动解析虚拟模块；
            // if (id === virtualModuleId) return 'virtual:utools-mock-runtime'

            return null;
        },
        // load(id) {
        //     // 我们让 HTML 引入一个真实入口模块文件，而这个文件中再 import 虚拟模块;
        //     // 浏览器看到的是合法 URL /@id/virtual:utools-mock-runtime； 
        //     if (id === 'virtual:utools-mock-runtime') {
        //         return
        //     }
        // },
        transformIndexHtml() {
            if (!server) return;

            const rawBase = server?.config.base ?? '';
            const mockDir = path.relative(rc.root, preloadMockPath);
            // 使用 / 开头，确保是根目录相对路径
            const base = rawBase.endsWith('/') ? rawBase.replace(/\/+$/, '') : rawBase;
            const normalisedDir = mockDir.replace(/^\/+/, '').replace(/\\/g, '/');
            const mockModuleSrc = path.resolve(base, normalisedDir);

            const injectionCode = `
        // inject utools api mock
        ${mockWrapperScript}
        ${utoolsApiMockScript()}
        // 从 mock 文件中导入所有内容
        import defaultExport from '${mockModuleSrc}';
        const { window: _, ${globalName}: __ } = defaultExport;
        
        if (window.$isMockDev) {
            console.log('[uTools Mock] --- 注入 preload mocks ---');
            // 规则 1：默认导出直接挂载到 window
            if (typeof _ === 'object' && _ !== null) {
                const wrapped = wrapMockFunctions(_);
                Object.assign(window, wrapped);
                console.log('[uTools Mock] 默认导出挂载到 window:', wrapped);
            } 
            // 规则 2：所有命名导出挂载到 window.preload
            const wrappedPreload = wrapMockFunctions(__, '${globalName}');
            window.${globalName} = wrappedPreload;
            console.log('[uTools Mock] 命名导出挂载到 window.${globalName}:', wrappedPreload);
    
            ${mock.showBadge ? mockBadgeScript(globalName) : ''}
        }
        `;

            return [
                {
                    tag: 'style',
                    children: mock.showBadge ? mockBadgeStyle : '',
                    injectTo: 'head',
                },
                {
                    tag: 'script',
                    attrs: { type: 'module' },
                    children: injectionCode,
                    injectTo: 'head-prepend',
                }
            ] as IndexHtmlTransformResult;
        }
    };
}