export type Mode = "KOMEDI" | "EDUKASI";

export interface ScoreBreakdown {
  openingStrength: number;
  standaloneClarity: number;
  categoryFit: number;
  endingQuality: number;
}

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface Clip {
  id: string;
  category: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  duration: number;
  selectionReason: string;
  openingHook: string;
  mainPayoff: string;
  contextWarning?: string;
  editorialScore: number;
  scoreBreakdown: ScoreBreakdown;
  suggestedDescription: string;
  suggestedHashtags: string[];
  transcriptSegments: TranscriptSegment[];
}

export interface Project {
  id: string;
  name: string;
  originalVideoPath: string;
  status: "uploaded" | "analyzing" | "analyzed" | "error";
  mode: Mode;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  clips: Clip[];
  createdAt: string;
  error?: string;
}

export interface RenderJob {
  id: string;
  clipId: string;
  projectId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  outputFileName?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  requestId: string;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  geminiConfigured: boolean;
  storageWritable: boolean;
  timestamp: string;
}

export interface SourceCodeFileItem {
  path: string;
  encoding: "utf-8" | "base64";
  content: string;
  sizeBytes: number;
  sha256: string;
}

export interface SourceCodeExportBundle {
  schemaVersion: "1.0.0";
  appName: string;
  appVersion?: string;
  exportedAt: string;
  exportScope: "complete_source_tree" | "partial_source_tree";
  fileCount: number;
  totalBytes: number;
  excludedCategories: string[];
  files: SourceCodeFileItem[];
}

