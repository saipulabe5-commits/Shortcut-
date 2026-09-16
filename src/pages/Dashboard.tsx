import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video, Plus, Trash2, Loader2, AlertCircle, RefreshCw, CheckCircle2, ShieldAlert, FileCode } from 'lucide-react';
import { Project, HealthStatus } from '../types';
import { apiRequest } from '../lib/apiClient';

interface DashboardProps {
  onOpenExportModal?: () => void;
}

export default function Dashboard({ onOpenExportModal }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const data = await apiRequest<HealthStatus>('/api/health/readiness');
      setHealth(data);
    } catch {
      // ignore readiness check error silently
    }
  };

  const fetchProjects = async () => {
    try {
      setErrorMessage(null);
      const data = await apiRequest<Project[]>('/api/projects');
      setProjects(data);
    } catch (e: any) {
      setErrorMessage(e.message || 'Gagal memuat daftar proyek.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Hapus proyek ini dan seluruh klip rendernya?')) return;
    
    setDeletingId(id);
    try {
      await apiRequest(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert(e.message || 'Gagal menghapus proyek');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-24 space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-purple-500" />
        <p className="text-neutral-400 text-sm">Memuat proyek Anda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* System Status Alert (if degraded) */}
      {health && !health.geminiConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl flex items-start gap-3 text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-white">Kunci API Gemini Belum Dikonfigurasi</span>
            Pastikan variabel <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded">GEMINI_API_KEY</code> telah disetel di Secrets aplikasi untuk menjalankan analisis video AI.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={fetchProjects}
            className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Proyek Anda</h2>
          <p className="text-neutral-400 mt-1 text-sm">Kelola video sumber dan klip yang dianalisis oleh AI.</p>
        </div>
        <Link
          to="/new"
          className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm shadow-lg shadow-purple-500/20"
        >
          <Plus className="w-4 h-4" />
          Proyek Baru
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-12 text-center">
          <Video className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">Belum ada proyek</h3>
          <p className="text-neutral-400 max-w-md mx-auto mb-6 text-sm">
            Mulai potong video panjang Anda menjadi klip vertikal berkualitas 9:16 untuk YouTube Shorts.
          </p>
          <Link
            to="/new"
            className="inline-flex bg-white hover:bg-neutral-200 text-black px-6 py-3 rounded-lg font-medium transition-colors items-center gap-2"
          >
            Buat Proyek Pertama
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/project/${p.id}`}
              className="bg-neutral-900 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 transition-all group block relative"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="text-lg font-semibold text-white truncate">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-medium">
                      {p.mode}
                    </span>
                    {p.durationSeconds ? (
                      <span className="text-xs text-neutral-400">
                        {Math.floor(p.durationSeconds)}s
                      </span>
                    ) : null}
                    <span className="text-xs text-neutral-500">
                      {new Date(p.createdAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  disabled={deletingId === p.id}
                  title="Hapus proyek"
                  className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-neutral-800"
                >
                  {deletingId === p.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-800/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">Status</span>
                  {p.status === 'error' ? (
                    <span className="text-red-400 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> Gagal
                    </span>
                  ) : p.status === 'analyzing' ? (
                    <span className="text-purple-400 flex items-center gap-1.5 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menganalisis
                    </span>
                  ) : p.status === 'analyzed' ? (
                    <span className="text-green-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {p.clips?.length || 0} Klip Siap
                    </span>
                  ) : (
                    <span className="text-blue-400 font-medium">Diunggah</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Backup / Source Code JSON Quick Access Card */}
      <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-8">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Cadangkan & Unduh Source Code</h4>
            <p className="text-xs text-neutral-400 mt-0.5">
              Ekspor seluruh kode sumber ShortCut AI sebagai file JSON terstruktur untuk cadangan dan rekonstruksi mandiri.
            </p>
          </div>
        </div>

        {onOpenExportModal && (
          <button
            id="btn-dashboard-open-export"
            type="button"
            onClick={onOpenExportModal}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700/80 border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-purple-400" />
            <span>Buka Dialog Ekspor</span>
          </button>
        )}
      </div>
    </div>
  );
}
