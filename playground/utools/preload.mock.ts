// 这个文件仅自动生成一次！
// 请根据需要自定义 mock 实现。
import type { ExportsTypesForMock } from './preload.d';

console.log('[Mock Preload] preload.mock.ts loaded in browser.');

// --- Exports Mock ---
const mocked: ExportsTypesForMock = {
    
    // 自动生成的直接挂载在 window 下的实现，可在此基础上进行修改即可
    window:{
dd: { aa(){
                    console.log("[Mock] Function \"aa\" called with args:", {  } );
                    return undefined;
                },
neww: null },
obj: { a: 1,
b: 2,
t(){
                    console.log("[Mock] Function \"t\" called with args:", {  } );
                    return undefined;
                } }
},
    
    // 自动生成的直接挂载在 window 下的实现，可在此基础上进行修改即可
    services:{
executeCode(code, language, _useCustomPath){
                    console.log("[Mock] Function \"executeCode\" called with args:", { code, language, _useCustomPath } );
                    return Promise.resolve();
                },
runCode(code, lang){
                    console.log("[Mock] Function \"runCode\" called with args:", { code, lang } );
                    return '';
                },
getRuntimes(){
                    console.log("[Mock] Function \"getRuntimes\" called with args:", {  } );
                    return undefined;
                },
getRuntimeConfig(){
                    console.log("[Mock] Function \"getRuntimeConfig\" called with args:", {  } );
                    return {};
                },
updateRuntimePath(lang, path){
                    console.log("[Mock] Function \"updateRuntimePath\" called with args:", { lang, path } );
                    return false;
                },
resetRuntimePath(lang){
                    console.log("[Mock] Function \"resetRuntimePath\" called with args:", { lang } );
                    return false;
                },
updateTimeouts(compileTimeout, runTimeout){
                    console.log("[Mock] Function \"updateTimeouts\" called with args:", { compileTimeout, runTimeout } );
                    return false;
                },
openInBrowser(filePath){
                    console.log("[Mock] Function \"openInBrowser\" called with args:", { filePath } );
                    return false;
                },
getOsType(){
                    console.log("[Mock] Function \"getOsType\" called with args:", {  } );
                    return '';
                },
fun(){
                    console.log("[Mock] Function \"fun\" called with args:", {  } );
                    return undefined;
                },
runc(code, lang){
                    console.log("[Mock] Function \"runc\" called with args:", { code, lang } );
                    return '';
                },
num: 412,
arr: [1, 2, 3],
tr: false
}
}

export default mocked;
