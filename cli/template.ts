import { mkdirSync, constants, existsSync, readdirSync, copyFile } from 'node:fs';
import { resolve } from 'node:path';

/**
* 没有指定 --dir 参数，默认创建 utools 目录
*/
export default function buildTemplates() {
  const utoolsDir = (getInput(2) === "--dir") ? resolve(process.cwd(), getInput(3)) : 'utools';

  console.log(utoolsDir)
  // const viteConfigFile = resolve(process.cwd(), 'vite.config') + resolve(process.cwd(), 'tsconfig.json') ? '.ts' : '.js'
  if (!existsSync(utoolsDir)) {
    mkdirSync(utoolsDir, { recursive: false })
    const templatesDir = resolve(__dirname, '..', 'templates')

    readdirSync(templatesDir).forEach((filename) => {
      copyFile(resolve(templatesDir, filename), resolve(utoolsDir, filename), constants.COPYFILE_EXCL, (err) => {
        if (err) throw err;
        console.log(`utools templates ${filename} created!`);
      });
    })
  } else {
    console.log(`${utoolsDir} dir in the current root directory already existed, skipped...`);
  }
}

function getInput(index = 0) {
  return process.argv.slice(index)[0]
}
