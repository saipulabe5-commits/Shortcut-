import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertCircle, Youtube, Loader2, FileVideo, Sparkles } from 'lucide-react';
import { Mode, Project } from '../types';
import { apiRequest } from '../lib/apiClient';

export default function NewProject() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [youtubeLink, setYoutubeLink] = useState('');
  const [mode, setMode] = useState<Mode>('KOMEDI');
  const [language, setLanguage] = useState('Indonesia');
  const [clipsCount, setClipsCount] = useState(3);
  const [duration, setDuration] = useState('30');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepStatus, setStepStatus] = useState<string>('');
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      if (selected.size === 0) {
        setError('File yang dipilih kosong (0 byte). Silakan pilih video yang valid.');
        return;
      }
      if (selected.size > 300 * 1024 * 1024) {
        setError('Ukuran video melebihi batas 300 MB.');
        return;
      }
      setFile(selected);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!file) {
      setError('Silakan pilih file video yang ingin dianalisis.');
      return;
    }
    if (!rightsConfirmed) {
      setError('Anda harus mengonfirmasi hak dan izin penggunaan video.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setStepStatus('Mengunggah video ke server & memeriksa metadata...');

    try {
      // 1. Upload video and create project record
      const formData = new FormData();
      formData.append('video', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('mode', mode);

      const project = await apiRequest<Project>('/api/projects', {
        method: 'POST',
        body: formData,
        timeoutMs: 120000, // 2 minutes for upload
      });

      setStepStatus('Memulai pemindaian AI & pencarian momen klip...');

      // 2. Trigger AI Analysis
      await apiRequest(`/api/projects/${project.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          clipsCount,
          duration,
        }),
      });

      // 3. Navigate to detail page
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memproses video.');
      setIsSubmitting(false);
      setStepStatus('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Proyek Baru</h2>
        <p className="text-neutral-400 text-sm">
          Unggah video sumber Anda dan biarkan AI mendeteksi momen terbaik untuk format YouTube Shorts 9:16.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-7">
        {/* Upload Dropzone */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-neutral-300">File Video Sumber</label>
          <label className="border-2 border-dashed border-neutral-700 hover:border-purple-500 transition-colors rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center cursor-pointer bg-neutral-950/60 group relative overflow-hidden">
            <div className="w-14 h-14 bg-neutral-800 group-hover:bg-purple-500/20 text-neutral-400 group-hover:text-purple-400 rounded-full flex items-center justify-center mb-3 transition-colors">
              {file ? <FileVideo className="w-7 h-7 text-purple-400" /> : <Upload className="w-6 h-6" />}
            </div>
            {file ? (
              <div className="text-center">
                <span className="text-white font-medium block truncate max-w-sm">{file.name}</span>
                <span className="text-xs text-neutral-400 mt-1 block">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB • Siap dianalisis
                </span>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-neutral-300 font-medium block">Pilih atau seret file video ke sini</span>
                <span className="text-neutral-500 text-xs mt-1 block">Format MP4, MOV, WEBM (Maks 300 MB)</span>
              </div>
            )}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
              className="hidden"
              disabled={isSubmitting}
              onChange={handleFileChange}
            />
          </label>
        </div>

        {/* Optional YouTube Reference */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-300 flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" />
            Tautan YouTube (Referensi Opsional)
          </label>
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={youtubeLink}
            disabled={isSubmitting}
            onChange={(e) => setYoutubeLink(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-neutral-600"
          />
          <p className="text-xs text-neutral-500 flex items-start gap-1.5 mt-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-neutral-400" />
            Rendering dan pemotongan klip dilakukan secara nyata menggunakan file video yang Anda unggah di atas.
          </p>
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-neutral-800">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Kategori Konten</label>
            <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setMode('KOMEDI')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                  mode === 'KOMEDI'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Komedi (Setup & Punchline)
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setMode('EDUKASI')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                  mode === 'EDUKASI'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Edukasi (Wawasan Mandiri)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Bahasa Output</label>
            <select
              value={language}
              disabled={isSubmitting}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-white text-sm focus:outline-none focus:border-purple-500 appearance-none"
            >
              <option value="Indonesia">Bahasa Indonesia</option>
              <option value="Inggris">English</option>
              <option value="Deteksi Otomatis">Deteksi Otomatis</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Jumlah Rekomendasi Klip</label>
            <select
              value={clipsCount}
              disabled={isSubmitting}
              onChange={(e) => setClipsCount(Number(e.target.value))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-white text-sm focus:outline-none focus:border-purple-500 appearance-none"
            >
              <option value={1}>1 Klip Terbaik</option>
              <option value={3}>3 Klip Terbaik</option>
              <option value={5}>5 Klip Terbaik</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Target Durasi per Klip</label>
            <select
              value={duration}
              disabled={isSubmitting}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-white text-sm focus:outline-none focus:border-purple-500 appearance-none"
            >
              {mode === 'KOMEDI' ? (
                <>
                  <option value="15">~15 Detik (Cepat & Padat)</option>
                  <option value="30">~30 Detik (Standar Shorts)</option>
                  <option value="60">~60 Detik (Dialog Penuh)</option>
                </>
              ) : (
                <>
                  <option value="30">~30 Detik (Tip Ringkas)</option>
                  <option value="60">~60 Detik (Penjelasan Lengkap)</option>
                  <option value="90">~90 Detik (Materi Mendalam)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Rights Confirmation Checkbox */}
        <div className="pt-2 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group bg-neutral-950/40 p-3.5 rounded-xl border border-neutral-800/80">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                disabled={isSubmitting}
                className="peer appearance-none w-5 h-5 border-2 border-neutral-600 rounded bg-neutral-900 checked:bg-purple-600 checked:border-purple-600 transition-colors cursor-pointer"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
              />
              <svg
                className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm text-neutral-400 group-hover:text-neutral-300 transition-colors select-none leading-snug">
              Saya mengonfirmasi bahwa saya berhak dan memiliki izin atas file video ini untuk dianalisis dan dirender.
            </span>
          </label>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 p-3.5 rounded-xl border border-red-500/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !file || !rightsConfirmed}
            className="w-full bg-white hover:bg-neutral-200 text-black font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-base shadow-lg shadow-white/5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span>{stepStatus || 'Sedang Memproses...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>Analisis Video</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
