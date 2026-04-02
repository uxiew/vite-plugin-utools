import { describe, it, expect, beforeEach } from 'vitest';
import { analyzePreloadFile, generateAutoMockCode, purgePreloadbundle, fillPreloadTsd, FunctionInfo, ConstantInfo, ObjectInfo } from '../src/preload_analyzer';
import { OptionsResolver } from '../src/options';
import fs from 'node:fs';
import path from 'node:path';

describe('preload_analyzer', () => {
    describe('analyzePreloadFile', () => {
        it('应该正确分析导出的函数', () => {
            const sourceCode = `
        export function testFunction(param1: string, param2: number): boolean {
          return true;
        }
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');
            expect(result.namedExports).toHaveProperty('testFunction');
            expect(result.namedExports.testFunction.type).toBe('Function');
            expect((result.namedExports.testFunction as any).params).toEqual(['param1', 'param2']);
            expect(result.namedExports.testFunction.mockReturnValue).toBe('false');
        });

        it('应该处理外部模块导出（默认为函数类型）', () => {
            const sourceCode = `
export { API_KEY, MAX_COUNT } from './constants';
export { formatData, helper } from './utils';
export const localFunction = () => window.utools.showNotification("本地函数");
export const localConstant = '本地常量';
            `;

            const result = analyzePreloadFile(sourceCode, '/project/utools/preload.ts');

            // 外部模块的导出现在默认为 Constant 类型，返回 undefined as any
            expect(result.namedExports.API_KEY).toEqual({
                type: 'Constant',
                value: 'undefined as any'
            });
            expect(result.namedExports.MAX_COUNT).toEqual({
                type: 'Constant',
                value: 'undefined as any'
            });
            expect(result.namedExports.formatData).toEqual({
                type: 'Constant',
                value: 'undefined as any'
            });
            expect(result.namedExports.helper).toEqual({
                type: 'Constant',
                value: 'undefined as any'
            });

            // 本地定义仍然准确
            expect(result.namedExports.localFunction).toEqual({
                type: 'Function',
                params: [],
                mockReturnValue: 'undefined as any'
            });
            expect(result.namedExports.localConstant).toEqual({
                type: 'Constant',
                value: "'本地常量'"
            });
        });

        it('应该正确分析导出的常量', () => {
            const sourceCode = `
        export const testConstant = 'test value';
        export const numberConstant = 42;
        export const boolConstant = true;
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            expect(result.namedExports.testConstant.type).toBe('Constant');
            expect(result.namedExports.testConstant.value).toBe("'test value'");

            expect(result.namedExports.numberConstant.type).toBe('Constant');
            expect(result.namedExports.numberConstant.value).toBe('42');

            expect(result.namedExports.boolConstant.type).toBe('Constant');
            expect(result.namedExports.boolConstant.value).toBe('true');
        });

        it('应该正确分析导出的对象', () => {
            const sourceCode = `
        export const testObject = {
          prop1: 'value1',
          prop2: 123,
          prop3: true,
          method1() {
            return 'method result';
          },
          method2: (param: string) => param.length
        };
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            expect(result.namedExports.testObject.type).toBe('Object');
            expect(result.namedExports.testObject.props).toHaveProperty('prop1');
            expect(result.namedExports.testObject.props.prop1.type).toBe('Constant');
            expect(result.namedExports.testObject.props.prop1.value).toBe("'value1'");
            expect(result.namedExports.testObject.props).toHaveProperty('prop2');
            expect(result.namedExports.testObject.props.prop2.type).toBe('Constant');
            expect(result.namedExports.testObject.props.prop2.value).toBe("123");
            expect(result.namedExports.testObject.props).toHaveProperty('prop3');
            expect(result.namedExports.testObject.props.prop3.type).toBe('Constant');
            expect(result.namedExports.testObject.props.prop3.value).toBe("true");

            expect(result.namedExports.testObject.props).toHaveProperty('method1');
            expect(result.namedExports.testObject.props.method1.type).toBe('Function');
            expect(result.namedExports.testObject.props.method1.params).toEqual([]);

            expect(result.namedExports.testObject.props).toHaveProperty('method2');
            expect(result.namedExports.testObject.props.method2.type).toBe('Function');
            expect(result.namedExports.testObject.props.method2.params).toEqual(['param']);
        });

        it('应该正确分析带有保留字方法的对象', () => {
            const sourceCode = `
export const testObject = {
    method() {},
    case() {}, // Reserved word
    'string-method'() {},
    prop: 'value',
    nested: {
        val: 1
    }
};
            `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');
            expect(result.namedExports.testObject.type).toBe('Object');
            const props = (result.namedExports.testObject as any).props;
            expect(props.method).toBeDefined();
            expect(props.case).toBeDefined();
            expect(props['string-method']).toBeDefined();
            expect(props.prop).toBeDefined();
            expect(props.nested).toBeDefined();
        });

        it('应该正确分析默认导出', () => {
            const sourceCode = `
        export default {
          defaultProp: 'default value',
          defaultMethod: () => 'default method result'
        };
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            expect(result.defaultExport).toBeDefined();
            expect(result.defaultExport!.defaultProp.type).toBe('Constant');
            expect(result.defaultExport!.defaultProp.value).toBe("'default value'");

            expect(result.defaultExport!.defaultMethod.type).toBe('Function');
            expect(result.defaultExport!.defaultMethod.params).toEqual([]);
            expect(result.defaultExport!.defaultMethod.mockReturnValue).toBe("undefined as any");
        });

        it('应该正确分析命名导出', () => {
            const sourceCode = `
        const internalFunction = () => 'internal';
        const internalConstant = 'internal value';
        
        export { internalFunction, internalConstant };
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            expect(result.namedExports).toHaveProperty('internalFunction');
            expect(result.namedExports.internalFunction.type).toBe('Function');

            expect(result.namedExports).toHaveProperty('internalConstant');
            expect(result.namedExports.internalConstant.type).toBe('Constant');
            expect(result.namedExports.internalConstant.value).toBe("'internal value'");
        });

        it('应该正确处理复杂类型', () => {
            const sourceCode = `
        export function promiseFunction1(): Promise<string> {
          return Promise.resolve('test');
        }
        export function promiseFunction2(): Promise<string> {
          return Promise.resolve(123);
        }
        export function promiseFunction3(): Promise<string> {
          return Promise.resolve(true);
        }
        
        export function anyFunction(): any {
          return {};
        }
        
        export function voidFunction(): void {
          console.log('void');
        }
      `;
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            expect(result.namedExports.promiseFunction1.mockReturnValue).toBe(`Promise.resolve()`);
            expect(result.namedExports.promiseFunction2.mockReturnValue).toBe('Promise.resolve()');
            expect(result.namedExports.promiseFunction3.mockReturnValue).toBe('Promise.resolve()');
            expect(result.namedExports.anyFunction.mockReturnValue).toBe('{}');
            expect(result.namedExports.voidFunction.mockReturnValue).toBe('undefined');
        });

        it('应该正确处理 export { name } from "module" 形式的导出', () => {
            // 模拟 playground2 的场景
            const testModuleSource = `
                export const SCRIPTS = ['script1', 'script2']
            `;

            const mainSourceCode = `
                export { SCRIPTS } from './test'
                export const hello = () => window.utools.showNotification("你好🇨🇳！")
                export const read = () => readFileSync("./plugin.json");
            `;

            const result = analyzePreloadFile(mainSourceCode, 'preload.ts');

            // 检查是否能识别出从外部模块导出的变量
            expect(result.namedExports).toHaveProperty('SCRIPTS');
            expect(result.namedExports).toHaveProperty('hello');
            expect(result.namedExports).toHaveProperty('read');

            expect((result.namedExports.SCRIPTS as ConstantInfo).type).toBe('Constant');
            expect((result.namedExports.SCRIPTS as ConstantInfo).value).toBe('undefined as any');

            expect(result.namedExports.hello.type).toBe('Function');
            expect(result.namedExports.read.type).toBe('Function');
        });

        it('应该准确分析本地定义与外部模块导出的区别', () => {
            const sourceCode = `
                // 本地定义的常量
                export const LOCAL_CONSTANT = 'local value';
                
                // 本地定义的函数
                export function localFunction() {
                    return 'local function';
                }
                
                // 从外部模块重新导出（实际定义在外部）
                export { EXTERNAL_CONSTANT } from './external';
                export { externalFunction as externalFunc } from './utils';
                
                // 本地重新导出（实际定义在本地）
                const internalVar = 'internal value';
                export { internalVar };
                
                function internalFunc() {
                    return 'internal function';
                }
                export { internalFunc };
            `;

            const result = analyzePreloadFile(sourceCode, 'test.ts');

            // 验证本地定义的类型准确性
            expect(result.namedExports.LOCAL_CONSTANT.type).toBe('Constant');
            expect(result.namedExports.LOCAL_CONSTANT.value).toBe("'local value'");

            expect(result.namedExports.localFunction.type).toBe('Function');
            expect(result.namedExports.localFunction.params).toEqual([]);

            // 验证外部模块导出（应该尝试递归分析，但会失败回退到 Constant undefined）
            expect(result.namedExports.EXTERNAL_CONSTANT.type).toBe('Constant');
            expect((result.namedExports.EXTERNAL_CONSTANT as ConstantInfo).value).toBe('undefined as any');

            expect((result.namedExports.externalFunc as any).type).toBe('Constant');
            expect((result.namedExports.externalFunc as ConstantInfo).value).toBe('undefined as any');

            // 验证本地重新导出（能找到定义，类型准确）
            expect(result.namedExports.internalVar.type).toBe('Constant');
            expect(result.namedExports.internalVar.value).toBe("'internal value'");

            expect(result.namedExports.internalFunc.type).toBe('Function');
            expect(result.namedExports.internalFunc.params).toEqual([]);
        });

        it('应该处理各种模块路径形式的 export from（外部模块默认为函数类型）', () => {
            const sourceCode = `
                // 相对路径
                export { relativeExport as func1 } from './relative';
                export { parentExport as func2 } from '../parent';
                export { siblingExport as func3 } from './sibling/file';
                
                // 绝对路径
                export { absoluteExport } from '/absolute/path';
                
                // 本地重新导出
                const localVar = 'local';
                export { localVar };
                
                // 直接导出
                export const directExport = 'direct';
            `;

            // 测试外部模块导出 - 应该默认为 Constant undefined
            const result = analyzePreloadFile(sourceCode, 'test.ts');

            // 所有从外部模块的导出都会被默认为 Constant undefined
            expect(result.namedExports.func1.type).toBe('Constant');
            expect((result.namedExports.func1 as ConstantInfo).value).toBe('undefined as any');
            expect(result.namedExports.func2.type).toBe('Constant');
            expect((result.namedExports.func2 as ConstantInfo).value).toBe('undefined as any');
            expect(result.namedExports.func3.type).toBe('Constant');
            expect((result.namedExports.func3 as ConstantInfo).value).toBe('undefined as any');
            expect(result.namedExports.absoluteExport.type).toBe('Constant');
            expect((result.namedExports.absoluteExport as ConstantInfo).value).toBe('undefined as any');

            // 本地重新导出能找到定义，类型准确
            expect(result.namedExports.localVar.type).toBe('Constant');
            expect(result.namedExports.localVar.value).toBe("'local'");

            // 直接导出类型准确
            expect(result.namedExports.directExport.type).toBe('Constant');
            expect(result.namedExports.directExport.value).toBe("'direct'");
        });

        it('应该正确递归分析 export * from 和 export * as ns from', () => {
            const tempDir = path.join(__dirname, 'temp_modules');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            const subModuleAPath = path.join(tempDir, 'sub_module_a.ts');
            const subModuleBPath = path.join(tempDir, 'sub_module_b.ts');
            const mainPath = path.join(tempDir, 'index.ts');

            fs.writeFileSync(subModuleAPath, `
                export const exportA = 'valueA';
                export function funcA() { return 'funcA'; }
            `);

            fs.writeFileSync(subModuleBPath, `
                export const exportB = 'valueB';
            `);

            fs.writeFileSync(mainPath, `
                export * from './sub_module_a';
                export * as b from './sub_module_b';
            `);

            try {
                const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

                // Check export * from './sub_module_a'
                expect(result.namedExports).toHaveProperty('exportA');
                expect((result.namedExports.exportA as ConstantInfo).type).toBe('Constant');
                expect((result.namedExports.exportA as ConstantInfo).value).toBe("'valueA'");

                expect(result.namedExports).toHaveProperty('funcA');
                expect((result.namedExports.funcA as FunctionInfo).type).toBe('Function');

                // Check export * as b from './sub_module_b'
                expect(result.namedExports).toHaveProperty('b');
                expect((result.namedExports.b as ObjectInfo).type).toBe('Object');
                expect((result.namedExports.b as ObjectInfo).props).toHaveProperty('exportB');
                expect(((result.namedExports.b as ObjectInfo).props.exportB as ConstantInfo).type).toBe('Constant');
                expect(((result.namedExports.b as ObjectInfo).props.exportB as ConstantInfo).value).toBe("'valueB'");

            } finally {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('generateAutoMockCode', () => {
        beforeEach(() => {
            // 设置测试所需的静态数据
            OptionsResolver.upxData = { preload: 'test-preload.ts' } as any;
        });

        it('应该生成正确的mock代码', () => {
            const exportsInfo = {
                namedExports: {
                    testFunction: {
                        type: 'Function',
                        params: ['param1', 'param2'],
                        mockReturnValue: 'false'
                    },
                    testConstant: {
                        type: 'Constant',
                        value: "'test value'"
                    }
                },
                errors: []
            };

            const mockCode = generateAutoMockCode('utools', exportsInfo);

            expect(mockCode).toContain('testFunction(param1, param2) {');
            expect(mockCode).toContain('return false;');
            expect(mockCode).toContain('testConstant: \'test value\'');
            expect(mockCode).toContain('utools: {');
        });

        it('应该处理默认导出', () => {
            const exportsInfo = {
                namedExports: {},
                defaultExport: {
                    defaultFunction: {
                        type: 'Function',
                        params: [],
                        mockReturnValue: 'true'
                    }
                },
                errors: []
            };

            const mockCode = generateAutoMockCode('utools', exportsInfo);

            expect(mockCode).toContain('\twindow:{');
            expect(mockCode).toContain('defaultFunction()');
            expect(mockCode).toContain('return true');
        });

        it('应该正确处理返回值为undefined的函数', () => {
            const exportsInfo = {
                namedExports: {
                    voidFunction: {
                        type: 'Function',
                        params: [],
                        mockReturnValue: 'undefined'
                    },
                    normalFunction: {
                        type: 'Function',
                        params: ['param'],
                        mockReturnValue: "'test result'"
                    }
                },
                errors: []
            };

            const mockCode = generateAutoMockCode('utools', exportsInfo);

            // 检查voidFunction不包含return语句
            expect(mockCode).toContain('voidFunction()');
            // expect(mockCode).not.toContain('voidFunction() {\n\t\t\tconsole.log("[Mock] Function \\"voidFunction\\" called with args:", {});\n\t\t\tinfo("[Mock] \\"voidFunction\\" called with args: {}");\n\t\t\treturn undefined;\n\t\t}');

            // 检查normalFunction包含return语句
            expect(mockCode).toContain('normalFunction(param)');
            expect(mockCode).toContain('return \'test result\'');
        });

        it('应该生成正确的缩进', () => {
            const exportsInfo = {
                namedExports: {
                    prop1: { type: 'Constant', value: '1' },
                    prop2: { type: 'Constant', value: '2' }
                },
                errors: []
            } as any;

            const mockCode = generateAutoMockCode('preload', exportsInfo);

            // 检查 prop1 和 prop2 的缩进是否一致
            // prop1 是第一项，prop2 是第二项
            // 之前的问题是第一项多了一个 tab

            // 我们期望的格式：
            // preload: {
            // \t\tprop1: 1,
            // \t\tprop2: 2
            // \t}

            const lines = mockCode.split('\n');
            const prop1Line = lines.find(line => line.includes('prop1: 1'));
            const prop2Line = lines.find(line => line.includes('prop2: 2'));

            expect(prop1Line).toBeDefined();
            expect(prop2Line).toBeDefined();

            // 获取缩进
            const getIndent = (str: string) => str.match(/^\s*/)?.[0] || '';

            expect(getIndent(prop1Line!)).toBe('\t\t');
            expect(getIndent(prop2Line!)).toBe('\t\t');
        });

        it('应该正确处理空数组导出', () => {
            const tempDir = path.join(__dirname, 'temp_modules_array');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            const subModulePath = path.join(tempDir, 'sub.ts');
            const mainPath = path.join(tempDir, 'index.ts');

            fs.writeFileSync(subModulePath, `
                export const EMPTY_ARRAY = [];
                export const NUM_ARRAY = [1, 2, 3];
            `);

            fs.writeFileSync(mainPath, `
                export { EMPTY_ARRAY, NUM_ARRAY } from './sub';
            `);

            try {
                const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

                expect(result.namedExports).toHaveProperty('EMPTY_ARRAY');
                expect((result.namedExports.EMPTY_ARRAY as ConstantInfo).type).toBe('Constant');
                expect((result.namedExports.EMPTY_ARRAY as ConstantInfo).value).toBe("[]");

                expect(result.namedExports).toHaveProperty('NUM_ARRAY');
                expect((result.namedExports.NUM_ARRAY as ConstantInfo).type).toBe('Constant');
                expect((result.namedExports.NUM_ARRAY as ConstantInfo).value).toBe("[1, 2, 3]");

            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('purgePreloadbundle', () => {
        it('应该移除CommonJS导出语句', () => {
            const code = `
        Object.defineProperties(exports, {
          someProp: { value: 'test' }
        });
        
        module.exports = someModule;
        
        exports.otherProp = 'other value';
        
        exports.default = DefaultExport;
      `;

            const result = purgePreloadbundle(code);

            // MagicString 不会修改原始字符串，而是返回修改后的字符串
            expect(result.code).not.toContain('Object.defineProperties(exports, {');
            expect(result.code).not.toContain('module.exports = someModule');
            expect(result.code).not.toContain('exports.otherProp = \'other value\'');
            expect(result.code).toContain('Object.assign(window, DefaultExport)');
            expect(result.hasDefaultExport).toBe(true);
        });

        it('应该正确处理没有默认导出的情况', () => {
            const code = `
        exports.someProp = 'value';
      `;

            const result = purgePreloadbundle(code);

            expect(result.code).not.toContain('exports.someProp =');
            expect(result.hasDefaultExport).toBe(false);
        });

        it('should remove Object.defineProperty(exports, "__esModule", ...)', () => {
            const code = `
            "use strict";
            Object.defineProperty(exports, "__esModule", { value: true });
            exports.hello = void 0;
            const hello = () => {};
            exports.hello = hello;
        `;
            const result = purgePreloadbundle(code);
            expect(result.code).not.toContain('Object.defineProperty(exports');
            expect(result.code).not.toContain('exports.hello = hello');
        });

        it('should remove chained exports assignments', () => {
            const code = `
            "use strict";
            Object.defineProperty(exports, "__esModule", { value: true });
            exports.read = exports.hello = void 0;
            const hello = () => {};
            const read = () => {};
            exports.hello = hello;
            exports.read = read;
        `;
            const result = purgePreloadbundle(code);
            expect(result.code).not.toContain('exports.read = exports.hello = void 0');
            expect(result.code).not.toContain('exports.hello = hello');
            expect(result.code).not.toContain('exports.read = read');
        });
        it('should preserve external exports as const declarations', () => {
            const code = `
            const require_lib = require("./node_modules/lib.js");
            exports.SCRIPTS = require_lib.SCRIPTS;
            const hello = () => {};
            exports.hello = hello;
        `;
            const { code: result } = purgePreloadbundle(code);

            // exports.SCRIPTS = ... should be converted to const SCRIPTS = ...
            expect(result).toContain('const SCRIPTS = require_lib.SCRIPTS;');

            // exports.hello = hello should be removed (since name matches value)
            expect(result).not.toContain('exports.hello = hello');
            expect(result).not.toContain('const hello = hello');
            expect(result).toContain('const hello = () => {};');

        });

        it('应该处理对象字面量的默认导出', () => {
            const code = `
        "use strict";
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.default = {
            toast: function() {},
            test: 123
        };
            `;
            const { code: result, hasDefaultExport } = purgePreloadbundle(code);
            expect(hasDefaultExport).toBe(true);
            expect(result).toContain('Object.assign(window, {');
        });

        it('应该解决变量名冲突 (Identifier collision)', () => {
            const code = `
            let fs = require("fs");
            const fs$1 = {
                readFileSync: fs.readFileSync
            };
            exports.fs = fs$1;
            `;

            const { code: result, exportMap } = purgePreloadbundle(code);

            // 原始代码中已经存在 fs 变量
            // exports.fs = fs$1 应该被重名为 const _up_fs = fs$1;
            // 并且 exportMap 应该包含 fs -> _up_fs

            expect(result).toContain('const _up_fs = fs$1;');
            expect(result).not.toContain('const fs = fs$1;'); // 确保没有生成冲突的代码
            expect(exportMap).toHaveProperty('fs', '_up_fs');
        });
    });

    describe('fillPreloadTsd', () => {
        beforeEach(() => {
            // 设置测试所需的静态数据
            OptionsResolver.upxData = { preload: 'test-preload.ts' } as any;
        });

        it('应该生成正确的类型声明文件', () => {
            const hasDefaultExport = true;
            const name = 'utools';

            const tsd = fillPreloadTsd(name, hasDefaultExport);

            expect(tsd).toContain('import type defaultExport');
            expect(tsd).toContain('import type * as namedExports');
            expect(tsd).toContain('export type PreloadDefaultType');
            expect(tsd).toContain('export type PreloadNamedExportsType');
            expect(tsd).toContain('export interface ExportsTypesForMock');
            expect(tsd).toContain('window: PreloadDefaultType');
            expect(tsd).toContain('utools: PreloadNamedExportsType');
            expect(tsd).toContain('declare global');
            expect(tsd).toContain('interface Window extends PreloadDefaultType');
        });

        it('应该处理没有默认导出的情况', () => {
            const hasDefaultExport = false;
            const name = 'utools';

            const tsd = fillPreloadTsd(name, hasDefaultExport);

            expect(tsd).not.toContain('import type defaultExport');
            expect(tsd).not.toContain('export type PreloadDefaultType');
            expect(tsd).toContain('import type * as namedExports');
            expect(tsd).toContain('export type PreloadNamedExportsType');
            expect(tsd).toContain('export interface ExportsTypesForMock');
            expect(tsd).toContain('utools: PreloadNamedExportsType');
            expect(tsd).toContain('declare global');
            expect(tsd).not.toContain('interface Window extends PreloadDefaultType');
            expect(tsd).toContain('interface Window {');
        });
    });
});