import { Plugin } from 'vite';

import { type Options, OptionsResolver } from './options';
import { buildPlugin, devPlugin } from './plugins';
import { preloadMockPlugin } from './plugin_mock';

export default (options: Options): Plugin[] => {
  const { resolvedOptions } = new OptionsResolver(options);
  return [
    preloadMockPlugin(resolvedOptions),
    devPlugin(resolvedOptions),
    buildPlugin(resolvedOptions),
  ];
};

// Export types for TypeScript users
export type { Options } from './options';

// Export analyzer functions for testing and external use
export { analyzePreloadFile } from './preload_analyzer';