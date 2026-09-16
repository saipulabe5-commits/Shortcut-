# ShortCut AI

Aplikasi cerdas untuk mengubah video panjang (podcast, talkshow, materi edukasi, komedi) menjadi klip vertikal berformat 9:16 yang dioptimalkan untuk YouTube Shorts menggunakan AI multimodal Gemini dan FFmpeg.

---

## ✨ Fitur Utama

1. **Analisis AI Multimodal (Google Gemini)**:
   - Mendeteksi momen sorotan terbaik (*opening hook*, *setup*, *punchline / payoff*).
   - Mendukung mode **KOMEDI** (setup & punchline) dan **EDUKASI** (wawasan mandiri).
   - Memberikan rekomendasi judul, deskripsi, dan tagar YouTube Shorts.

2. **Editor & Penyesuaian Klip**:
   - Pengaturan durasi awal & akhir yang presisi.
   - Pilihan framing vertikal 9:16 (*Fit + Blur Background* atau *Center Crop*).
   - Dukungan *burn-in* teks subtitle langsung ke video.

3. **Rendering Nyata dengan FFmpeg**:
   - Pemotongan dan konversi video ke resolusi 1080x1920 (9:16) secara lokal dan dapat langsung diunduh.

4. **Unduh Source Code JSON & Rekonstruksi**:
   - Ekspor seluruh kode sumber aplikasi asli yang tersedia ke dalam satu file JSON terstruktur.
   - Dilengkapi script rekonstruksi untuk memulihkan seluruh struktur folder dan file proyek dengan verifikasi checksum SHA-256.

---

## 🛠️ Persyaratan Sistem

- **Node.js**: v18+ atau v20+
- **NPM** atau **Bun**
- **FFmpeg & FFprobe**: Terintegrasi otomatis melalui `@ffmpeg-installer/ffmpeg` dan `@ffprobe-installer/ffprobe`
- **Gemini API Key**: Diperlukan untuk fitur analisis video AI

---

## 🚀 Panduan Memulai Cepat

1. **Pasang Dependensi**:
   ```bash
   npm install
   ```

2. **Konfigurasi Environment**:
   Salin `.env.example` menjadi `.env` lalu masukkan API Key Gemini Anda:
   ```bash
   cp .env.example .env
   ```
   Isi file `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Jalankan Aplikasi dalam Mode Pengembangan**:
   ```bash
   npm run dev
   ```
   Buka browser di `http://localhost:3000`.

---

## 📦 Ekspor & Rekonstruksi Source Code

### 1. Ekspor Source Code via CLI:
```bash
npm run export:source
```
Perintah ini akan membuat file JSON bernama `shortcut-ai-source-YYYYMMDD-HHmmss.json`.

### 2. Ekspor Source Code via UI Web:
Klik tombol **"Unduh Source Code JSON"** pada navigasi atas atau menu pengaturan di web app.

### 3. Rekonstruksi Folder Proyek dari JSON:
```bash
node scripts/reconstruct.mjs <file-ekspor.json> [folder-tujuan]
```
Contoh:
```bash
node scripts/reconstruct.mjs shortcut-ai-source-20260915-120000.json ./proyek-shortcut-ai
```

---

## 🔒 Keamanan & Privasi Ekspor

File ekspor JSON **hanya menyertakan kode sumber asli aplikasi** dan secara ketat mengecualikan:
- File kredensial dan environment nyata (`.env`, `.env.local`, API keys, private keys)
- File media video unggahan dan hasil render (`uploads/`)
- Database runtime dan data proyek tersimpan (`data/db.json`)
- Folder `node_modules`, `.git`, `dist`, dan file sementara/log
