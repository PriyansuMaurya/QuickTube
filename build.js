const fs = require('fs');
const path = require('path');

const target = process.env.TARGET_BROWSER;
if (!target || !['chrome', 'edge'].includes(target)) {
  throw new Error('TARGET_BROWSER must be set to chrome or edge');
}

const rootDir = process.cwd();
const distRoot = path.join(rootDir, 'dist');
const buildDir = path.join(distRoot, target);
const sourceManifest = path.join(rootDir, `manifest.${target}.json`);

if (!fs.existsSync(sourceManifest)) {
  throw new Error(`Missing manifest file: ${sourceManifest}`);
}

fs.mkdirSync(distRoot, { recursive: true });
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

const copyEntries = [
  'popup.html',
  'popup.js',
  'styles.css',
  'icon16.png',
  'icon48.png',
  'icon128.png',
  '_locales'
];

for (const entry of copyEntries) {
  const srcPath = path.join(rootDir, entry);
  const destPath = path.join(buildDir, entry);
  if (fs.existsSync(srcPath)) {
    if (fs.statSync(srcPath).isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const manifestSource = fs.readFileSync(sourceManifest, 'utf8');
fs.writeFileSync(path.join(buildDir, 'manifest.json'), manifestSource);

const popupPath = path.join(buildDir, 'popup.js');
let popupSource = fs.readFileSync(popupPath, 'utf8');
popupSource = popupSource.replace(/__TARGET_BROWSER__/g, target);
popupSource = popupSource.replace(/__STORAGE_PREFIX__/g, `${target}_`);
fs.writeFileSync(popupPath, popupSource);

console.log(`Built ${target} extension into ${buildDir}`);
