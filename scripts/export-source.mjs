#!/usr/bin/env node

/**
 * ShortCut AI - Source Code Export CLI
 * 
 * Usage:
 *   node scripts/export-source.mjs [output-file.json]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'uploads',
  'data',
  'dist',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.next',
  'coverage',
]);

const EXCLUDED_FILE_PATTERNS = [
  /^\.env(\..+)?$/,
  /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv)$/i,
  /\.(sqlite|sqlite3|db|db\.json)$/i,
  /\.(log|tmp|swp)$/i,
  /\.(pem|key|pfx|p12)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^service[-_]?account.*\.json$/i,
  /^shortcut-ai-source-.*\.json$/i,
  /^\.DS_Store$/i,
  /^Thumbs\.db$/i,
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.wav',
]);

const SECRET_PATTERNS = [
  /AIzaSy[0-9A-Za-z-_]{33}/,
  /sk-[0-9A-Za-z]{32,}/,
  /ghp_[0-9A-Za-z]{36}/,
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
];

function isBinaryFile(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  const checkLength = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function shouldExcludeFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const fileName = path.basename(normalized);

  if (fileName === '.env.example') {
    return false;
  }

  for (const pattern of EXCLUDED_FILE_PATTERNS) {
    if (pattern.test(fileName)) return true;
  }

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (EXCLUDED_DIRS.has(seg)) return true;
  }

  return false;
}

function scanDirectory(rootDir, currentDir, fileList = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    try {
      const realPath = fs.realpathSync(fullPath);
      if (!realPath.startsWith(rootDir)) continue;
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || shouldExcludeFile(relPath)) continue;
      scanDirectory(rootDir, fullPath, fileList);
    } else if (entry.isFile()) {
      if (!shouldExcludeFile(relPath)) {
        fileList.push(relPath);
      }
    }
  }

  return fileList;
}

function main() {
  const rootDir = process.cwd();
  console.log(`\n📦 Memindai source code proyek dari: ${rootDir}`);

  const relativeFiles = scanDirectory(rootDir, rootDir, []);
  let appVersion = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    if (pkg.version) appVersion = pkg.version;
  } catch {}

  const exportFiles = [];
  let totalBytes = 0;
  let partialScope = false;

  for (const relPath of relativeFiles) {
    const fullPath = path.join(rootDir, relPath);
    const buffer = fs.readFileSync(fullPath);
    const isBin = isBinaryFile(relPath, buffer);

    let content;
    let encoding;

    if (isBin) {
      encoding = 'base64';
      content = buffer.toString('base64');
    } else {
      encoding = 'utf-8';
      content = buffer.toString('utf-8');

      if (relPath !== '.env.example') {
        let hasSecret = false;
        for (const secPattern of SECRET_PATTERNS) {
          if (secPattern.test(content)) {
            hasSecret = true;
            break;
          }
        }
        if (hasSecret) {
          console.warn(`⚠️ File ${relPath} mengandung pola rahasia dan dikecualikan dari ekspor.`);
          partialScope = true;
          continue;
        }
      }
    }

    const sizeBytes = buffer.length;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    totalBytes += sizeBytes;

    exportFiles.push({
      path: relPath,
      encoding,
      content,
      sizeBytes,
      sha256,
    });
  }

  exportFiles.sort((a, b) => a.path.localeCompare(b.path));

  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const defaultFileName = `shortcut-ai-source-${dateStr}.json`;
  const outputFileName = process.argv[2] || defaultFileName;
  const outputPath = path.resolve(outputFileName);

  const bundle = {
    schemaVersion: '1.0.0',
    appName: 'ShortCut AI',
    appVersion,
    exportedAt: now.toISOString(),
    exportScope: partialScope ? 'partial_source_tree' : 'complete_source_tree',
    fileCount: exportFiles.length,
    totalBytes,
    excludedCategories: [
      'secrets_and_env',
      'node_modules',
      'git_metadata',
      'user_uploads_and_media',
      'database_and_runtime_state',
      'build_artifacts',
      'previous_export_bundles',
    ],
    files: exportFiles,
  };

  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2), 'utf-8');

  console.log(`✅ Ekspor berhasil dibuat: ${outputPath}`);
  console.log(`📄 Total file disertakan: ${exportFiles.length}`);
  console.log(`💾 Ukuran source code mentah: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`\nUntuk merekonstruksi proyek di komputer lain, jalankan:`);
  console.log(`  node scripts/reconstruct.mjs ${outputFileName} ./proyek-baru\n`);
}

main();
