import { readFile } from "node:fs/promises";
import { extractAll } from "@electron/asar";

export { SCRIPTS } from './test'

// 所有需要挂载到`window`上的函数或其他，都需要导出使用（记住：只能在入口文件中导出！）
export const hello = () => window.utools.showNotification("你好🇨🇳！")
export const read = () => readFile("./plugin.json");
export const read1 = () => console.log("./plugin.json");

export default {
    extractAll,
    toast() { console.log(`test-toast`) },
    case() { console.log(`test-toast`) }
}