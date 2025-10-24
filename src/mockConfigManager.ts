/**
 * uTools Mock 配置管理器
 * 提供Mock数据的加载、合并和管理功能
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { createRequire } from 'module';
import vm from 'vm';
import ts from 'typescript';

/**
 * Mock配置接口定义
 */
export interface MockConfig {
  /** 是否启用Mock功能 */
  enabled?: boolean;
  /** 是否显示开发环境指示器 */
  showDevIndicator?: boolean;
  /** 开发环境指示器样式 */
  devIndicatorStyles?: string;
  /** 自定义Mock方法 */
  customMocks?: Record<string, Function>;
  /** Mock数据配置 */
  mockData?: MockDataConfig;
  /** uTools API Mock配置 */
  utoolsApi?: UtoolsApiMockConfig;
  /** preload Mock配置 */
  preloadApi?: PreloadApiMockConfig;
}

/**
 * Mock数据配置接口
 */
export interface MockDataConfig {
  /** 运行时环境Mock数据 */
  runtimes?: Record<string, string | null>;
  /** 运行时配置Mock数据 */
  runtimeConfig?: {
    paths?: Record<string, string>;
    timeouts?: {
      compile?: number;
      run?: number;
    };
  };
  /** 代码执行Mock模板 */
  codeExecutionTemplates?: Record<string, any>;
  /** 自定义服务Mock数据 */
  services?: Record<string, any>;
}

/**
 * uTools API Mock配置接口
 */
export interface UtoolsApiMockConfig {
  /** 是否启用uTools API Mock */
  enabled?: boolean;
  /** 自定义uTools API方法 */
  customMethods?: Record<string, Function>;
  /** dbStorage Mock配置 */
  dbStorage?: {
    prefix?: string;
    initialData?: Record<string, any>;
  };
}

/**
 * Preload API Mock配置接口
 */
export interface PreloadApiMockConfig {
  /** 是否启用preload API Mock */
  enabled?: boolean;
  /** preload对象挂载名称 */
  mountName?: string;
  /** 自定义preload方法实现 */
  customMethods?: Record<string, Function>;
}

/**
 * Mock配置文件查找顺序
 */
const CONFIG_FILES = [
  'utools.mock.json',
  'utools/utools.mock.ts',
  'utools.mock.ts',
  'utools.mock.mjs',
  'utools.mock.js',
  'utools/_mock/index.ts',
];

/**
 * Mock配置管理器类
 */
export class MockConfigManager {
  private projectRoot: string;
  private defaultConfig: MockConfig;
  private userConfig: MockConfig | null = null;
  private mergedConfig: MockConfig | null = null;
  private hasShownConfigTip = false;
  private moduleCache = new Map<string, any>();

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * 获取默认Mock配置
   */
  private getDefaultConfig(): MockConfig {
    return {
      enabled: true,
      showDevIndicator: true,
      devIndicatorStyles: '',
      customMocks: {},
      mockData: {},
      utoolsApi: {
        enabled: true,
        customMethods: {},
        dbStorage: {
          prefix: 'utools_mock_',
          initialData: {}
        }
      },
      preloadApi: {
        enabled: true,
        mountName: 'preload',
        customMethods: {}
      }
    };
  }

  /**
   * 查找并加载用户Mock配置文件
   */
  public loadUserConfig(): MockConfig | null {
    for (const configFile of CONFIG_FILES) {
      const configPath = resolve(this.projectRoot, configFile);

      console.log(`[uTools Mock] 正在查找配置文件: ${configFile}`);
      if (existsSync(configPath)) {
        try {
          this.userConfig = this.loadConfigFile(configPath);
          console.log(`[uTools Mock] 已加载配置文件: ${configFile}`);
          return this.userConfig;
        } catch (error: any) {
          console.warn(`[uTools Mock] 加载配置文件失败 ${configFile}:`, error?.message || error);
        }
      }
    }

    // 只在第一次显示提示信息
    if (!this.hasShownConfigTip) {
      console.log('[uTools Mock] 未找到用户配置文件，使用默认配置');
      this.hasShownConfigTip = true;
    }
    return null;
  }

