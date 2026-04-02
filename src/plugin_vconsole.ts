import { Plugin } from 'vite';
import { RequiredOptions } from './options';

export const vConsolePlugin = (options: RequiredOptions): Plugin => {
  return {
    name: '@ver5/utools-vconsole',
    transformIndexHtml(html) {
      if (options.vconsole) {
        const defaultSrc = 'https://lib.baomitu.com/vConsole/vconsole.min.js';
        const src =
          typeof options.vconsole === 'string' ? options.vconsole : defaultSrc;
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { src },
              injectTo: 'head',
            },
            {
              tag: 'script',
              children: `
                var vConsole = new VConsole();
                (function(){
                  var q=window.__UTOOLS_LOG_QUEUE__||[];
                  q.forEach(function(i){console[i.t]&&console[i.t].apply(console,i.a)});
                  window.__UTOOLS_LOG_QUEUE__=[];
                  window.__UTOOLS_VCONSOLE_READY__=true;
                })();
                            `,
              injectTo: 'body',
            },
          ],
        };
      }
      return html;
    },
  };
};
