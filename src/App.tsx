import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Sparkles, FileCode } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import SourceCodeExportModal from './components/SourceCodeExportModal';

export default function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-purple-500/30">
        <header className="border-b border-neutral-900 bg-neutral-950/50 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors">
              <Sparkles className="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-tight text-white">ShortCut AI</h1>
            </Link>
            
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-500 font-medium hidden md:block">
                Ubah Video Panjang Jadi Shorts
              </div>
              <button
                id="btn-header-export-source"
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-colors shadow-sm cursor-pointer"
                title="Unduh seluruh kode sumber aplikasi terstruktur dalam format JSON"
              >
                <FileCode className="w-4 h-4 text-purple-400" />
                <span>Unduh Source Code JSON</span>
              </button>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard onOpenExportModal={() => setIsExportModalOpen(true)} />} />
            <Route path="/new" element={<NewProject />} />
            <Route path="/project/:id" element={<ProjectDetail />} />
          </Routes>
        </main>

        <SourceCodeExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      </div>
    </BrowserRouter>
  );
}

