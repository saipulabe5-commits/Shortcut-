import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  Download, 
  ShieldCheck, 
  Copy, 
  Check, 
  X, 
  AlertTriangle, 
  Loader2, 
  Terminal, 
  FolderArchive,
  CheckCircle2
} from 'lucide-react';
import { fetchSourceCodeInfo, downloadSourceCodeJson, SourceCodeMetaInfo, ApiError } from '../lib/apiClient';

interface SourceCodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SourceCodeExportModal({ isOpen, onClose }: SourceCodeExportModalProps) {
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [metaInfo, setMetaInfo] = useState<SourceCodeMetaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<{ fileName: string; byteSize: number } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setDownloadSuccess(null);
      setLoadingMeta(true);
      fetchSourceCodeInfo()
        .then((data) => {
          setMetaInfo(data);
          setLoadingMeta(false);
        })
        .catch((err) => {
          setLoadingMeta(false);
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Gagal memuat metadata source code.');
          }
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);

    try {
      const res = await downloadSourceCodeJson();
      setDownloadSuccess(res);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Terjadi kendala saat mengunduh file paket JSON.');
      }
    } finally {
      setDownloading(false);
    }
  };

  const copyCommand = () => {
    const cmd = `node scripts/reconstruct.mjs shortcut-ai-source-code.json ./proyek-shortcut-ai`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  return (
    <div 
      id="source-code-export-modal" 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="export-modal-title" className="text-lg font-bold text-white">
                Unduh Source Code JSON
              </h2>
              <p className="text-xs text-neutral-400">
                Ekspor kode sumber asli aplikasi terstruktur dalam format JSON
              </p>
            </div>
          </div>
          <button 
            id="btn-close-export-modal"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl flex items-start gap-3 text-red-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold">Gagal Menyiapkan Ekspor</div>
                <div className="text-red-300/90 text-xs mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {downloadSuccess && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3 text-emerald-200 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold">Source Code Berhasil Diunduh!</div>
                <div className="text-emerald-300/90 text-xs mt-0.5">
                  File <span className="font-mono text-white">{downloadSuccess.fileName}</span> ({(downloadSuccess.byteSize / 1024).toFixed(1)} KB) tersimpan di perangkat Anda.
                </div>
              </div>
            </div>
          )}

          {/* Security & Scope Guarantee */}
          <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Jaminan Keamanan & Privasi
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Paket ini hanya memuat berkas kode sumber yang diperlukan untuk membangun dan menjalankan aplikasi ShortCut AI.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800/60">
                <span className="text-emerald-400 font-semibold">✓ Disertakan:</span>
                <ul className="text-neutral-400 mt-1 space-y-0.5 pl-3 list-disc">
                  <li>Komponen UI React & Styling Tailwind</li>
                  <li>Server Express & FFmpeg Worker</li>
                  <li>Skrip Rekonstruksi & Dokumentasi</li>
                  <li>Konfigurasi Build (Vite, TS, Metadata)</li>
                </ul>
              </div>
              <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800/60">
                <span className="text-red-400 font-semibold">✗ Otomatis Dikecualikan:</span>
                <ul className="text-neutral-400 mt-1 space-y-0.5 pl-3 list-disc">
                  <li>Kunci Rahasia & File .env</li>
                  <li>Folder node_modules & .git</li>
                  <li>Database data/db.json</li>
                  <li>Video unggahan & hasil render</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Metadata Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-neutral-950/40 border border-neutral-800 p-3 rounded-xl">
              <div className="text-xs text-neutral-400">Total File Sumber</div>
              <div className="text-lg font-bold text-white mt-1">
                {loadingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-500 inline" />
                ) : (
                  metaInfo?.fileCount || '-'
                )}
              </div>
            </div>
            <div className="bg-neutral-950/40 border border-neutral-800 p-3 rounded-xl">
              <div className="text-xs text-neutral-400">Ukuran Kode Mentah</div>
              <div className="text-lg font-bold text-white mt-1">
                {loadingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-500 inline" />
                ) : metaInfo ? (
                  `${(metaInfo.totalBytes / 1024).toFixed(1)} KB`
                ) : (
                  '-'
                )}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-neutral-950/40 border border-neutral-800 p-3 rounded-xl">
              <div className="text-xs text-neutral-400">Verifikasi Integritas</div>
              <div className="text-sm font-semibold text-emerald-400 mt-1.5 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> SHA-256
              </div>
            </div>
          </div>

          {/* Reconstruction Command Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                Perintah Rekonstruksi Proyek:
              </span>
              <button
                id="btn-copy-reconstruct-cmd"
                onClick={copyCommand}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                {copiedCmd ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Perintah</span>
                  </>
                )}
              </button>
            </div>
            <div className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl font-mono text-xs text-neutral-300 overflow-x-auto select-all">
              node scripts/reconstruct.mjs shortcut-ai-source-code.json ./proyek-shortcut-ai
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-between gap-3">
          <button
            id="btn-modal-cancel"
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-neutral-800 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
          >
            Tutup
          </button>

          <button
            id="btn-modal-download-source-json"
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyiapkan Source Code...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Unduh Source Code JSON</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
