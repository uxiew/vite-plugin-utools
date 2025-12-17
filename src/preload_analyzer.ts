import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import MagicString from 'magic-string';
import { getPreloadId, getPreloadPath } from './options';

// ========== 1. 类型定义 ==========
// 定义我们从 AST 中提取的元数据结构

export interface FunctionInfo {
    type: 'Function';
    params: string[];
    mockReturnValue: string; //  模拟函数的默认返回值
}

export interface ConstantInfo {
    type: 'Constant';
    value: string; // 我们将常量的值直接序列化为字符串
}

export interface ObjectInfo {
    type: 'Object';
    props: Exports;
}

// 导出的实体可以是函数、常量或者一个包含多种类型的对象
export type ExportableEntity = FunctionInfo | ConstantInfo | ObjectInfo;

export type Exports = Record<string, ExportableEntity>;

export interface AllExportsInfo {
    namedExports: Exports;
    errors: string[];
    defaultExport?: Exports;
}

// ========== 2. AST 分析模块 ==========

// 新增辅助函数：根据 TS 类型节点，生成一个默认的 mock 返回值
function getMockReturnValue(node: ts.FunctionLikeDeclaration): string {
    const typeNode = node.type;

    // 1. 检查是否是 async 函数
    if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
        return 'Promise.resolve()';
    }

    if (!typeNode) return 'undefined as any'; // 没有类型注解，返回 undefined as any 以避免类型错误

    switch (typeNode.kind) {
        case ts.SyntaxKind.StringKeyword:
            return "''"; // 字符串类型，返回空字符串
        case ts.SyntaxKind.NumberKeyword:
            return "0"; // 数字类型，返回 0
        case ts.SyntaxKind.BooleanKeyword:
            return "false"; // 布尔类型，返回 false
        case ts.SyntaxKind.VoidKeyword:
        case ts.SyntaxKind.UndefinedKeyword:
            return 'undefined';
        case ts.SyntaxKind.NullKeyword:
            return 'null';
        case ts.SyntaxKind.AnyKeyword:
        case ts.SyntaxKind.UnknownKeyword:
            return '{}'; // any 或 object 类型，返回空对象
        default:
            // 处理 Promise<T>
            if (ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === 'Promise') {
                return 'Promise.resolve()';
            }
            // 其他复杂类型，统一返回空对象
            return '{}';
    }
}

/**
 * 分析预加载文件的 AST，提取所有导出的元数据
 * @param sourceCode 预加载文件的源代码
 * @param fileName 文件名，默认 'preload.ts'
 * @returns 包含所有导出元数据的对象
 */
