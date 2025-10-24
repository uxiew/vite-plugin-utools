import { Plugin } from 'vite';

import { OptionsResolver } from './options';
import { buildPlugin, buildUpxsPlugin, devPlugin } from './plugins';
import { preloadMockPlugin } from './preload_mock';
import type { Options } from './options';

export const viteUtoolsPlugin = (options: Options): Plugin[] => {
  const { resolvedOptions } = new OptionsResolver(options);
  return [
    preloadMockPlugin(resolvedOptions),
    devPlugin(resolvedOptions),
    buildPlugin(resolvedOptions),
    buildUpxsPlugin(resolvedOptions),
  ];
};

export default viteUtoolsPlugin;

// Export types for TypeScript users
export type { Options, MockOptions, PreloadOptions, UpxsOptions } from './options';

// Export Mock configuration types and manager
export type {
  MockConfig,
  MockDataConfig,
  UtoolsApiMockConfig,
  PreloadApiMockConfig
} from './mockConfigManager';
export {
  MockConfigManager,
  createMockConfigManager,
  getMockConfig
} from './mockConfigManager';

// Export analyzer functions for testing and external use
export { analyzePreloadFile } from './preload_analyzer';

// Export complete uTools API Mock implementation
export {
  MockUToolsApi,
  MockDisplay,
  MockDbStorage,
  MockDatabase,
  MockUBrowser
} from './utoolsApiMockImpl';

export {
  defineMockConfig,
  definePreloadMocks,
  defineUtoolsMocks,
  applyMockOverrides
} from './mockHelpers';

export type { MockManifest, PreloadSignature } from './types';