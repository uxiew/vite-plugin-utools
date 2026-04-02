
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let pkgDir;
try {
    pkgDir = path.dirname(require.resolve('utools-api-types/package.json'));
} catch {
    for (const p of module.paths) {
        const tryPath = path.join(p, 'utools-api-types');
        if (fs.existsSync(tryPath)) {
            pkgDir = tryPath;
            break;
        }
    }
}

if (!pkgDir) {
    console.error('Could not find utools-api-types package');
    process.exit(1);
}

// 1. Bundle Types
const files = [
    'ubw.d.ts',
    'electron.d.ts',
    'utools.api.d.ts'
];

let content = '// Auto-generated from utools-api-types. DO NOT EDIT.\n';

for (const file of files) {
    const filePath = path.join(pkgDir, file);
    if (fs.existsSync(filePath)) {
        let fileContent = fs.readFileSync(filePath, 'utf-8');

        // Remove reference tags
        fileContent = fileContent.replace(/^\/\/\/ <reference path=".*"\/>\s*$/gm, '');

        // Remove sharp import
        // Note: This forces the file to be treated as a global script (if no other imports exist)
        fileContent = fileContent.replace(/^import type {.*} from 'sharp';\s*$/gm, '');

        // Replace Sharp types with import('sharp').Type
        fileContent = fileContent.replace(/: Sharp;/g, ": import('sharp').Sharp;");
        fileContent = fileContent.replace(/: SharpOptions/g, ": import('sharp').SharpOptions");
        fileContent = fileContent.replace(/=> Sharp;/g, "=> import('sharp').Sharp;");

        content += `\n// --- ${file} ---\n` + fileContent;
    }
}

fs.writeFileSync(path.join(root, 'utools.d.ts'), content);
console.log('Bundled utools.d.ts successfully');

// 2. Copy Schema
const schemaSrc = path.join(pkgDir, 'resource/utools.schema.json');
const schemaDest = path.join(root, 'utools.schema.json');

if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, schemaDest);
    console.log('Copied utools.schema.json');
} else {
    console.warn('utools.schema.json not found in utools-api-types');
}
