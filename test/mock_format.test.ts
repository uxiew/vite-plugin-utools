import { describe, it, expect, beforeEach } from 'vitest';
import { generateAutoMockCode } from '../src/preload_analyzer';
import { OptionsResolver } from '../src/options';

describe('Mock Code Format Tests', () => {
    beforeEach(() => {
        // 设置测试所需的配置
        OptionsResolver.upxData = {
            preload: 'test/preload.ts',
            logo: 'test/logo.png',
            pluginName: 'test-plugin',
            main: 'test/index.js',
            version: '1.0.0'
        } as any;
    });

    it('应该生成正确缩进格式的 mock 代码 - 防止 SCRIPTS 格式错误', () => {
        const exportsInfo = {
            namedExports: {
                SCRIPTS: {
                    type: 'Function' as const,
                    params: [],
                    mockReturnValue: 'undefined'
                },
                hello: {
                    type: 'Function' as const,
                    params: [],
                    mockReturnValue: 'undefined'
                },
                read: {
                    type: 'Function' as const,
                    params: ['filePath'],
                    mockReturnValue: 'undefined'
                }
            },
            errors: []
        };

        const mockCode = generateAutoMockCode('preload', exportsInfo);

        // 检查生成的代码格式是否正确
        // 1. 函数定义应该有正确的缩进
        expect(mockCode).toContain('\t\tSCRIPTS() {');
        expect(mockCode).toContain('\t\t\treturn undefined;');
        expect(mockCode).toContain('\t\t},');

        // 2. 检查 hello 函数格式
        expect(mockCode).toContain('\t\thello() {');
        expect(mockCode).toContain('\t\t\treturn undefined;');
        expect(mockCode).toContain('\t\t},');

        // 3. 检查 read 函数格式（有参数）
        expect(mockCode).toContain('\t\tread(filePath) {');
        expect(mockCode).toContain('\t\t\treturn undefined;');
        expect(mockCode).toContain('\t\t},');

        // 4. 检查整体结构
        expect(mockCode).toContain('export const autoMock: ExportsTypesForMock = {');
        expect(mockCode).toContain('\t// 自动生成的直接挂载在 window 下的实现');
        expect(mockCode).toContain('\tpreload: {');
        expect(mockCode).toContain('\t}');
        expect(mockCode).toContain('}');
    });

    it('应该正确处理函数参数格式', () => {
        const exportsInfo = {
            namedExports: {
                testFunction: {
                    type: 'Function' as const,
                    params: ['param1', 'param2', 'param3'],
                    mockReturnValue: 'false'
                }
            },
            errors: []
        };

        const mockCode = generateAutoMockCode('preload', exportsInfo);

        // 检查参数格式
        // 检查参数格式
        expect(mockCode).toContain('\t\ttestFunction(param1, param2, param3) {');
    });

    it('应该正确处理常量格式', () => {
        const exportsInfo = {
            namedExports: {
                testConstant: {
                    type: 'Constant' as const,
                    value: "'test value'"
                },
                numberConstant: {
                    type: 'Constant' as const,
                    value: '42'
                },
                boolConstant: {
                    type: 'Constant' as const,
                    value: 'true'
                }
            },
            errors: []
        };

        const mockCode = generateAutoMockCode('preload', exportsInfo);

        // 检查常量格式 - 注意最后一个常量没有逗号
        expect(mockCode).toContain('\t\ttestConstant: \'test value\',');
        expect(mockCode).toContain('\t\tnumberConstant: 42,');
        expect(mockCode).toContain('\t\tboolConstant: true'); // 最后一个常量没有逗号
    });

    it('应该正确处理对象格式', () => {
        const exportsInfo = {
            namedExports: {
                testObject: {
                    type: 'Object' as const,
                    props: {
                        prop1: {
                            type: 'Constant' as const,
                            value: "'value1'"
                        },
                        method1: {
                            type: 'Function' as const,
                            params: [],
                            mockReturnValue: 'undefined'
                        }
                    }
                }
            },
            errors: []
        };

        const mockCode = generateAutoMockCode('preload', exportsInfo);

        // 检查对象格式 - 根据实际生成的格式调整期望
        expect(mockCode).toContain('\t\ttestObject: {');
        expect(mockCode).toContain('\t\t\tprop1: \'value1\',');
        expect(mockCode).toContain('\t\t\tmethod1() {');
        expect(mockCode).toContain('\t\t\t\treturn undefined;');
        expect(mockCode).toContain('\t\t\t}'); // 函数结束没有逗号
        expect(mockCode).toContain('\t\t}'); // 对象结束没有逗号
    });

    it('应该正确处理默认导出格式', () => {
        const exportsInfo = {
            namedExports: {},
            defaultExport: {
                defaultFunction: {
                    type: 'Function' as const,
                    params: [],
                    mockReturnValue: 'true'
                }
            },
            errors: []
        };

        const mockCode = generateAutoMockCode('preload', exportsInfo);

        // 调试输出
        console.log('Generated mock code:');
        console.log(mockCode);

        // 验证生成的代码结构
        expect(mockCode).toContain('window:{');
        expect(mockCode).toContain('defaultFunction() {');
        expect(mockCode).toContain('return true;');
    });
});