export function analyzePreloadFile(
    sourceCode: string,
    fileName: string
): AllExportsInfo {
    const sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);

    const exports: AllExportsInfo = {
        namedExports: {},
        errors: []
    };

    // 收集所有变量声明
    const allDeclarations: Record<string, ts.Node> = {};

    function findAllVariableDeclarations(node: ts.Node) {
        if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(decl => {
                if (ts.isIdentifier(decl.name)) {
                    allDeclarations[decl.name.text] = decl;
                }
            });
        }
        if (ts.isFunctionDeclaration(node) && node.name) {
            allDeclarations[node.name.text] = node;
        }
        if (ts.isImportDeclaration(node)) {
            if (node.importClause) {
                if (node.importClause.name) {
                    allDeclarations[node.importClause.name.text] = node.importClause;
                }
                if (node.importClause.namedBindings) {
                    if (ts.isNamedImports(node.importClause.namedBindings)) {
                        node.importClause.namedBindings.elements.forEach(el => {
                            allDeclarations[el.name.text] = el;
                        });
                    }
                    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        allDeclarations[node.importClause.namedBindings.name.text] = node.importClause.namedBindings;
                    }
                }
            }
        }
        ts.forEachChild(node, findAllVariableDeclarations);
    }
    // 先收集所有声明
    findAllVariableDeclarations(sourceFile);
    // console.log(`[Analyzer Debug] All declarations in ${fileName}:`, Object.keys(allDeclarations));

    // 从 初始化表达式中 提取常量值
    function getInitializerValue(initializer: ts.Expression): string | null {
        if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
            return `'${initializer.text}'`;
        }
        if (ts.isArrayLiteralExpression(initializer)) {
            return `[${initializer.elements.map(e => getInitializerValue(e) || 'undefined').join(', ')}]`;
        }
        if (ts.isObjectLiteralExpression(initializer)) {
            return `{${initializer.properties.map(prop => {
                if (ts.isPropertyAssignment(prop)) {
                    const key = prop.name.getText();
                    const value = getInitializerValue(prop.initializer) || 'undefined';
                    return `${key}: ${value}`;
                } else if (ts.isShorthandPropertyAssignment(prop)) {
                    return prop.name.getText();
                }
                return '';
            }).filter(Boolean).join(', ')}}`;
        }
        if (ts.isNumericLiteral(initializer)) {
            return initializer.text;
        }
        if (initializer.kind === ts.SyntaxKind.TrueKeyword) return 'true';
        if (initializer.kind === ts.SyntaxKind.FalseKeyword) return 'false';

        if (ts.isIdentifier(initializer)) {
            const localDef = findLocalVariableValue(initializer.text);
            if (localDef) return localDef;
        }

        return null;
    }

    // 辅助函数：查找本地变量的值
    function findLocalVariableValue(name: string): string | null {
        const decl = allDeclarations[name];
        if (decl && !ts.isImportDeclaration(decl) && !ts.isImportSpecifier(decl)) {
            if (ts.isVariableDeclaration(decl) && decl.initializer) {
                return getInitializerValue(decl.initializer);
            }
        }
        return null;
    }

    // 辅助函数：提取函数信息 
    function getFunctionInfo(node: ts.FunctionLikeDeclaration): FunctionInfo {
        const params = node.parameters.map(p => p.name.getText(sourceFile));
        const mockReturnValue = getMockReturnValue(node);
        return { type: 'Function', params, mockReturnValue };
    }

    // 辅助函数：递归分析对象字面量
    function analyzeObjectLiteral(objNode: ts.ObjectLiteralExpression): Exports {
        const objectInfo: Exports = {};
        objNode.properties.forEach(prop => {
            if (!prop.name) return;
            if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) return;

            const key = prop.name.text;

            if (ts.isMethodDeclaration(prop)) {
                objectInfo[key] = getFunctionInfo(prop);
            }
            else if (ts.isPropertyAssignment(prop)) {
                const valueNode = prop.initializer;
                if (ts.isFunctionExpression(valueNode) || ts.isArrowFunction(valueNode)) {
                    objectInfo[key] = getFunctionInfo(valueNode);
                }
                else if (ts.isObjectLiteralExpression(valueNode)) {
                    objectInfo[key] = { type: 'Object', props: analyzeObjectLiteral(valueNode) }
                }
                else {
                    const constValue = getInitializerValue(valueNode);
                    if (constValue) {
                        objectInfo[key] = { type: 'Constant', value: constValue };
                    }
                }
            }
            else if (ts.isShorthandPropertyAssignment(prop)) {
                const entity = handleExportIdentifier(prop.name.text);
                if (entity) objectInfo[key] = entity as ExportableEntity;
            }
        });
        return objectInfo;
    }

    /**
     * 分析外部模块，返回其导出信息
     */
    function analyzeExternalModule(exportFromPath: string, currentFileName?: string): AllExportsInfo | null {
        try {
            let externalFilePath: string;
            const targetFile = currentFileName || fileName;
            const currentDir = dirname(targetFile);

            externalFilePath = resolve(currentDir, exportFromPath);

            if (!externalFilePath.endsWith('.ts') && !externalFilePath.endsWith('.js')) {
                externalFilePath += '.ts';
            }
            let externalSourceCode: string;
            try {
                externalSourceCode = readFileSync(externalFilePath, 'utf-8');
            } catch (error) {
                try {
                    externalFilePath = externalFilePath.replace('.ts', '.js');
                    externalSourceCode = readFileSync(externalFilePath, 'utf-8');
                } catch (e) {
                    // console.log(`[Analyzer Debug] Failed to read external file: ${externalFilePath}`);
                    throw new Error(`无法读取文件 ${externalFilePath}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            return analyzePreloadFile(externalSourceCode, externalFilePath);
        } catch (error) {
            // console.warn(`无法分析外部模块 ${exportFromPath}:`, error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    function handleExportIdentifier(identifier: string, exportFromPath?: string, currentFileName?: string): ExportableEntity | null {
        // console.log(`[Analyzer Debug] handleExportIdentifier: ${identifier}, from: ${exportFromPath}, file: ${currentFileName}`);
        if (exportFromPath) {
            const externalExports = analyzeExternalModule(exportFromPath, currentFileName);
            if (externalExports) {
                if (externalExports.namedExports[identifier]) {
                    return externalExports.namedExports[identifier];
                }
                if (identifier === 'default' && externalExports.defaultExport) {
                    return { type: 'Object', props: externalExports.defaultExport };
                }
            }
            return { type: 'Constant', value: 'undefined as any' };
        }

        if (!allDeclarations[identifier]) {
            return { type: 'Constant', value: 'undefined as any' };
        }

        const init = allDeclarations[identifier];

        if (ts.isVariableDeclaration(init)) {
            if (init.initializer) {
                if (ts.isArrowFunction(init.initializer) || ts.isFunctionExpression(init.initializer)) {
                    return getFunctionInfo(init.initializer);
                }
                const val = getInitializerValue(init.initializer);
                if (val !== null) return { type: 'Constant', value: val };

                if (ts.isIdentifier(init.initializer)) {
                    return handleExportIdentifier(init.initializer.text, undefined, currentFileName);
                }
            }
        }

        if (ts.isImportSpecifier(init)) {
            let parent: ts.Node = init.parent;
            while (parent && !ts.isImportDeclaration(parent)) {
                parent = parent.parent;
            }
            if (parent && ts.isImportDeclaration(parent)) {
                const moduleSpecifier = (parent.moduleSpecifier as ts.StringLiteral).text;
                const propertyName = init.propertyName ? init.propertyName.text : init.name.text;
                return handleExportIdentifier(propertyName, moduleSpecifier, currentFileName || fileName);
            }
        }
        if (ts.isImportClause(init)) {
            let parent: ts.Node = init.parent;
            if (parent && ts.isImportDeclaration(parent)) {
                const moduleSpecifier = (parent.moduleSpecifier as ts.StringLiteral).text;
                const externalExports = analyzeExternalModule(moduleSpecifier, currentFileName || fileName);
                if (externalExports && externalExports.defaultExport) {
                    return { type: 'Object', props: externalExports.defaultExport };
                }
            }
        }

        if (ts.isFunctionDeclaration(init)) {
            return getFunctionInfo(init);
        }

        return { type: 'Constant', value: 'undefined as any' };
    }

    // 核心遍历函数
    function visit(node: ts.Node, currentFileName?: string) {
        const currentFile = currentFileName || fileName;
        if (ts.isVariableStatement(node)) {
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                node.declarationList.declarations.forEach(({ name, initializer: init }) => {
                    if (ts.isIdentifier(name)) {
                        const nameText = name.text;
                        // console.log(`[Analyzer Debug] VariableStatement export: ${nameText}`, init ? `has init (${ts.SyntaxKind[init.kind]})` : 'no init');
                        if (init) {
                            const value = getInitializerValue(init);
                            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
                                exports.namedExports[nameText] = getFunctionInfo(init);
                            }
                            else if (ts.isObjectLiteralExpression(init)) {
                                exports.namedExports[nameText] = { type: 'Object', props: analyzeObjectLiteral(init) };
                            }
                            else if (value !== null) {
                                exports.namedExports[nameText] = { type: 'Constant', value };
                            } else {
                                const entity = handleExportIdentifier(nameText, undefined, currentFile);
                                if (entity) {
                                    exports.namedExports[nameText] = entity as ExportableEntity;
                                }
                            }
                        }
                    }
                });
            }
        }
        if (ts.isFunctionDeclaration(node)) {
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                if (node.name) {
                    exports.namedExports[node.name.text] = getFunctionInfo(node);
                }
            }
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
                if (node.name) {
                    exports.defaultExport = {
                        [node.name.text]: getFunctionInfo(node)
                    };
                } else {
                    exports.errors.push(`不支持匿名默认导出！`);
                }
            }
        }
        if (ts.isExportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
                ? node.moduleSpecifier.text
                : undefined;

            if (node.exportClause) {
                if (ts.isNamedExports(node.exportClause)) {
                    node.exportClause.elements.forEach(el => {
                        if (ts.isExportSpecifier(el)) {
                            const originalName = el.propertyName?.text || el.name.text;
                            const entity = handleExportIdentifier(originalName, moduleSpecifier, currentFile);
                            if (entity) {
                                exports.namedExports[el.name.text] = entity as ExportableEntity;
                            }
                        }
                    });
                } else if (ts.isNamespaceExport(node.exportClause)) {
                    if (moduleSpecifier) {
                        const externalExports = analyzeExternalModule(moduleSpecifier, currentFile);
                        if (externalExports) {
                            const nsExports: Exports = { ...externalExports.namedExports };
                            if (externalExports.defaultExport) {
                                nsExports['default'] = { type: 'Object', props: externalExports.defaultExport };
                            }
                            exports.namedExports[node.exportClause.name.text] = {
                                type: 'Object',
                                props: nsExports
                            };
                        }
                    }
                }
            } else {
                if (moduleSpecifier) {
                    const externalExports = analyzeExternalModule(moduleSpecifier, currentFile);
                    if (externalExports) {
                        Object.assign(exports.namedExports, externalExports.namedExports);
                    }
                }
            }
        }
        if (ts.isExportAssignment(node)) {
            if (ts.isObjectLiteralExpression(node.expression)) {
                exports.defaultExport = analyzeObjectLiteral(node.expression);
            }
            else if (ts.isIdentifier(node.expression)) {
                const name = node.expression.text
                exports.defaultExport = { [name]: handleExportIdentifier(name, undefined, currentFile) } as Exports;
            }
            else if (ts.isStringLiteral(node.expression) || ts.isArrowFunction(node.expression)) {
                exports.errors.push(`不支持匿名默认导出！`);
            }
        }
    }

    ts.forEachChild(sourceFile, (node) => visit(node, fileName));

    return exports;
}

/**
 * 生成浏览器端的 mock 代码字符串
 * @param exports 分析后的导出实体记录
 * @returns 生成的浏览器端 mock 代码字符串
 */
export function generateAutoMockCode(preloadGlobalName: string, exportsInfo: AllExportsInfo) {
    function generate(exports: Exports = {}, indentLevel = 1) {
        const indent = '\t'.repeat(indentLevel);
        const mockedStr: string[] = [];
        for (const name in exports) {
            const entity = exports[name];
            let definition = indent;

            if (entity === null) {
                definition += `${name}: null`;
            } else {
                if (entity.type === 'Object') {
                    definition += `${name}: {\n${generate(entity.props, indentLevel + 1)}\n${indent}}`;
                }
                if (entity.type === 'Constant') {
                    definition += `${name}: ${entity.value}`;
                }
                if (entity.type === 'Function') {
                    const params = entity.params.join(', ');
                    definition += `${name}(${params}) {\n${'\t'.repeat(indentLevel + 1)}return ${entity.mockReturnValue};\n${indent}}`;
                }
            }
            mockedStr.push(definition);
        }

        return mockedStr.join(',\n');
    }

    const defaultStr = generate(exportsInfo.defaultExport, 2);
    const preloadStr = generate(exportsInfo.namedExports, 2);

    const preloadId = getPreloadId();

    return `// 请不要直接修改此文件，因为它会在每次构建时被覆盖。
// 该类型定义文件由 @ver5/vite-plugin-utools 自动生成
import type { ExportsTypesForMock } from './_${preloadId}.d';

export const autoMock: ExportsTypesForMock = {${defaultStr ? `\n\t// 自动生成的直接挂载在 window 下的实现\n\twindow:{\n${defaultStr}},` : ''}${preloadStr ? `
\t// 自动生成的直接挂载在 window 下的实现\n\t${preloadGlobalName}: {\n${preloadStr}\n\t}` : ''}
}
`;
}

export function generateUserMockCode(preloadGlobalName: string) {
    const preloadMockAutoId = '_mock.auto'
    return `// 请根据需要自定义 mock 实现。
import { autoMock } from './${preloadMockAutoId}';

// 你可以直接修改 autoMock 对象，或者覆盖它
// 例如:
// autoMock.${preloadGlobalName}.someFunction = () => { ... }

export default autoMock;
`;
}

/**
 * 移除 CommonJS 导出语句
 * @param code 原始代码
 * @param fileName 文件名
 * @returns 移除 CommonJS 导出后的代码
 */
export function purgePreloadbundle(code: string): { code: string, hasDefaultExport: boolean } {
    const s = new MagicString(code);
    const sourceFile = ts.createSourceFile('preload_temp.ts', code, ts.ScriptTarget.Latest, true);
    let hasDefaultExport = false;

    ts.forEachChild(sourceFile, (node) => {
        // 1. Remove Object.defineProperties(exports, ...) and Object.defineProperty(exports, ...)
        if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr.expression) &&
                expr.expression.expression.getText(sourceFile) === 'Object' &&
                (expr.expression.name.text === 'defineProperties' || expr.expression.name.text === 'defineProperty') &&
                expr.arguments.length > 0 &&
                expr.arguments[0].getText(sourceFile) === 'exports') {
                s.remove(node.pos, node.end);
                return;
            }
        }

        // 2. Remove module.exports = ...
        if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
            const expr = node.expression;
            if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isPropertyAccessExpression(expr.left) &&
                expr.left.expression.getText(sourceFile) === 'module' &&
                expr.left.name.text === 'exports') {
                s.remove(node.pos, node.end);
                return;
            }
        }

        // 3. Handle exports.xxx = ...
        if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
            const expr = node.expression;
            if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isPropertyAccessExpression(expr.left) &&
                expr.left.expression.getText(sourceFile) === 'exports') {

                const name = expr.left.name.text;
                const right = expr.right;
                const valueText = right.getText(sourceFile);

                if (name === 'default') {
                    hasDefaultExport = true;
                    s.overwrite(node.getStart(sourceFile), node.end, `Object.assign(window, ${valueText})`);
                } else {
                    // Check for chained exports or void 0
                    if (right.kind === ts.SyntaxKind.VoidExpression || valueText === 'undefined') {
                        s.remove(node.pos, node.end);
                        return;
                    }

                    // Check if right side is another exports assignment
                    if (ts.isBinaryExpression(right) &&
                        ts.isPropertyAccessExpression(right.left) &&
                        right.left.expression.getText(sourceFile) === 'exports') {
                        // It's a chained assignment like exports.a = exports.b = ...
                        // We remove it to be safe, assuming it's an initialization.
                        s.remove(node.pos, node.end);
                        return;
                    }

                    if (name === valueText.trim()) {
                        // exports.hello = hello; -> remove
                        s.remove(node.pos, node.end);
                    } else {
                        // exports.hello = ... -> const hello = ...
                        s.overwrite(node.getStart(sourceFile), node.end, `const ${name} = ${valueText};`);
                    }
                }
            }
        }
    });

    return {
        code: s.toString(),
        hasDefaultExport,
    }
}

/**
 * @description 生成 tsd 类型声明文件
 * @param {string} name window上的挂载名（例如 preload）
 */
export function generatePreloadTsd(name: string, hasDefaultExport: boolean) {
    const preloadId = getPreloadId()
    let typesContent = `// 该类型定义文件由 @ver5/vite-plugin-utools 自动生成
// 请不要更改这个文件！
${hasDefaultExport ? `import type defaultExport from './${preloadId}'\n` : ''}import type * as namedExports from './${preloadId}'

${hasDefaultExport ? `export type PreloadDefaultType = typeof defaultExport\n` : ''}export type PreloadNamedExportsType = typeof namedExports

export interface ExportsTypesForMock {
\t${hasDefaultExport ? `window: PreloadDefaultType,\n\t` : ''}${name}: Omit<PreloadNamedExportsType, 'default'>,
}

declare global {
\tinterface Window ${hasDefaultExport ? `extends PreloadDefaultType {` : '{'}
\t\t${name}: PreloadNamedExportsType;
\t}
}
`
    return typesContent;
}
