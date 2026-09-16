#!/usr/bin/env node

/**
 * ShortCut AI - Source Code Reconstruction Script
 * 
 * Usage:
 *   node scripts/reconstruct.mjs <path-to-json> [destination-directory] [--force]
 * 
 * Example:
 *   node scripts/reconstruct.mjs ./shortcut-ai-source-20260915-120000.json ./my-shortcut-ai
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_ALLOWED_FILES = 10000;
const MAX_ALLOWED_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB limit

function printUsage() {
  console.log(`
ShortCut AI - Source Code Reconstructor
=======================================
Mengubah file paket ekspor JSON kembali menjadi struktur folder proyek asli.

Penggunaan:
  node scripts/reconstruct.mjs <file-ekspor.json> [direktori-tujuan] [--force]

Pilihan:
  --force   Menimpa file yang sudah ada di direktori tujuan jika ditemukan konflik.

Contoh:
  node scripts/reconstruct.mjs shortcut-ai-source-20260915.json ./proyek-shortcut-ai
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const force = args.includes('--force');
  const positionalArgs = args.filter((a) => !a.startsWith('--'));

  const jsonFilePath = positionalArgs[0];
  const targetDirName = positionalArgs[1] || './shortcut-ai-reconstructed';

  if (!jsonFilePath) {
    console.error('❌ Kesalahan: Silakan tentukan file JSON yang akan direkonstruksi.');
    process.exit(1);
  }

  const resolvedJsonPath = path.resolve(jsonFilePath);
  if (!fs.existsSync(resolvedJsonPath)) {
    console.error(`❌ Kesalahan: File '${jsonFilePath}' tidak ditemukan.`);
    process.exit(1);
  }

  console.log(`\n🔍 Membaca dan memvalidasi paket ekspor JSON: ${resolvedJsonPath}`);

  let rawJson = '';
  try {
    rawJson = fs.readFileSync(resolvedJsonPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Gagal membaca file: ${err.message}`);
    process.exit(1);
  }

  let bundle;
  try {
    bundle = JSON.parse(rawJson);
  } catch (err) {
    console.error(`❌ File bukan JSON yang valid: ${err.message}`);
    process.exit(1);
  }

  // 1. Validate bundle structure & schemaVersion
  if (!bundle || typeof bundle !== 'object') {
    console.error('❌ Struktur bundle tidak valid (bukan JSON object).');
    process.exit(1);
  }

  if (!bundle.schemaVersion || !bundle.schemaVersion.startsWith('1.')) {
    console.error(`❌ schemaVersion tidak didukung atau tidak valid: ${bundle.schemaVersion}`);
    process.exit(1);
  }

  if (!Array.isArray(bundle.files)) {
    console.error('❌ Properti "files" tidak ditemukan atau bukan array.');
    process.exit(1);
  }

  if (bundle.files.length > MAX_ALLOWED_FILES) {
    console.error(`❌ Jumlah file melebihi batas aman (${bundle.files.length} > ${MAX_ALLOWED_FILES}).`);
    process.exit(1);
  }

  console.log(`📦 Aplikasi: ${bundle.appName || 'ShortCut AI'} (v${bundle.appVersion || '1.0.0'})`);
  console.log(`📅 Diekspor pada: ${bundle.exportedAt || 'Tidak diketahui'}`);
  console.log(`📑 Jumlah file terdaftar: ${bundle.files.length}`);
  console.log(`📊 Ukuran total yang tercatat: ${(bundle.totalBytes / 1024).toFixed(1)} KB`);

  // 2. Validate destination directory
  const targetDir = path.resolve(targetDirName);
  console.log(`📂 Direktori tujuan: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const seenPaths = new Set();
  let calculatedTotalBytes = 0;

  // 3. Pre-flight security & integrity check on all files
  console.log('\n🔒 Melakukan pemeriksaan keamanan path dan verifikasi integritas checksum SHA-256...');

  for (let i = 0; i < bundle.files.length; i++) {
    const file = bundle.files[i];

    if (!file || typeof file !== 'object') {
      console.error(`❌ File entri #${i} tidak valid.`);
      process.exit(1);
    }

    const { path: relPath, encoding, content, sha256 } = file;

    if (!relPath || typeof relPath !== 'string') {
      console.error(`❌ File #${i} tidak memiliki properti path yang valid.`);
      process.exit(1);
    }

    // Path traversal check
    if (
      relPath.startsWith('/') ||
      relPath.startsWith('\\') ||
      /^[a-zA-Z]:/.test(relPath) ||
      relPath.includes('..') ||
      relPath.includes('\0')
    ) {
      console.error(`❌ Path berbahaya terdeteksi: "${relPath}". Rekonstruksi dibatalkan.`);
      process.exit(1);
    }

    const normalizedRelPath = path.normalize(relPath).replace(/\\/g, '/');
    if (normalizedRelPath.startsWith('../') || normalizedRelPath === '..') {
      console.error(`❌ Path traversal terdeteksi: "${relPath}". Rekonstruksi dibatalkan.`);
      process.exit(1);
    }

    if (seenPaths.has(normalizedRelPath)) {
      console.error(`❌ Duplikasi path terdeteksi: "${normalizedRelPath}".`);
      process.exit(1);
    }
    seenPaths.add(normalizedRelPath);

    const destPath = path.resolve(targetDir, normalizedRelPath);
    if (!destPath.startsWith(targetDir)) {
      console.error(`❌ Path keluar dari direktori tujuan: "${normalizedRelPath}".`);
      process.exit(1);
    }

    // Check decoding & checksum
    let buffer;
    if (encoding === 'base64') {
      buffer = Buffer.from(content || '', 'base64');
    } else if (encoding === 'utf-8' || !encoding) {
      buffer = Buffer.from(content || '', 'utf-8');
    } else {
      console.error(`❌ Encoding tidak didukung "${encoding}" pada file ${relPath}.`);
      process.exit(1);
    }

    calculatedTotalBytes += buffer.length;
    if (calculatedTotalBytes > MAX_ALLOWED_TOTAL_BYTES) {
      console.error(`❌ Ukuran kumulatif file melebihi batas aman (${calculatedTotalBytes} bytes).`);
      process.exit(1);
    }

    // Compute checksum
    const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (sha256 && computedHash.toLowerCase() !== sha256.toLowerCase()) {
      console.error(`❌ Integritas rusak (Checksum Mismatch) pada file: ${relPath}`);
      console.error(`   Ekspektasi: ${sha256}`);
      console.error(`   Dihitung:   ${computedHash}`);
      process.exit(1);
    }

    // Check conflict with existing files
    if (fs.existsSync(destPath) && !force) {
      console.error(`❌ File tujuan sudah ada: "${destPath}". Gunakan flag --force untuk menimpa.`);
      process.exit(1);
    }
  }

  console.log('✅ Seluruh file lolos verifikasi keamanan & integritas checksum SHA-256.');

  // 4. Write files
  console.log(`\n⚙️ Menulis ${bundle.files.length} file ke direktori tujuan...`);

  let writtenCount = 0;
  for (const file of bundle.files) {
    const normalizedRelPath = path.normalize(file.path).replace(/\\/g, '/');
    const destPath = path.resolve(targetDir, normalizedRelPath);
    const parentDir = path.dirname(destPath);

    // Ensure parent dir exists and is not a symlink
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    } else {
      const parentLstat = fs.lstatSync(parentDir);
      if (parentLstat.isSymbolicLink()) {
        console.error(`❌ Direktori induk "${parentDir}" adalah symlink. Menolak penulisan.`);
        process.exit(1);
      }
    }

    let buffer;
    if (file.encoding === 'base64') {
      buffer = Buffer.from(file.content, 'base64');
    } else {
      buffer = Buffer.from(file.content, 'utf-8');
    }

    fs.writeFileSync(destPath, buffer);
    writtenCount++;
  }

  console.log(`\n🎉 Rekonstruksi selesai!`);
  console.log(`📁 Lokasi proyek: ${targetDir}`);
  console.log(`📄 Total file berhasil ditulis: ${writtenCount}`);
  console.log(`💾 Total byte: ${(calculatedTotalBytes / 1024).toFixed(1)} KB`);

  console.log(`
====================================================================
⚠️  PANDUAN LANGKAH SELANJUTNYA (PENTING):
====================================================================
1. Tinjau kode sumber di dalam folder proyek sebelum menjalankan.
2. Masuk ke direktori proyek:
   cd ${targetDirName}
3. Buat file .env dari template:
   cp .env.example .env
4. Masukkan API Key Gemini Anda pada file .env:
   GEMINI_API_KEY="kunci_api_anda_di_sini"
5. Pasang dependensi proyek secara manual:
   npm install
6. Jalankan server pengembangan:
   npm run dev
====================================================================
`);
}

main().catch((err) => {
  console.error('Terjadi kesalahan tidak terduga:', err);
  process.exit(1);
});
