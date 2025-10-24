import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// 定义配置存储键
const CONFIG_KEY = 'coderunner_config';

// 定义接口
interface UserConfig {
    runtimePaths?: Record<string, string>;
    timeouts?: {
        compile: number;
        run: number;
    };
}

interface RuntimeConfig {
    paths: Record<string, string>;
    timeouts: {
        compile: number;
        run: number;
    };
}

/**
 * 检测命令是否可用
 */
function detectCommand(cmds: string[], customPath?: string): string | null {
    // 如果用户提供了自定义路径，优先使用
    if (customPath) {
        try {
            spawnSync(customPath, ['--version'], { stdio: 'ignore' });
            return customPath;
        } catch (e) {
            console.warn(`自定义路径不可用: ${customPath}`, e);
            // 自定义路径不可用时，继续尝试默认命令
        }
    }

    // 尝试默认命令
    for (const cmd of cmds) {
        try {
            spawnSync(cmd, ['--version'], { stdio: 'ignore' });
            return cmd;
        } catch {
            // Ignore command not found errors
        }
    }
    return null;
}

/**
 * 获取用户配置
 */
function getUserConfig(): UserConfig {
    try {
        const config = utools.dbStorage.getItem(CONFIG_KEY);
        return config ? JSON.parse(config) : {};
    } catch (_e) {
        console.error('获取配置失败', _e);
        return {};
    }
}

/**
 * 保存用户配置
 */
function saveUserConfig(config: UserConfig): boolean {
    try {
        utools.dbStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        return true;
    } catch (e) {
        console.error('保存配置失败', e);
        return false;
    }
}

// 获取用户配置的运行时路径
const userConfig = getUserConfig();
const userPaths = userConfig.runtimePaths || {};

// 检测系统上可用的运行时，优先使用用户配置的路径
const runtimes = {
    node: detectCommand(['bun', 'node'], userPaths.node),
    rust: detectCommand(['rustc'], userPaths.rust),
    c: detectCommand(['gcc', 'clang'], userPaths.c),
    dart: detectCommand(['dart'], userPaths.dart),
    deno: detectCommand(['deno'], userPaths.deno),
    tsc: detectCommand(['tsc'], userPaths.tsc)
};

