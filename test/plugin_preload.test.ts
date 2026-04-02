
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPreload } from '../src/plugin_preload';
import { OptionsResolver } from '../src/options';
import { build } from 'vite';

// Mock vite build
vi.mock('vite', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        build: vi.fn().mockResolvedValue({}),
    };
});

describe('plugin_preload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const path = require('path');
        OptionsResolver.upxData = {
            preload: path.resolve('test/preload.ts'),
            logo: 'test/logo.png',
            pluginName: 'test-plugin',
            main: 'test/index.js',
            version: '1.0.0'
        } as any;
    });

    it('buildPreload should call vite build with correct config', async () => {
        const options = {
            preload: {
                watch: false,
                name: 'preload',
                minify: false
            },
            external: ['electron']
        } as any;

        await buildPreload(options);

        expect(build).toHaveBeenCalled();
        const callArgs = (build as any).mock.calls[0][0];

        expect(callArgs.mode).toBe('utools-preload'); // UTOOLS_PRELOAD is 'utools-preload'
        expect(callArgs.build.lib.entry).toBe(require('path').resolve('test/preload.ts'));
        expect(callArgs.build.lib.fileName).toBe('preload');
        // console.log('DEBUG External:', callArgs.build.rollupOptions.external);
        // expect(callArgs.build.rollupOptions.external).toContain('electron');
        // The external option is a function, not an array. We should assert it is a function.
        expect(typeof callArgs.build.rollupOptions.external).toBe('function');
        // And maybe test the function logic
        const extFn = callArgs.build.rollupOptions.external;
        expect(extFn('electron')).toBe(true);
        expect(extFn('fs')).toBe(true); // NodeBuiltin
        expect(extFn('original-fs')).toBe(true);
        expect(extFn('other')).toBe(false);
        expect(callArgs.build.rollupOptions.output.format).toBe('cjs');

        // Verify manualChunks
        const manualChunks = callArgs.build.rollupOptions.output.manualChunks;
        expect(manualChunks).toBeDefined();

        const path = require('path');
        const entryPath = path.resolve('test/preload.ts');

        const result = manualChunks(entryPath);
        expect(result).toBeUndefined();
    });
});
