
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildUpx } from '../src/upx_handler';
import { OptionsResolver } from '../src/options';
import fs from 'node:fs';
import path from 'node:path';

// Mock fs and fs/promises
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createReadStream: vi.fn(),
        createWriteStream: vi.fn(),
    };
});

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        mkdir: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
    };
});

// Mock @electron/asar
vi.mock('@electron/asar', () => ({
    createPackage: vi.fn().mockResolvedValue(undefined),
}));

// Mock stream/promises
vi.mock('node:stream/promises', () => ({
    pipeline: vi.fn().mockResolvedValue(undefined),
}));

describe('upx_handler', () => {
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        warnOnce: vi.fn(),
        hasWarned: false,
        clearScreen: vi.fn(),
        hasErrorLogged: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        OptionsResolver.upxData = {
            pluginName: 'test-plugin',
            version: '1.0.0',
            logo: 'logo.png',
            preload: 'preload.js',
            main: 'index.html',
        } as any;
    });

    it('buildUpx should complete successfully', async () => {
        const options = {
            upx: {
                outDir: 'dist',
                outName: '[pluginName]-[version].upx',
            },
            preload: {},
        } as any;

        await buildUpx('dist', options, mockLogger as any);

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('build upx success'));
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('buildUpx should handle errors gracefully', async () => {
        const options = {
            upx: {
                outDir: 'dist',
                outName: '[pluginName]-[version].upx',
            },
            preload: {},
        } as any;

        // Simulate an error in pipeline
        // Simulate an error in pipeline
        const { pipeline } = await import('node:stream/promises');
        (pipeline as any).mockRejectedValueOnce(new Error('Pipeline failed'));

        await buildUpx('dist', options, mockLogger as any);

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('build upx failed'));
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Pipeline failed'));
    });
});
