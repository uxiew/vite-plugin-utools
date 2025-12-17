import { describe, it, expect } from 'vitest';
import { analyzePreloadFile, generateAutoMockCode, purgePreloadbundle, generatePreloadTsd } from '../src/preload_analyzer';

describe('preload_analyzer - Debug Tests', () => {
  it('调试 purgePreloadbundle 函数', () => {
    const code = `
        // 一些代码
        Object.defineProperties(exports, {
          someProp: { value: 'test' }
        });
        
        module.exports = someModule;
        
        exports.otherProp = 'other value';
        
        exports.default = DefaultExport;
      `;

    console.log('原始代码:', code);

    const result = purgePreloadbundle(code);

    console.log('处理后代码:', result.code);
    console.log('hasDefaultExport:', result.hasDefaultExport);
    console.log('函数执行完成，检查结果结构:', Object.keys(result));

    // 这些断言应该帮助我们理解函数的实际行为
    expect(result.code).toBeDefined();
    expect(result.hasDefaultExport).toBeDefined();
  });

  it('调试 analyzePreloadFile 函数', () => {
    const sourceCode = `
      const internalFunction = () => 'internal';
      const internalConstant = 'internal value';
      
      export { internalFunction, internalConstant };
    `;

    // 将 console.log 输出写入文件
    const originalConsoleLog = console.log;
    const logs: string[] = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalConsoleLog(...args);
    };

    const result = analyzePreloadFile(sourceCode, 'test.ts');

    // 恢复原始 console.log
    console.log = originalConsoleLog;

    // 输出所有日志
    console.log('=== 调试日志 ===');
    logs.forEach(log => console.log(log));
    console.log('=== 分析结果 ===');
    console.log(JSON.stringify(result, null, 2));

    // 这个断言应该帮助我们理解函数的实际行为
    expect(result.namedExports).toBeDefined();
  });
});