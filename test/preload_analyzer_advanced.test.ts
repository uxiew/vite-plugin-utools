import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { analyzePreloadFile, ConstantInfo, FunctionInfo } from '../src/preload_analyzer';
import fs from 'node:fs';
import path from 'node:path';

describe('preload_analyzer advanced', () => {
    const tempDir = path.join(__dirname, 'temp_advanced');

    beforeEach(() => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should resolve imported constants', () => {
        const constsPath = path.join(tempDir, 'consts.ts');
        const mainPath = path.join(tempDir, 'index.ts');

        fs.writeFileSync(constsPath, `
            export const STR_CONST = 'hello';
            export const NUM_CONST = 123;
            export const ARR_CONST = [1, 2];
        `);

        fs.writeFileSync(mainPath, `
            import { STR_CONST, NUM_CONST, ARR_CONST } from './consts';
            
            export const myStr = STR_CONST;
            export const myNum = NUM_CONST;
            export const myArr = ARR_CONST;
        `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        expect(result.namedExports.myStr).toEqual({ type: 'Constant', value: "'hello'" });
        expect(result.namedExports.myNum).toEqual({ type: 'Constant', value: "123" });
        expect(result.namedExports.myArr).toEqual({ type: 'Constant', value: "[1, 2]" });
    });

    it('should resolve imported functions', () => {
        const funcsPath = path.join(tempDir, 'funcs.ts');
        const mainPath = path.join(tempDir, 'index.ts');

        fs.writeFileSync(funcsPath, `
            export function externalFunc(a: string) { return a; }
        `);

        fs.writeFileSync(mainPath, `
            import { externalFunc } from './funcs';
            
            export const myFunc = externalFunc;
        `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        expect(result.namedExports.myFunc).toEqual({
            type: 'Function',
            params: ['a'],
            mockReturnValue: 'undefined as any' // Default fallback
        });
    });

    it('should resolve aliased imports', () => {
        const libPath = path.join(tempDir, 'lib.ts');
        const mainPath = path.join(tempDir, 'index.ts');

        fs.writeFileSync(libPath, `
            export const ORIGINAL = 'original';
        `);

        fs.writeFileSync(mainPath, `
            import { ORIGINAL as ALIASED } from './lib';
            export const exported = ALIASED;
        `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        expect(result.namedExports.exported).toEqual({ type: 'Constant', value: "'original'" });
    });

    it('should infer return types from async modifier', () => {
        const mainPath = path.join(tempDir, 'async.ts');
        fs.writeFileSync(mainPath, `
            export async function asyncFunc() {
                return 'done';
            }
            export const asyncArrow = async () => 'done';
        `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        expect((result.namedExports.asyncFunc as FunctionInfo).mockReturnValue).toBe('Promise.resolve()');
        expect((result.namedExports.asyncArrow as FunctionInfo).mockReturnValue).toBe('Promise.resolve()');
    });



    it('should fallback to undefined as any for unknown types', () => {
        const mainPath = path.join(tempDir, 'unknown.ts');
        fs.writeFileSync(mainPath, `
            export function unknownFunc() {}
        `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        expect((result.namedExports.unknownFunc as FunctionInfo).mockReturnValue).toBe('undefined as any');
    });

    it('should handle default imports', () => {
        const libPath = path.join(tempDir, 'defaultLib.ts');
        const mainPath = path.join(tempDir, 'index.ts');

        fs.writeFileSync(libPath, `
             export default {
                 foo: 'bar'
             }
         `);

        fs.writeFileSync(mainPath, `
             import lib from './defaultLib';
             export const myLib = lib;
         `);

        const result = analyzePreloadFile(fs.readFileSync(mainPath, 'utf-8'), mainPath);

        // Current implementation for default import returns an Object type with props
        expect(result.namedExports.myLib.type).toBe('Object');
        expect((result.namedExports.myLib as any).props.foo).toEqual({ type: 'Constant', value: "'bar'" });
    });
});