function run(code: string, lang: string): string {
    // 创建临时目录存放待执行的代码文件
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coderunner-'));
    let file: string;
    let command: string;
    let output = '';

    // 获取超时配置
    const config = getUserConfig();
    const timeouts = config.timeouts || { compile: 10000, run: 5000 };

    try {
        switch (lang) {
            case 'javascript':
                file = path.join(tmpDir, 'script.js');
                fs.writeFileSync(file, code);
                command = `${runtimes.node} ${file}`;
                output = execSync(command, { encoding: 'utf8', timeout: timeouts.run });
                break;

            case 'typescript':
                if (runtimes.tsc) {
                    const tsFile = path.join(tmpDir, 'script.ts');
                    const jsFile = path.join(tmpDir, 'script.js');
                    fs.writeFileSync(tsFile, code);

                    // 编译TypeScript
                    execSync(`${runtimes.tsc} ${tsFile}`, { encoding: 'utf8', timeout: timeouts.compile });

                    // 运行编译后的JavaScript
                    output = execSync(`${runtimes.node} ${jsFile}`, { encoding: 'utf8', timeout: timeouts.run });
                } else {
                    throw new Error('TypeScript 编译器未安装');
                }
                break;

            case 'html':
                // 对于HTML，我们创建一个临时文件并返回预览路径
                file = path.join(tmpDir, 'index.html');
                fs.writeFileSync(file, code);
                return JSON.stringify({
                    type: 'html',
                    path: file
                });

            case 'rust':
                if (runtimes.rust) {
                    file = path.join(tmpDir, 'main.rs');
                    const execFile = path.join(tmpDir, 'main');
                    fs.writeFileSync(file, code);

                    // 编译Rust代码
                    execSync(`${runtimes.rust} ${file} -o ${execFile}`, { encoding: 'utf8', timeout: timeouts.compile });

                    // 运行编译后的可执行文件
                    output = execSync(execFile, { encoding: 'utf8', timeout: timeouts.run });
                } else {
                    throw new Error('Rust 编译器未安装');
                }
                break;

            case 'c':
                if (runtimes.c) {
                    file = path.join(tmpDir, 'main.c');
                    const execFile = path.join(tmpDir, 'main');
                    fs.writeFileSync(file, code);

                    // 编译C代码
                    execSync(`${runtimes.c} ${file} -o ${execFile}`, { encoding: 'utf8', timeout: timeouts.compile });

                    // 运行编译后的可执行文件
                    output = execSync(execFile, { encoding: 'utf8', timeout: timeouts.run });
                } else {
                    throw new Error('C 编译器未安装');
                }
                break;

            case 'dart':
                if (runtimes.dart) {
                    file = path.join(tmpDir, 'main.dart');
                    fs.writeFileSync(file, code);
                    output = execSync(`${runtimes.dart} ${file}`, { encoding: 'utf8', timeout: timeouts.run });
                } else {
                    throw new Error('Dart 运行时未安装');
                }
                break;

            default:
                throw new Error(`不支持的语言: ${lang}`);
        }

        return output.trim();
    } catch (error: any) {
        if (error.code === 'ETIMEDOUT') {
            return `执行超时 (${timeouts.run}ms)`;
        }
        return `错误: ${error.message}`;
    } finally {
        // 清理临时文件
        try {
            if (fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn('清理临时文件失败', e);
        }
    }
}

/**
 * 异步执行代码
 */
export async function executeCode(code: string, language: string, _useCustomPath?: boolean): Promise<{
    success: boolean;
    output?: string;
    error?: string;
}> {
    return new Promise((resolve) => {
        try {
            const output = run(code, language);
            resolve({ success: true, output });
        } catch (error: any) {
            resolve({ success: false, error: error.message });
        }
    });
}

/**
 * 同步运行代码
 */
export function runCode(code: string, lang: string): string {
    return run(code, lang);
}

/**
 * 获取运行时信息
 */
export function getRuntimes() {
    const versions: Record<string, string | null> = {};

    for (const [lang, cmd] of Object.entries(runtimes)) {
        if (cmd) {
            try {
                const version = execSync(`${cmd} --version`, { encoding: 'utf8', timeout: 3000 }).trim();
                versions[lang] = version.split('\n')[0]; // 只取第一行
            } catch {
                versions[lang] = 'unknown';
            }
        } else {
            versions[lang] = null;
        }
    }

    return versions;
}

/**
 * 获取运行时配置
 */
export function getRuntimeConfig(): RuntimeConfig {
    const config = getUserConfig();
    return {
        paths: config.runtimePaths || {},
        timeouts: config.timeouts || { compile: 10000, run: 5000 }
    };
}

/**
 * 更新运行时路径
 */
export function updateRuntimePath(lang: string, path: string): boolean {
    const config = getUserConfig();
    if (!config.runtimePaths) {
        config.runtimePaths = {};
    }
    config.runtimePaths[lang] = path;

    // 重新检测该运行时
    if (lang in runtimes) {
        (runtimes as any)[lang] = detectCommand([], path);
    }

    return saveUserConfig(config);
}

/**
 * 重置运行时路径
 */
export function resetRuntimePath(lang: string): boolean {
    const config = getUserConfig();
    if (config.runtimePaths && config.runtimePaths[lang]) {
        delete config.runtimePaths[lang];

        // 重新检测该运行时
        if (lang in runtimes) {
            const defaultCmds: Record<string, string[]> = {
                node: ['bun', 'node'],
                rust: ['rustc'],
                c: ['gcc', 'clang'],
                dart: ['dart'],
                deno: ['deno'],
                tsc: ['tsc']
            };

            if (defaultCmds[lang]) {
                (runtimes as any)[lang] = detectCommand(defaultCmds[lang]);
            }
        }

        return saveUserConfig(config);
    }
    return true;
}

/**
 * 更新超时配置
 */
export function updateTimeouts(compileTimeout?: number, runTimeout?: number): boolean {
    const config = getUserConfig();
    if (!config.timeouts) {
        config.timeouts = { compile: 10000, run: 5000 };
    }

    if (compileTimeout !== undefined) {
        config.timeouts.compile = compileTimeout;
    }
    if (runTimeout !== undefined) {
        config.timeouts.run = runTimeout;
    }

    return saveUserConfig(config);
}

/**
 * 在浏览器中打开文件
 */
export function openInBrowser(filePath: string): boolean {
    try {
        const { shell } = require('electron');
        shell.openExternal(`file://${filePath}`);
        return true;
    } catch (e) {
        console.error('打开浏览器失败', e);
        return false;
    }
}

/**
 * 获取操作系统类型
 */
export function getOsType(): string {
    return os.platform();
}

// Enhanced configuration constants and interfaces
const ENHANCED_CONFIG_KEY = 'coderunner_enhanced_config';
const BACKUPS_KEY = 'coderunner_backups';

// Define enhanced configuration interface (imported from types.ts)
import type { EnhancedConfig } from '../src/types';

/**
 * Get enhanced configuration with default values
 */
function getEnhancedConfig(): EnhancedConfig {
    try {
        const config = utools.dbStorage.getItem(ENHANCED_CONFIG_KEY);
        if (config) {
            const parsed = JSON.parse(config);
            return {
                ...getDefaultEnhancedConfig(),
                ...parsed,
                version: parsed.version || '2.0.0'
            };
        }
        return getDefaultEnhancedConfig();
    } catch (e) {
        console.error('获取增强配置失败', e);
        return getDefaultEnhancedConfig();
    }
}

/**
 * Get default enhanced configuration
 */
function getDefaultEnhancedConfig(): EnhancedConfig {
    return {
        version: '2.0.0',
        runtime: {
            paths: {},
            timeouts: {
                compile: 10000,
                run: 10000
            },
            environment: {},
            workingDirectory: '',
            compilerFlags: {}
        },
        editor: {
            theme: 'vs-dark',
            fontSize: 14,
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            minimap: true,
            autoSave: false,
            autoSaveDelay: 1000,
            formatOnSave: false
        },
        mock: {
            enabled: true,
            utoolsApi: {
                enabled: true,
                mockWindow: true,
                mockClipboard: true,
                mockInput: true,
                mockSystem: true,
                mockDatabase: true
            },
            preloadApi: {
                enabled: true,
                customMocks: {}
            }
        },
        advanced: {
            debugMode: false,
            verboseOutput: false,
            autoClears: {
                onLanguageChange: true,
                onRun: false
            },
            performance: {
                maxOutputLines: 1000,
                enableSyntaxHighlighting: true
            },
            shortcuts: {
                'run': 'Cmd+R',
                'clear': 'Cmd+K',
                'config': 'Cmd+,'
            }
        },
        ui: {
            theme: 'dark',
            accentColor: '#007ACC',
            panelLayout: 'horizontal',
            showStatusBar: true,
            showLineNumbers: true
        }
    };
}

/**
 * Save enhanced configuration
 */
function saveEnhancedConfig(config: EnhancedConfig): boolean {
    try {
        utools.dbStorage.setItem(ENHANCED_CONFIG_KEY, JSON.stringify(config));
        return true;
    } catch (e) {
        console.error('保存增强配置失败', e);
        return false;
    }
}

/**
 * Get backup configurations
 */
function getBackups(): any[] {
    try {
        const backups = utools.dbStorage.getItem(BACKUPS_KEY);
        return backups ? JSON.parse(backups) : [];
    } catch (e) {
        console.error('获取备份失败', e);
        return [];
    }
}

/**
 * Save backup configurations
 */
function saveBackups(backups: any[]): boolean {
    try {
        utools.dbStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
        return true;
    } catch (e) {
        console.error('保存备份失败', e);
        return false;
    }
}

/**
 * Clear all configuration
 */
function clearAllConfig(): boolean {
    try {
        utools.dbStorage.removeItem(ENHANCED_CONFIG_KEY);
        utools.dbStorage.removeItem(CONFIG_KEY); // Clear old config too
        return true;
    } catch (e) {
        console.error('清除配置失败', e);
        return false;
    }
}

/**
 * Validate file path
 */
function validatePath(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

/**
 * Auto detect runtime path
 */
function autoDetectPath(language: string): string | null {
    const commands: Record<string, string[]> = {
        node: ['node', 'bun'],
        rust: ['rustc'],
        c: ['gcc', 'clang'],
        dart: ['dart'],
        deno: ['deno'],
        tsc: ['tsc']
    };

    if (commands[language]) {
        return detectCommand(commands[language]);
    }
    return null;
}

// Export enhanced configuration services
window.codeRunner = {
    // Configuration methods
    getConfig: async (): Promise<EnhancedConfig> => {
        return getEnhancedConfig();
    },

    updateConfig: async (config: EnhancedConfig): Promise<boolean> => {
        return saveEnhancedConfig(config);
    },

    getDefaultConfig: async (): Promise<EnhancedConfig> => {
        return getDefaultEnhancedConfig();
    },

    clearAllConfig: async (): Promise<boolean> => {
        return clearAllConfig();
    },

    // Backup methods
    getBackups: async (): Promise<any[]> => {
        return getBackups();
    },

    saveBackups: async (backups: any[]): Promise<boolean> => {
        return saveBackups(backups);
    },

    // Path validation
    validatePath: (path: string): boolean => {
        return validatePath(path);
    },

    autoDetectPath: (language: string): string | null => {
        return autoDetectPath(language);
    },

    // Legacy compatibility
    runCode: async (code: string, language: string): Promise<string> => {
        return run(code, language);
    },

    getRuntimes: (): Record<string, string | null> => {
        return runtimes;
    },

    // File system operations
    readFile: async (filePath: string): Promise<string> => {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error: any) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    },

    writeFile: async (filePath: string, content: string): Promise<boolean> => {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error: any) {
            console.error(`Failed to write file: ${error.message}`);
            return false;
        }
    },

    createFile: async (filePath: string, content: string = ''): Promise<boolean> => {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error: any) {
            console.error(`Failed to create file: ${error.message}`);
            return false;
        }
    },

    createFolder: async (folderPath: string): Promise<boolean> => {
        try {
            fs.mkdirSync(folderPath, { recursive: true });
            return true;
        } catch (error: any) {
            console.error(`Failed to create folder: ${error.message}`);
            return false;
        }
    },

    deleteFile: async (filePath: string): Promise<boolean> => {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (error: any) {
            console.error(`Failed to delete file: ${error.message}`);
            return false;
        }
    },

    deleteFolder: async (folderPath: string): Promise<boolean> => {
        try {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return true;
        } catch (error: any) {
            console.error(`Failed to delete folder: ${error.message}`);
            return false;
        }
    },

    renameFile: async (oldPath: string, newPath: string): Promise<boolean> => {
        try {
            // Ensure target directory exists
            const dir = path.dirname(newPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.renameSync(oldPath, newPath);
            return true;
        } catch (error: any) {
            console.error(`Failed to rename file: ${error.message}`);
            return false;
        }
    },

    exists: async (path: string): Promise<boolean> => {
        try {
            return fs.existsSync(path);
        } catch {
            return false;
        }
    },

    readDirectory: async (dirPath: string): Promise<any[]> => {
        try {
            if (!fs.existsSync(dirPath)) {
                return [];
            }

            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            const fileNodes: Array<{
                name: string;
                path: string;
                type: 'file' | 'folder';
                expanded: boolean;
                lastModified: number;
                extension?: string;
            }> = [];

            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                const stats = fs.statSync(fullPath);

                const node: {
                    name: string;
                    path: string;
                    type: 'file' | 'folder';
                    expanded: boolean;
                    lastModified: number;
                    extension?: string;
                } = {
                    name: item.name,
                    path: fullPath,
                    type: item.isDirectory() ? 'folder' : 'file',
                    expanded: false,
                    lastModified: stats.mtime.getTime()
                };

                if (!item.isDirectory()) {
                    const ext = path.extname(item.name).toLowerCase().slice(1);
                    node.extension = ext;
                }

                fileNodes.push(node);
            }

            // Sort: folders first, then files, both alphabetically
            return fileNodes.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }
                return a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                });
            });
        } catch (error: any) {
            console.error(`Failed to read directory: ${error.message}`);
            return [];
        }
    },

    selectProjectFolder: async (): Promise<string | null> => {
        try {
            // Use utools file dialog if available
            if (typeof utools !== 'undefined' && (utools as any).showOpenDialog) {
                const result = await (utools).showOpenDialog({
                    properties: ['openDirectory'],
                    title: '选择项目文件夹'
                });
                return result && result.length > 0 ? result[0] : null;
            }

            // Fallback: return null, let frontend handle it
            return null;
        } catch (error: any) {
            console.error(`Failed to select project folder: ${error.message}`);
            return null;
        }
    }
};

export const fun = () => { return 'undefined' };
export const runc = runCode;
export const num = 412;
export const arr = [1, 2, 3]
export const tr = false
const neww = new Object()
let obj = { a: 1, b: 2, t() { } }

export default { dd: { aa: () => { }, neww }, obj }
// export default { neww }
// export default {
//     dd: {
//         fn: () => { },
//         f: false
//     },
//     ten: 10,
//     truey: true,
//     func(i, as) {
//         console.log('sa');
//         return 21
//     },
//     // parseEpub,
//     str: 'string'
// }
