import { readFileSync } from "node:fs";

// 所有需要挂载到`window`上的函数或其他，都需要导出使用（记住：只能在入口文件中导出！）
export const hello = () => window.utools.showNotification("你好🇨🇳！")
export const read = () => readFileSync("./plugin.json");
