const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const nodeModulesRoots = [
  path.join(projectRoot, 'node_modules'),
  path.resolve(projectRoot, '..', 'node_modules'),
];

function findDomWebViewSwiftFiles() {
  const files = new Set();

  for (const nodeModulesRoot of nodeModulesRoots) {
    const directPath = path.join(nodeModulesRoot, '@expo', 'dom-webview', 'ios', 'DomWebView.swift');
    if (fs.existsSync(directPath)) {
      files.add(directPath);
    }

    const pnpmStorePath = path.join(nodeModulesRoot, '.pnpm');
    if (!fs.existsSync(pnpmStorePath)) {
      continue;
    }

    for (const entry of fs.readdirSync(pnpmStorePath, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('@expo+dom-webview@')) {
        continue;
      }

      const candidatePath = path.join(
        pnpmStorePath,
        entry.name,
        'node_modules',
        '@expo',
        'dom-webview',
        'ios',
        'DomWebView.swift'
      );

      if (fs.existsSync(candidatePath)) {
        files.add(candidatePath);
      }
    }
  }

  return [...files];
}

function patchSwiftFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');

  if (!original.includes('RCTConvert') || /\bimport React\b/.test(original)) {
    return false;
  }

  if (original.includes('import ExpoModulesCore')) {
    fs.writeFileSync(
      filePath,
      original.replace('import ExpoModulesCore', 'internal import React\nimport ExpoModulesCore')
    );
    return true;
  }

  fs.writeFileSync(filePath, `internal import React\n${original}`);
  return true;
}

for (const filePath of findDomWebViewSwiftFiles()) {
  patchSwiftFile(filePath);
}
