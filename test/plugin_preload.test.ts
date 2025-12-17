
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPreload } from '../src/plugin_preload';
import { OptionsResolver } from '../src/options';
import { build } from 'vite';

// Mock vite build
vi.mock('vite', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        build: vi.fn(),
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
        expect(callArgs.build.rollupOptions.external).toContain('electron');
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