  /**
   * 加载指定的配置文件
   */
  private loadConfigFile(configPath: string): MockConfig {
    const ext = extname(configPath);

    if (ext === '.json') {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }

    if (ext === '.js' || ext === '.mjs' || ext === '.ts') {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const compiled = this.compileConfigModule(content, configPath, ext);
        return this.executeConfigModule(compiled, configPath);
      } catch (error) {
        console.warn(`[Mock] 解析配置失败:`, error);
        throw new Error(`无法解析配置文件 ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`不支持的配置文件格式: ${ext}`);
  }

  private compileConfigModule(content: string, filePath: string, ext: string): string {
    if (ext === '.ts' || ext === '.mjs') {
      const transpiled = ts.transpileModule(content, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2019,
          esModuleInterop: true,
        }
      });
      return transpiled.outputText;
    }
    return content;
  }

  private resolveModulePath(id: string, importer: string): string {
    const nativeRequire = createRequire(importer);

    try {
      return nativeRequire.resolve(id);
    } catch (error) {
      const baseDir = dirname(importer);
      if (id.startsWith('.') || id.startsWith('/')) {
        const absoluteBase = id.startsWith('.') ? resolve(baseDir, id) : id;
        const candidates = [
          absoluteBase,
          `${absoluteBase}.ts`,
          `${absoluteBase}.js`,
          `${absoluteBase}.mjs`,
          `${absoluteBase}.cjs`,
          resolve(absoluteBase, 'index.ts'),
          resolve(absoluteBase, 'index.js'),
          resolve(absoluteBase, 'index.mjs'),
          resolve(absoluteBase, 'index.cjs'),
        ];
        for (const candidate of candidates) {
          if (existsSync(candidate)) {
            return candidate;
          }
        }
      }
      throw error;
    }
  }

  private executeConfigModule(compiledCode: string, filePath: string): MockConfig {
    if (this.moduleCache.has(filePath)) {
      return this.moduleCache.get(filePath);
    }

    const module = { exports: {} as any };
    const nativeRequire = createRequire(filePath);
    const manager = this;

    const customRequire = function (id: string) {
      const resolved = manager.resolveModulePath(id, filePath);
      if (manager.moduleCache.has(resolved)) {
        return manager.moduleCache.get(resolved);
      }

      const ext = extname(resolved);
      if (ext === '.ts' || ext === '.mjs') {
        const source = readFileSync(resolved, 'utf-8');
        const compiledChild = manager.compileConfigModule(source, resolved, ext);
        const result = manager.executeConfigModule(compiledChild, resolved);
        manager.moduleCache.set(resolved, result);
        return result;
      }

      return nativeRequire(resolved);
    };

    const sandbox = {
      module,
      exports: module.exports,
      require: customRequire,
      __filename: filePath,
      __dirname: dirname(filePath),
      console,
      process,
    };

    const script = new vm.Script(compiledCode, { filename: filePath });
    const context = vm.createContext(sandbox);

    this.moduleCache.set(filePath, module.exports);
    script.runInContext(context);

    const exported = module.exports;
    const result = exported?.default ?? exported;
    this.moduleCache.set(filePath, result);
    return result;
  }

  /**
   * 获取合并后的配置
   */
  public getConfig(): MockConfig {
    if (this.mergedConfig) {
      return this.mergedConfig;
    }

    // 如果还没有加载用户配置，先尝试加载
    if (this.userConfig === null) {
      this.loadUserConfig();
    }

    // 合并配置
    this.mergedConfig = this.mergeConfigs(this.defaultConfig, this.userConfig || {});

    return this.mergedConfig;
  }

  /**
   * 深度合并配置对象
   */
  private mergeConfigs(defaultConfig: MockConfig, userConfig: MockConfig): MockConfig {
    const merged: MockConfig = { ...defaultConfig };

    // 基本配置合并
    Object.keys(userConfig).forEach(key => {
      const userValue = (userConfig as any)[key];
      const defaultValue = (merged as any)[key];

      if (userValue !== undefined) {
        if (typeof userValue === 'object' && userValue !== null && !Array.isArray(userValue)) {
          // 深度合并对象
          (merged as any)[key] = { ...defaultValue, ...userValue };
        } else {
          // 直接覆盖
          (merged as any)[key] = userValue;
        }
      }
    });

    // 特殊处理mockData的合并
    if (userConfig.mockData) {
      merged.mockData = userConfig.mockData
    }

    return merged;
  }

  /**
   * 重新加载配置
   */
  public reloadConfig(): MockConfig {
    this.userConfig = null;
    this.mergedConfig = null;
    this.moduleCache.clear();
    return this.getConfig();
  }

  /**
   * 生成配置文件模板
   */
  public generateConfigTemplate(): string {
    return `// uTools Mock 配置文件
// 这个文件用于自定义 uTools 插件的 Mock 行为

import { MockConfig } from '@ver5/vite-plugin-utools';

const config: MockConfig = {
  // 是否启用Mock功能 (默认在开发环境自动启用)
  enabled: true,

  // 是否显示开发环境指示器
  showDevIndicator: true,

  // 自定义开发环境指示器样式
  devIndicatorStyles: \`
    /* 自定义样式 */
    body::before {
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4) !important;
    }
  \`,

  // Mock数据配置
  mockData: {
    // 运行时环境Mock数据
    runtimes: {
      node: 'v20.0.0 (Custom Mock)',
      python: 'Python 3.12.0 (Custom Mock)',
      // 添加更多运行时...
    },

    // 运行时配置
    runtimeConfig: {
      timeouts: {
        compile: 15000,
        run: 15000
      }
    },

    // 自定义服务Mock数据
    services: {
      // 添加项目特定的Mock数据...
    }
  },

  // uTools API Mock配置
  utoolsApi: {
    enabled: true,

    // 自定义uTools API方法
    customMethods: {
      // 例：自定义showNotification方法
      showNotification: (text: string) => {
        console.log(\`[Mock Notification] \${text}\`);
        // 可以在页面上显示模拟通知
        return true;
      }
    },

    // dbStorage Mock配置
    dbStorage: {
      prefix: 'my_project_mock_',
      initialData: {
        // 预设的存储数据
        'user_settings': JSON.stringify({
          theme: 'dark',
          language: 'zh-CN'
        })
      }
    }
  },

  // Preload API Mock配置
  preloadApi: {
    enabled: true,
    mountName: 'preload',

    // 自定义preload方法实现
    customMethods: {
      // 例：自定义runCode方法的行为
      runCode: (code: string, language: string) => {
        console.log(\`[Custom Mock] 执行 \${language} 代码:\`, code);

        // 返回自定义的Mock结果
        return {
          success: true,
          output: \`[Custom Mock] \${language} 代码执行成功\`,
          timestamp: new Date().toISOString()
        };
      }
    }
  }
};

export default config;
`;
  }

  /**
   * 写入配置模板到项目根目录
   */
  public writeConfigTemplate(filename: string = 'utools.mock.ts'): string {
    const configPath = resolve(this.projectRoot, filename);
    const template = this.generateConfigTemplate();

    const fs = require('fs');
    fs.writeFileSync(configPath, template, 'utf-8');

    console.log(`[Mock] 配置模板已生成: ${filename}`);
    return configPath;
  }
}

/**
 * 创建Mock配置管理器实例
 */
export function createMockConfigManager(projectRoot?: string): MockConfigManager {
  return new MockConfigManager(projectRoot);
}

/**
 * 快速获取Mock配置
 */
export function getMockConfig(projectRoot?: string): MockConfig {
  const manager = createMockConfigManager(projectRoot);
  return manager.getConfig();
}
