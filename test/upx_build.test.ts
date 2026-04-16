import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

import { buildUpx } from '../src/upx_handler';
import { OptionsResolver } from '../src/options';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    createReadStream: vi.fn(() => ({ on: vi.fn() })),
    createWriteStream: vi.fn(() => ({ on: vi.fn() })),
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();

  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    mkdtemp: vi.fn().mockResolvedValue('/tmp/utools-upx-123456'),
    rm: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@electron/asar', () => ({
  createPackage: vi.fn().mockResolvedValue(undefined),
}));

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

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('支持 upx: true，并默认输出到 vite 构建目录', async () => {
    const options = {
      upx: true,
    } as any;

    const inputDir = path.resolve('dist');
    await buildUpx(inputDir, options, mockLogger as any);

    const { createWriteStream } = await import('node:fs');
    expect(createWriteStream).toHaveBeenCalledWith(
      expect.stringMatching(/dist[/\\]test-plugin_1\.0\.0\.upx$/),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('build upx success'),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('在 pipeline 失败时输出错误日志', async () => {
    const options = {
      upx: {
        outDir: 'release',
        outName: '[pluginName]-[version].upx',
      },
    } as any;

    const { pipeline } = await import('node:stream/promises');
    (pipeline as any).mockRejectedValueOnce(new Error('Pipeline failed'));

    await buildUpx(path.resolve('dist'), options, mockLogger as any);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('build upx failed'),
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Pipeline failed'),
    );
  });
});
