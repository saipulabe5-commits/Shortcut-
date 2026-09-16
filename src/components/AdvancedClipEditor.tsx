import React, { useState, useEffect, useRef } from 'react';
import { Clip, Project, RenderJob } from '../types';
import { ArrowLeft, Scissors, Download, Loader2, Video, Type as TypeIcon, Copy, Check, AlertCircle, Sparkles } from 'lucide-react';
import { apiRequest } from '../lib/apiClient';

interface Props {
  clip: Clip;
  project: Project;
  onBack: () => void;
}

export function AdvancedClipEditor({ clip, project, onBack }: Props) {
  const [start, setStart] = useState(clip.startSeconds);
  const [end, setEnd] = useState(clip.endSeconds);
  const [subtitleText, setSubtitleText] = useState(
    clip.transcriptSegments?.map((s) => s.text).join(' ') || ''
  );
  const [framing, setFraming] = useState<'fit-blur' | 'center-crop'>('fit-blur');

  const [jobId, setJobId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedDesc, setCopiedDesc] = useState(false);

  const isMountedRef = useRef(true);

  // Poll render job status
  useEffect(() => {
    isMountedRef.current = true;
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const job = await apiRequest<RenderJob>(`/api/jobs/${jobId}`);
        if (!isMountedRef.current) return;

        setRenderStatus(job.status);

        if (job.status === 'completed' && job.outputFileName) {
          setDownloadUrl(`/api/download/${job.outputFileName}`);
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setError(job.error || 'Proses render video vertikal gagal.');
          clearInterval(interval);
        }
      } catch (e: any) {
        // Silently continue polling unless persistent
      }
    }, 2000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [jobId]);

  const maxDuration = project.durationSeconds || 7200;

  const handleRender = async () => {
    setError(null);

    // Validation
    const numStart = Number(start);
    const numEnd = Number(end);

    if (isNaN(numStart) || isNaN(numEnd)) {
      setError('Waktu mulai dan selesai harus berupa angka yang valid.');
      return;
    }
    if (numStart < 0) {
      setError('Waktu mulai tidak boleh kurang dari 0 detik.');
      return;
    }
    if (numEnd <= numStart) {
      setError('Waktu selesai harus lebih besar dari waktu mulai.');
      return;
    }
    if (numEnd > maxDuration + 1) {
      setError(`Waktu selesai (${numEnd}s) melebihi durasi video asli (${Math.floor(maxDuration)}s).`);
      return;
    }

    setJobId(null);
    setRenderStatus('queued');
    setDownloadUrl(null);

    try {
      const data = await apiRequest<{ jobId: string; status: string }>(`/api/clips/${clip.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          startSeconds: numStart,
          endSeconds: numEnd,
          framing,
          subtitleText,
        }),
      });

      if (isMountedRef.current) {
        setJobId(data.jobId);
      }
    } catch (e: any) {
      if (isMountedRef.current) {
        setError(e.message || 'Gagal memulai render video.');
        setRenderStatus(null);
      }
    }
  };

  const handleCopyMetadata = () => {
    const text = `${clip.suggestedDescription}\n\n${clip.suggestedHashtags.join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopiedDesc(true);
    setTimeout(() => setCopiedDesc(false), 2000);
  };

  const currentDuration = Math.max(0, Math.round((Number(end) - Number(start)) * 10) / 10);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-neutral-400 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Editor Klip: {clip.title}</h2>
          <p className="text-xs text-neutral-400 mt-0.5">Sesuaikan durasi pemotongan dan format rasio vertikal 9:16.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live 9:16 Frame Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <div className="w-full max-w-[280px] aspect-[9/16] bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-neutral-800 shadow-2xl">
              {/* Blurred background effect simulation */}
              <video
                src={`/api/download/${project.originalVideoPath}#t=${start},${end}`}
                className="absolute inset-0 w-full h-full object-cover opacity-40 blur-lg scale-110"
                muted
                playsInline
              />

              {/* Foreground video simulation */}
              <video
                src={`/api/download/${project.originalVideoPath}#t=${start},${end}`}
                className={`relative w-full h-full ${
                  framing === 'center-crop' ? 'object-cover' : 'object-contain'
                }`}
                controls
                playsInline
              />

              {/* Subtitle simulation overlay */}
              {subtitleText.trim() && (
                <div className="absolute bottom-8 left-2 right-2 text-center pointer-events-none px-2">
                  <span className="text-white text-xs font-bold bg-black/75 px-2.5 py-1 rounded shadow-lg backdrop-blur-xs inline-block max-w-full truncate">
                    {subtitleText}
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-neutral-500 mt-3 text-center">
              Pratinjau Aspek Rasio 9:16 (YouTube Shorts)
            </div>
          </div>
        </div>

        {/* Right Column: Controls & Render */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
            {/* Timing Adjustments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-purple-400" />
                  Penyesuaian Durasi Klip
                </h3>
                <span className="text-xs font-medium text-purple-300 bg-purple-950/60 border border-purple-800/40 px-2 py-0.5 rounded-full">
                  Durasi: {currentDuration} detik
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">Waktu Mulai (detik)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max={maxDuration}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-white text-sm focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">Waktu Selesai (detik)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max={maxDuration}
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-white text-sm focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Framing Options */}
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                Format Framing Vertikal 9:16
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFraming('fit-blur')}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    framing === 'fit-blur'
                      ? 'bg-purple-600/10 border-purple-500 text-white shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-semibold">Fit + Blur Background</div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Mempertahankan seluruh frame dengan efek blur di atas & bawah.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFraming('center-crop')}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    framing === 'center-crop'
                      ? 'bg-purple-600/10 border-purple-500 text-white shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-semibold">Center Crop</div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Memotong bagian tengah tanpa distorsi untuk tampilan penuh.
                  </div>
                </button>
              </div>
            </div>

            {/* Subtitles Input */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <TypeIcon className="w-4 h-4 text-purple-400" />
                  Teks Subtitle (Opsional)
                </h3>
                <span className="text-[11px] text-neutral-400">Burn-in FFmpeg</span>
              </div>
              <textarea
                value={subtitleText}
                onChange={(e) => setSubtitleText(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-purple-500 resize-y min-h-[80px]"
                placeholder="Tulis kalimat subtitle di sini..."
              />
            </div>

            {/* AI Shorts Recommendations (Description & Hashtags) */}
            <div className="space-y-2 pt-4 border-t border-neutral-800/60">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Rekomendasi Judul & Hashtag Shorts
                </h4>
                <button
                  onClick={handleCopyMetadata}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-950 px-2.5 py-1 rounded-md border border-neutral-800 transition-colors"
                >
                  {copiedDesc ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copiedDesc ? 'Tersalin' : 'Salin Semua'}
                </button>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3 text-xs text-neutral-300 space-y-1.5">
                <p>
                  <strong className="text-white">Deskripsi:</strong> {clip.suggestedDescription}
                </p>
                <p className="text-purple-400 font-mono text-[11px]">
                  {clip.suggestedHashtags.join(' ')}
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Render & Download Actions */}
            <div className="pt-2">
              {downloadUrl ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3.5 rounded-xl text-center text-xs font-semibold">
                    🎉 Video 9:16 berhasil dirender dan siap diunduh!
                  </div>
                  <a
                    href={downloadUrl}
                    download
                    className="w-full bg-white hover:bg-neutral-200 text-black font-semibold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-sm shadow-lg shadow-white/5"
                  >
                    <Download className="w-5 h-5 text-purple-600" />
                    Unduh File MP4 Shorts
                  </a>
                </div>
              ) : (
                <button
                  onClick={handleRender}
                  disabled={renderStatus === 'queued' || renderStatus === 'processing'}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-70 text-white font-semibold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2.5 text-sm shadow-lg shadow-purple-600/20"
                >
                  {renderStatus === 'queued' || renderStatus === 'processing' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{renderStatus === 'queued' ? 'Dalam Antrean Render...' : 'Sedang Memproses Video FFmpeg...'}</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4" />
                      <span>Render Video Vertikal MP4</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
