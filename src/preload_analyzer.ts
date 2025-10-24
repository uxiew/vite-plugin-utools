import ts from 'typescript';

// ========== 1. 类型定义 ==========
// 定义我们从 AST 中提取的元数据结构

interface FunctionInfo {
    type: 'Function';
    params: string[];
    mockReturnValue: string; //  模拟函数的默认返回值
}

interface ConstantInfo {
    type: 'Constant';
    value: string; // 我们将常量的值直接序列化为字符串
}

interface ObjectInfo {
    type: 'Object';
    props: Exports;
}

// 导出的实体可以是函数、常量或者一个包含多种类型的对象
type ExportableEntity = FunctionInfo | ConstantInfo | ObjectInfo;

type Exports = Record<string, ExportableEntity>;

interface AllExportsInfo {
    namedExports: Exports;
    errors: string[];
    defaultExport?: Exports;
}

// ========== 2. AST 分析模块 ==========

// 新增辅助函数：根据 TS 类型节点，生成一个默认的 mock 返回值
function getMockReturnValue(typeNode: ts.TypeNode | undefined): string {
    if (!typeNode) return 'undefined'; // 没有类型注解，返回 undefined

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

// 负责深度分析 TS 代码并提取所有导出的元数据 
export function analyzePreloadFile(sourceCode: string, sourceFileName: string): AllExportsInfo {
    const sourceFile = ts.createSourceFile(sourceFileName, sourceCode, ts.ScriptTarget.Latest, true);

    const exports: AllExportsInfo = {
        namedExports: {},
        errors: []
    };

    // 从 初始化表达式中 提取常量值
    function getInitializerValue(initializer: ts.Expression): string | null {
        if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
            return `'${initializer.text}'`; // 返回带引号的字符串
        }
        if (ts.isArrayLiteralExpression(initializer)) {
            return `[${initializer.elements.map(e => getInitializerValue(e) || '').join(', ')}]`;
        }
        if (ts.isObjectLiteralExpression(initializer)) {
            return `{${initializer.properties.map(prop => {
                if (ts.isPropertyAssignment(prop)) {
                    const key = prop.name.getText();
                    const value = getInitializerValue(prop.initializer) || '';
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
        return null;
    }

    // 辅助函数：提取函数信息 
    function getFunctionInfo(node: ts.FunctionLikeDeclaration): FunctionInfo {
        const params = node.parameters.map(p => p.name.getText(sourceFile));
        // `node.type` 指向函数的返回类型节点
        const mockReturnValue = getMockReturnValue(node.type);
        return { type: 'Function', params, mockReturnValue };
    }

    // 辅助函数：递归分析对象字面量
    function analyzeObjectLiteral(objNode: ts.ObjectLiteralExpression): Exports {
        const objectInfo: Exports = {};
        objNode.properties.forEach(prop => {
            if (!prop.name || !ts.isIdentifier(prop.name)) return;
            const key = prop.name.text;

            // 处理方法简写：func() {}
            if (ts.isMethodDeclaration(prop)) {
                objectInfo[key] = getFunctionInfo(prop);
            }
            // 处理属性赋值：fn: () => {}
            else if (ts.isPropertyAssignment(prop)) {
                const valueNode = prop.initializer;
                if (ts.isFunctionExpression(valueNode) || ts.isArrowFunction(valueNode)) {
                    objectInfo[key] = getFunctionInfo(valueNode);
                }
                // `dd:{}`
                else if (ts.isObjectLiteralExpression(valueNode)) {
                    objectInfo[key] = { type: 'Object', props: analyzeObjectLiteral(valueNode) }
                }
                // 处理常量赋值：test: 'test'
                else {
                    const constValue = getInitializerValue(valueNode); // 复用之前的常量分析函数
                    if (constValue) {
                        objectInfo[key] = { type: 'Constant', value: constValue };
                    }
                }
            }
            // 处理 `export default { xxx }`
            else if (ts.isShorthandPropertyAssignment(prop)) {
                objectInfo[key] = handleExportIdentifier(prop.name.text);
            }
        });
        return objectInfo;
    }

    /** 
     * 处理导出标识符，根据是否为命名导出或默认导出，将信息存储到 exports 中
     * @param identifier 导出的标识符名称
     * @param isNamedExport 是否为命名导出，默认值为 false
    */
    function handleExportIdentifier(identifier: string) {
        let declarationFound = false;
        // 对于复杂情况，例如：const xxx = new Object/Promise.resolve() 等，直接返回 null
        let resultExport: ExportableEntity | null = null;

        ts.forEachChild(sourceFile, (node) => {
            if (declarationFound) return true; // 找到后停止遍历

            // a) 寻找 `function xxx() { }`
            if (ts.isFunctionDeclaration(node) && node.name?.text === identifier) {
                resultExport = getFunctionInfo(node);
                declarationFound = true;
            }
            // b) 寻找 `let/const xxx = ...`
            if (ts.isVariableStatement(node)) {
                node.declarationList.declarations.forEach(({ name, initializer: init }) => {
                    if (ts.isIdentifier(name) && name.text === identifier) {
                        if (init) {
                            const value = getInitializerValue(init)
                            if (ts.isObjectLiteralExpression(init)) {
                                resultExport = { type: 'Object', props: analyzeObjectLiteral(init) };
                            }
                            else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
                                resultExport = getFunctionInfo(init);
                            }
                            else if (ts.isIdentifier(init)) {
                                resultExport = handleExportIdentifier(init.text);
                            }
                            else {
                                if (value !== null) {
                                    resultExport = { type: 'Constant', value };
                                }
                            }
                        }
                        declarationFound = true;
                    }
                });
            }
        })
        return resultExport!
    }

    // 核心遍历函数
    function visit(node: ts.Node) {
        if (ts.isVariableStatement(node)) {
            // 处理 `export const/let ...`
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                node.declarationList.declarations.forEach(({ name, initializer: init }) => {
                    if (ts.isIdentifier(name)) {
                        const nameText = name.text;
                        if (init) {
                            const value = getInitializerValue(init);
                            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
                                exports.namedExports[nameText] = getFunctionInfo(init);
                            }
                            else if (value !== null) {
                                exports.namedExports[nameText] = { type: 'Constant', value };
                            } else {
                                exports.namedExports[nameText] = handleExportIdentifier(nameText);
                            }
                        }
                    }
                });
            }
        }
        // 处理 `export function ...`
        if (ts.isFunctionDeclaration(node)) {
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                if (node.name) {
                    exports.namedExports[node.name.text] = getFunctionInfo(node);
                }
            }
            // export default function () { }
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
        // `export { xxx }`
        if (ts.isExportDeclaration(node)) {
            node.exportClause?.forEachChild(child => {
                if (ts.isNamedExports(child)) {
                    child.elements.forEach(el => {
                        if (ts.isExportSpecifier(el)) {
                            exports.namedExports[el.name.text] = handleExportIdentifier(el.name.text);
                        }
                    });
                }
            })
        }
        // 处理 `export default ...`
        if (ts.isExportAssignment(node)) {
            // 处理 `export default { ... }`
            if (ts.isObjectLiteralExpression(node.expression)) {
                // 直接调用新的递归分析函数
                exports.defaultExport = analyzeObjectLiteral(node.expression);
            }
            // 处理 `export default de`
            else if (ts.isIdentifier(node.expression)) {
                const name = node.expression.text
                exports.defaultExport = { [name]: handleExportIdentifier(name) };
            }
            // 处理 `export default ''` 与 `export default()=>{ }` 
            else if (ts.isStringLiteral(node.expression) || ts.isArrowFunction(node.expression)) {
                exports.errors.push(`不支持匿名默认导出！`);
            }
        }
    }

    ts.forEachChild(sourceFile, visit);

    return exports;
}

/**
 * 生成浏览器端的 mock 代码字符串
 * @param exports 分析后的导出实体记录
 * @returns 生成的浏览器端 mock 代码字符串
 */
export function generateMockCode(preloadGlobalName: string, exportsInfo: AllExportsInfo) {

    function generate(exports: Exports = {}) {
        const mockedStr: string[] = [];
        for (const name in exports) {
            const entity = exports[name];
            let definition = '';

            if (entity === null) {
                definition = `${name}: null`;
            } else {
                if (entity.type === 'Object') {
                    definition = `${name}: { ${generate(entity.props)} }`;
                }
                if (entity.type === 'Constant') {
                    definition = `${name}: ${entity.value}`;
                }
                else if (entity.type === 'Function') {
                    const params = entity.params.join(', ');
                    const argsLog = `{ ${params} } `;
                    // 注意这里的写法，我们将函数体赋给一个带类型的 const 变量
                    definition = `${name}(${params}){
                    console.log("[Mock] Function \\"${name}\\" called with args:", ${argsLog});
                    return ${entity.mockReturnValue};
                }`;
                }
            }
            mockedStr.push(definition);
        }

        return mockedStr.join(',\n');
    }

    const defaultStr = generate(exportsInfo.defaultExport);
    const preloadStr = generate(exportsInfo.namedExports);

    return `// 这个文件仅自动生成一次！
// 请根据需要自定义 mock 实现。
import type { ExportsTypesForMock } from './preload.d';

console.log('[Mock Preload] preload.mock.ts loaded in browser.');

// --- Exports Mock ---
const mocked: ExportsTypesForMock = {
    ${defaultStr ? `
    // 自动生成的直接挂载在 window 下的实现，可在此基础上进行修改即可
    window:{
${defaultStr}
},`: ''}
    ${preloadStr ? `
    // 自动生成的直接挂载在 window 下的实现，可在此基础上进行修改即可
    ${preloadGlobalName}:{
${preloadStr}
}`: ''}
}

export default mocked;
`;
}

// ========== 核心：AST 变换函数 ==========
function transformSourceToMock(sourceCode: string, sourceFileName: string): string {
    const sourceFile = ts.createSourceFile(sourceFileName, sourceCode, ts.ScriptTarget.Latest, true);

    // 创建一个打印机，用于将新的 AST 转换回代码字符串
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

    // 1. 定义变换器工厂 (Transformer Factory)
    const transformerFactory: ts.TransformerFactory<ts.SourceFile> = (context) => {

        // 2. 返回一个 Visitor 函数，它将被应用于 AST 的每个节点
        return (sourceFile) => ts.visitEachChild(sourceFile, visit, context);

        // 3. 实现 `visit` 函数，这是变换的核心
        function visit(node: ts.Node): ts.VisitResult<ts.Node> | undefined {
            // **规则 1: 移除所有顶层 import 语句**
            if (ts.isImportDeclaration(node)) {
                return undefined; // 返回 undefined 会从 AST 中移除该节点
            }

            // **规则 2: 替换函数体**
            // a) 处理 `export function func(...) { } `
            if (ts.isFunctionDeclaration(node) && node.body) {
                return ts.factory.updateFunctionDeclaration(
                    node,
                    node.modifiers,
                    node.asteriskToken,
                    node.name,
                    node.typeParameters,
                    node.parameters, // 参数和类型完全保留
                    node.type,      // 返回类型注解完全保留
                    createMockFunctionBody(node) // <-- 只替换函数体
                );
            }

            // b) 处理 `export const myFunc = (...) => { }`
            if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
                const funcExpr = node.initializer;
                return ts.factory.updateVariableDeclaration(
                    node,
                    node.name,
                    node.exclamationToken,
                    node.type,
                    ts.isArrowFunction(funcExpr)
                        ? ts.factory.updateArrowFunction(funcExpr, funcExpr.modifiers, funcExpr.typeParameters, funcExpr.parameters, funcExpr.type, funcExpr.equalsGreaterThanToken, createMockFunctionBody(funcExpr))
                        : ts.factory.updateFunctionExpression(funcExpr, funcExpr.modifiers, funcExpr.asteriskToken, funcExpr.name, funcExpr.typeParameters, funcExpr.parameters, funcExpr.type, createMockFunctionBody(funcExpr))
                );
            }

            // 当遇到一个属性赋值，如 `dd: { ... } ` 或 `test: 'tesst'`
            if (ts.isPropertyAssignment(node)) {
                // 对它的值 (initializer) 进行递归访问，看看里面有没有需要变换的东西
                const newInitializer = ts.visitNode(node.initializer, visit);

                // 在使用 newInitializer 之前，必须进行类型检查
                if (newInitializer && ts.isExpression(newInitializer)) {
                    // 在这个 if 块内部，TypeScript 就“知道”了 newInitializer 是一个 Expression
                    return ts.factory.updatePropertyAssignment(node, node.name, newInitializer);
                }

                // 如果变换结果不是一个有效的表达式，为了安全起见，
                // 我们可以选择返回原始节点，避免破坏 AST 结构
                return node;
            }

            // c) 处理对象方法，例如 `export default { myMethod() { } }`
            if (ts.isMethodDeclaration(node) && node.body) {
                return ts.factory.updateMethodDeclaration(
                    node,
                    node.modifiers,
                    node.asteriskToken,
                    node.name,
                    node.questionToken,
                    node.typeParameters,
                    node.parameters,
                    node.type,
                    createMockFunctionBody(node)
                );
            }

            // 当遇到一个函数表达式或箭头函数（通常在 `key: () => { }` 这种形式中）
            if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.body) {
                if (ts.isBlock(node.body)) {
                    return ts.isArrowFunction(node)
                        ? ts.factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, createMockFunctionBody(node))
                        : ts.factory.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, createMockFunctionBody(node));
                }
            }

            // 对于其他所有节点，继续默认的深度遍历
            return ts.visitEachChild(node, visit, context);
        }
    };

    // 辅助函数：创建一个 mock 函数体
    function createMockFunctionBody(funcNode: ts.FunctionLikeDeclaration): ts.Block {
        const params = funcNode.parameters.map(p => p.name.getText(sourceFile));
        const logArgs = `{ ${params.join(', ')} } `;
        const funcName = (funcNode.name && ts.isIdentifier(funcNode.name)) ? funcNode.name.text : '[anonymous]';

        const consoleLogStatement = ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('console'), 'log'),
                undefined,
                [
                    ts.factory.createStringLiteral(`[Mock] Function "${funcName}" called with args: `),
                    ts.factory.createIdentifier(logArgs)
                ]
            )
        );

        const returnStatement = ts.factory.createReturnStatement(
            ts.factory.createIdentifier(getMockReturnValue(funcNode.type))
        );

        return ts.factory.createBlock([consoleLogStatement, returnStatement], true);
    }

    // 4. 应用变换 
    const transformationResult = ts.transform(sourceFile, [transformerFactory]);
    const transformedSourceFile = transformationResult.transformed[0];
    return printer.printFile(transformedSourceFile);
}


/**
 * 移除 CommonJS 导出语句
 * @param code 原始代码
 * @param fileName 文件名
 * @returns 移除 CommonJS 导出后的代码
 */
export function removeCommonJSExports1(code: string, fileName: string) {
    const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true)

    function isCJSExport(node: ts.Statement): boolean {
        // module.exports = ...
        if (
            ts.isExpressionStatement(node) &&
            ts.isBinaryExpression(node.expression) &&
            ts.isPropertyAccessExpression(node.expression.left)
        ) {
            const left = node.expression.left
            if (
                (left.expression.getText() === 'module' && left.name.getText() === 'exports') ||
                left.expression.getText() === 'exports'
            ) {
                return true
            }
        }

        // Object.defineProperty(exports, "__esModule", ...)
        if (
            ts.isExpressionStatement(node) &&
            ts.isCallExpression(node.expression) &&
            ts.isPropertyAccessExpression(node.expression.expression)
        ) {
            const call = node.expression
            const target = call.expression
            if (
                target.expression.getText() === 'Object' &&
                target.name.getText() === 'defineProperty'
            ) {
                const arg1 = call.arguments[0]
                if (arg1 && arg1.getText() === 'exports') return true
            }

            if (
                target.expression.getText() === 'Object' &&
                target.name.getText() === 'defineProperties'
            ) {
                const arg1 = call.arguments[0]
                if (arg1 && arg1.getText() === 'exports') return true
            }
        }

        return false
    }

    const filteredStatements = sourceFile.statements.filter((stmt) => !isCJSExport(stmt))

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    const newSourceFile = ts.factory.updateSourceFile(sourceFile, filteredStatements)

    return printer.printFile(newSourceFile)
}


/**
 * 清理 CommonJS 导出，转为全局对象导出
 */
export function purgePreloadbundle(code: string): string {
    const sf = ts.createSourceFile('preload.bundle.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        const { factory } = context;

        const visit: ts.Visitor = (node) => {
            // 1️⃣ 删除 Object.defineProperties(exports, {...})
            if (
                ts.isExpressionStatement(node) &&
                ts.isCallExpression(node.expression) &&
                ts.isPropertyAccessExpression(node.expression.expression) &&
                node.expression.expression.expression.getText() === 'Object' &&
                node.expression.expression.name.getText() === 'defineProperties'
            ) {
                const [target] = node.expression.arguments;
                if (target && target.getText() === 'exports') {
                    return undefined;
                }
            }

            // 2️⃣ 删除 module.exports = ...
            if (
                ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                node.expression.left.getText() === 'module.exports'
            ) {
                return undefined;
            }

            // 3️⃣ exports.default = Foo → Object.assign(window, Foo)
            if (
                ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isPropertyAccessExpression(node.expression.left)
            ) {
                const left = node.expression.left;
                if (left.expression.getText() === 'exports' && left.name.getText() === 'default') {
                    const right = node.expression.right;
                    return factory.createExpressionStatement(
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
                            undefined,
                            [factory.createIdentifier('window'), right]
                        )
                    );
                }
            }

            // 4️⃣ 删除 exports.xxx = ... （非 default）
            if (
                ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                ts.isPropertyAccessExpression(node.expression.left)
            ) {
                const left = node.expression.left;
                if (left.expression.getText() === 'exports') {
                    return undefined;
                }
            }

            return ts.visitEachChild(node, visit, context);
        };

        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            const updatedStatements = sourceFile.statements
                .map((stmt) => ts.visitNode(stmt, visit))
                .filter((stmt): stmt is ts.Statement => !!stmt); // ✅ 过滤 undefined

            return factory.updateSourceFile(sourceFile, updatedStatements);
        };
    };

    const result = ts.transform(sf, [transformer]);
    const transformed = result.transformed[0];
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const output = printer.printFile(transformed);
    result.dispose();

    return output;
}