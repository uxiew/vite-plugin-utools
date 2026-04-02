const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageSpec = process.env.UTOOLS_API_TYPES_SPEC || 'utools-api-types@latest';
let cleanupDir = null;

function resolveLocalPackageDir() {
  try {
    return path.dirname(require.resolve('utools-api-types/package.json'));
  } catch {
    for (const p of module.paths) {
      const tryPath = path.join(p, 'utools-api-types');
      if (fs.existsSync(tryPath)) {
        return tryPath;
      }
    }
  }
  return null;
}

function installTemporaryPackage(spec) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utools-api-types-'));
  cleanupDir = tempDir;
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('npm_config_') &&
        !key.startsWith('npm_package_') &&
        !key.startsWith('pnpm_'),
    ),
  );

  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ private: true, name: 'utools-api-types-fetcher' }, null, 2),
  );

  execFileSync(
    'npm',
    ['install', '--no-save', '--ignore-scripts', '--no-package-lock', spec],
    {
      cwd: tempDir,
      stdio: 'inherit',
      env: cleanEnv,
    },
  );

  const pkgDir = path.join(tempDir, 'node_modules', 'utools-api-types');
  if (!fs.existsSync(pkgDir)) {
    throw new Error(`Failed to install ${spec}`);
  }
  return pkgDir;
}

function getPackageDir() {
  return resolveLocalPackageDir() || installTemporaryPackage(packageSpec);
}

const pkgDir = getPackageDir();

try {
  const files = ['ubw.d.ts', 'electron.d.ts', 'utools.api.d.ts'];
  let content = '// Auto-generated from utools-api-types. DO NOT EDIT.\n';

  for (const file of files) {
    const filePath = path.join(pkgDir, file);
    if (!fs.existsSync(filePath)) continue;

    let fileContent = fs.readFileSync(filePath, 'utf-8');
    fileContent = fileContent.replace(/^\/\/\/ <reference path=".*"\/>\s*$/gm, '');
    fileContent = fileContent.replace(/^import type {.*} from 'sharp';\s*$/gm, '');
    fileContent = fileContent.replace(/: Sharp;/g, ": import('sharp').Sharp;");
    fileContent = fileContent.replace(/: SharpOptions/g, ": import('sharp').SharpOptions");
    fileContent = fileContent.replace(/=> Sharp;/g, "=> import('sharp').Sharp;");

    content += `\n// --- ${file} ---\n${fileContent}`;
  }

  fs.writeFileSync(path.join(root, 'utools.d.ts'), content);
  console.log('Bundled utools.d.ts successfully');

  const schemaSrc = path.join(pkgDir, 'resource/utools.schema.json');
  const schemaDest = path.join(root, 'utools.schema.json');

  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, schemaDest);
    console.log('Copied utools.schema.json');
  } else {
    console.warn('utools.schema.json not found in utools-api-types');
  }
} finally {
  if (cleanupDir) {
    fs.rmSync(cleanupDir, { recursive: true, force: true });
  }
}
