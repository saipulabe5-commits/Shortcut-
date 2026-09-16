import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Project, Clip } from '../types';
import { Loader2, ArrowLeft, Scissors, AlertCircle, RotateCcw, Sparkles, Clock } from 'lucide-react';
import { AdvancedClipEditor } from '../components/AdvancedClipEditor';
import { apiRequest } from '../lib/apiClient';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchProject();

    const interval = setInterval(() => {
      // Only poll while status is pending (uploaded or analyzing)
      if (project?.status === 'analyzing' || project?.status === 'uploaded') {
        fetchProject(false);
      }
    }, 3000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [id, project?.status]);

  const fetchProject = async (showSpinner = true) => {
    if (!id) return;
    if (showSpinner && !project) setLoadingInitial(true);
    try {
      setPageError(null);
      const data = await apiRequest<Project>(`/api/projects/${id}`);
      if (isMountedRef.current) {
        setProject(data);
      }
    } catch (e: any) {
      if (isMountedRef.current) {
        setPageError(e.message || 'Gagal memuat detail proyek.');
      }
    } finally {
      if (isMountedRef.current && showSpinner) {
        setLoadingInitial(false);
      }
    }
  };

  const handleRetryAnalysis = async () => {
    if (!project || isRetrying) return;
    setIsRetrying(true);
    try {
      await apiRequest(`/api/projects/${project.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'Indonesia',
          clipsCount: 3,
          duration: project.mode === 'KOMEDI' ? '30' : '60',
        }),
      });
      await fetchProject(false);
    } catch (e: any) {
      alert(e.message || 'Gagal memulai analisis ulang.');
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-purple-500" />
        <p className="text-neutral-400 text-sm">Memuat proyek video...</p>
      </div>
    );
  }

  if (pageError || !project) {
    return (
      <div className="max-w-md mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
        <h3 className="text-lg font-bold text-white">Proyek Tidak Ditemukan</h3>
        <p className="text-sm text-neutral-400">{pageError || 'Data proyek ini mungkin telah dihapus.'}</p>
        <Link
          to="/"
          className="inline-block bg-white text-black font-medium px-5 py-2.5 rounded-lg text-sm transition-colors hover:bg-neutral-200"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  if (editingClip) {
    return (
      <AdvancedClipEditor
        clip={editingClip}
        project={project}
        onBack={() => {
          setEditingClip(null);
          fetchProject(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-neutral-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{project.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs bg-purple-950/60 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-800/40 font-medium">
                Mode {project.mode}
              </span>
              {project.durationSeconds ? (
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Durasi: {Math.floor(project.durationSeconds)} detik
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {project.status === 'error' && (
        <div className="bg-neutral-900 border border-red-500/30 p-8 rounded-2xl text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold text-white">Analisis Video Terkendala</h3>
          <p className="text-neutral-400 text-sm leading-relaxed">
            {project.error || 'Terjadi kendala saat memproses video dengan model AI.'}
          </p>
          <div className="pt-2">
            <button
              onClick={handleRetryAnalysis}
              disabled={isRetrying}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-70 text-sm shadow-lg shadow-purple-500/20"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengirim Ulang...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Coba Analisis Ulang
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Analyzing state */}
      {(project.status === 'uploaded' || project.status === 'analyzing') && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4">
          <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto" />
          <h3 className="text-xl font-semibold text-white">Sedang Menganalisis Video...</h3>
          <p className="text-neutral-400 text-sm leading-relaxed">
            AI sedang memindai video Anda untuk mencari setup, punchline, dan momen sorotan terbaik yang siap dipotong untuk Shorts.
          </p>
          <div className="text-xs text-neutral-500 pt-2">
            Status diperbarui secara otomatis setiap beberapa detik.
          </div>
        </div>
      )}

      {/* Analyzed state */}
      {project.status === 'analyzed' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Rekomendasi Klip AI</h3>
            </div>
            <span className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-xs font-semibold border border-purple-500/20">
              {project.clips.length} Klip Ditemukan
            </span>
          </div>

          {project.clips.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center space-y-4">
              <p className="text-neutral-400 text-sm">
                Tidak ada klip yang memenuhi ambang skor berkualitas. Anda dapat mencoba menganalisis ulang dengan pengaturan lain.
              </p>
              <button
                onClick={handleRetryAnalysis}
                className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Analisis Ulang
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {project.clips.map((clip) => (
                <div
                  key={clip.id}
                  className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden flex flex-col transition-all group"
                >
                  <div className="p-6 flex-1 flex flex-col space-y-4">
                    <div className="flex justify-between items-start gap-3">
                      <h4 className="text-base font-bold text-white leading-snug">{clip.title}</h4>
                      <div className="flex-shrink-0 bg-neutral-950 px-2 py-1 rounded text-xs font-bold text-green-400 border border-neutral-800">
                        {clip.editorialScore}/100
                      </div>
                    </div>

                    <div className="text-xs text-neutral-400 space-y-2 flex-1">
                      <p>
                        <strong className="text-neutral-200">Opening Hook:</strong> {clip.openingHook}
                      </p>
                      <p>
                        <strong className="text-neutral-200">Payoff / Inti:</strong> {clip.mainPayoff}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/60">
                      <div>
                        <span className="block text-white font-semibold">{clip.startSeconds}s</span>
                        <span className="text-neutral-500 text-[10px]">Mulai</span>
                      </div>
                      <div>
                        <span className="block text-white font-semibold">{clip.endSeconds}s</span>
                        <span className="text-neutral-500 text-[10px]">Selesai</span>
                      </div>
                      <div>
                        <span className="block text-white font-semibold">{clip.duration}s</span>
                        <span className="text-neutral-500 text-[10px]">Durasi</span>
                      </div>
                    </div>

                    {clip.contextWarning && (
                      <div className="text-[11px] bg-amber-500/10 text-amber-300 p-2 rounded border border-amber-500/20">
                        ⚠️ {clip.contextWarning}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-neutral-800 bg-neutral-950/40">
                    <button
                      onClick={() => setEditingClip(clip)}
                      className="w-full bg-white hover:bg-neutral-200 text-black font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Scissors className="w-4 h-4 text-purple-600" />
                      Sesuaikan & Render Klip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
