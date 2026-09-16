import express, { Request, Response, NextFunction } from "express";
import path from "path";
import multer from "multer";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { buildSourceCodeExport } from "./server/sourceExporter";

// Configure FFmpeg and FFprobe binary paths
if (ffmpegInstaller && ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}
if (ffprobeInstaller && ffprobeInstaller.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

const app = express();
const PORT = 3000;

// Middleware for parsing JSON with request limits
app.use(express.json({ limit: "5mb" }));

// Request ID middleware for end-to-end traceability
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || uuidv4();
  req.headers["x-request-id"] = reqId;
  res.setHeader("x-request-id", reqId);
  next();
});

// Standardized Response Helpers
function sendSuccess<T = any>(res: Response, data: T, statusCode = 200) {
  const requestId = (res.getHeader("x-request-id") as string) || uuidv4();
  return res.status(statusCode).json({
    success: true,
    data,
    requestId,
  });
}

function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  retryable = false
) {
  const requestId = (res.getHeader("x-request-id") as string) || uuidv4();
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      retryable,
    },
    requestId,
  });
}

// Storage Directories
const uploadsDir = path.join(process.cwd(), "uploads");
const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, "db.json");

// Persistent Local DB
function getDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { projects: [], jobs: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    console.error("Error reading DB file, resetting:", err);
    return { projects: [], jobs: [] };
  }
}

function saveDB(db: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Error writing DB file:", err);
  }
}

// Setup Multer for Secure Video Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 300 * 1024 * 1024, // 300 MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept typical video mime types or extensions
    if (
      file.mimetype.startsWith("video/") ||
      file.originalname.match(/\.(mp4|mov|mkv|webm|avi|m4v)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Format file harus berupa video (MP4, MOV, WEBM, dsb)."));
    }
  },
});

// Setup Gemini SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-shortcut-ai" } },
});

// Helper: Inspect Video via FFprobe
interface VideoProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  codec: string;
}

function probeVideo(filePath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(new Error(`Gagal membaca struktur video: ${err.message}`));
      }

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === "video"
      );
      if (!videoStream) {
        return reject(new Error("File tidak memiliki stream video yang valid."));
      }

      const audioStream = metadata.streams.find(
        (s) => s.codec_type === "audio"
      );

      const duration = Number(metadata.format.duration) || Number(videoStream.duration) || 0;
      const width = videoStream.width || 0;
      const height = videoStream.height || 0;
      const codec = videoStream.codec_name || "unknown";

      resolve({
        duration,
        width,
        height,
        hasAudio: !!audioStream,
        codec,
      });
    });
  });
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 1. Health Checks
app.get("/api/health", (req, res) => {
  sendSuccess(res, { status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health/liveness", (req, res) => {
  sendSuccess(res, { status: "alive", timestamp: new Date().toISOString() });
});

app.get("/api/health/readiness", (req, res) => {
  let storageWritable = false;
  try {
    const testFile = path.join(uploadsDir, `.test-write-${Date.now()}`);
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const ffmpegAvailable = !!(ffmpegInstaller && ffmpegInstaller.path);
  const ffprobeAvailable = !!(ffprobeInstaller && ffprobeInstaller.path);

  const isReady = storageWritable && ffmpegAvailable && ffprobeAvailable;

  sendSuccess(
    res,
    {
      status: isReady ? "healthy" : "degraded",
      ffmpegAvailable,
      ffprobeAvailable,
      geminiConfigured,
      storageWritable,
      timestamp: new Date().toISOString(),
    },
    isReady ? 200 : 503
  );
});

// 2. Get all projects
app.get("/api/projects", (req, res) => {
  const db = getDB();
  const sorted = [...(db.projects || [])].sort(
    (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  sendSuccess(res, sorted);
});

// 3. Get specific project
app.get("/api/projects/:id", (req, res) => {
  const db = getDB();
  const project = db.projects.find((p: any) => p.id === req.params.id);
  if (!project) {
    return sendError(res, "NOT_FOUND", "Proyek tidak ditemukan.", 404);
  }
  sendSuccess(res, project);
});

// 4. Create project & Upload video
app.post("/api/projects", (req, res) => {
  upload.single("video")(req, res, async (err) => {
    if (err) {
      return sendError(
        res,
        "UPLOAD_FAILED",
        err.message || "Gagal mengunggah file video.",
        400
      );
    }

    const file = req.file;
    const { name, mode } = req.body;

    if (!file) {
      return sendError(res, "VALIDATION_ERROR", "Silakan pilih file video untuk diunggah.", 400);
    }

    const filePath = path.join(uploadsDir, file.filename);

    // Verify video structure using ffprobe
    try {
      const probe = await probeVideo(filePath);

      if (probe.duration <= 1) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return sendError(
          res,
          "INVALID_VIDEO",
          "Durasi video terlalu pendek atau tidak dapat dibaca.",
          400
        );
      }

      const newProject = {
        id: uuidv4(),
        name: name || file.originalname,
        originalVideoPath: file.filename,
        status: "uploaded",
        mode: mode === "EDUKASI" ? "EDUKASI" : "KOMEDI",
        durationSeconds: Math.round(probe.duration * 100) / 100,
        width: probe.width,
        height: probe.height,
        hasAudio: probe.hasAudio,
        clips: [],
        createdAt: new Date().toISOString(),
      };

      const db = getDB();
      db.projects.push(newProject);
      saveDB(db);

      sendSuccess(res, newProject, 201);
    } catch (probeErr: any) {
      // Clean up corrupt upload
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendError(
        res,
        "INVALID_VIDEO",
        probeErr.message || "File yang diunggah bukan format video yang valid atau file rusak.",
        400
      );
    }
  });
});

// 5. Delete a project
app.delete("/api/projects/:id", (req, res) => {
  const db = getDB();
  const index = db.projects.findIndex((p: any) => p.id === req.params.id);
  if (index === -1) {
    return sendError(res, "NOT_FOUND", "Proyek tidak ditemukan.", 404);
  }

  const project = db.projects[index];

  // Clean up source file
  try {
    const vp = path.join(uploadsDir, project.originalVideoPath);
    if (fs.existsSync(vp)) fs.unlinkSync(vp);
  } catch (e) {
    console.error("Error deleting source video file:", e);
  }

  // Clean up associated rendered outputs
  try {
    const associatedJobs = db.jobs.filter((j: any) => j.projectId === project.id);
    for (const j of associatedJobs) {
      if (j.outputFileName) {
        const op = path.join(uploadsDir, j.outputFileName);
        if (fs.existsSync(op)) fs.unlinkSync(op);
      }
    }
    db.jobs = db.jobs.filter((j: any) => j.projectId !== project.id);
  } catch (e) {
    console.error("Error cleaning up jobs:", e);
  }

  db.projects.splice(index, 1);
  saveDB(db);

  sendSuccess(res, { deletedId: req.params.id });
});

// 6. Trigger Video Analysis
app.post("/api/projects/:id/analyze", async (req, res) => {
  const { language = "Indonesia", clipsCount = 3, duration = "30" } = req.body;
  const db = getDB();
  const project = db.projects.find((p: any) => p.id === req.params.id);

  if (!project) {
    return sendError(res, "NOT_FOUND", "Proyek tidak ditemukan.", 404);
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendError(
      res,
      "CONFIG_ERROR",
      "Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.",
      500
    );
  }

  // Update status to analyzing
  project.status = "analyzing";
  project.error = undefined;
  saveDB(db);

  // Run in background without blocking response
  runAnalysis(project.id, language, Number(clipsCount) || 3, String(duration)).catch((err) =>
    console.error("Background analysis error:", err)
  );

  sendSuccess(res, { message: "Analisis video telah dimulai di latar belakang.", project });
});

// 7. Get Job Status (for render polling)
app.get("/api/jobs/:id", (req, res) => {
  const db = getDB();
  const job = db.jobs.find((j: any) => j.id === req.params.id);
  if (!job) {
    return sendError(res, "NOT_FOUND", "Pekerjaan render tidak ditemukan.", 404);
  }
  sendSuccess(res, job);
});

// 8. Render a clip to 9:16 vertical video
app.post("/api/clips/:id/render", async (req, res) => {
  const { projectId, startSeconds, endSeconds, framing = "fit-blur", subtitleText = "" } = req.body;
  const db = getDB();
  const project = db.projects.find((p: any) => p.id === projectId);

  if (!project) {
    return sendError(res, "NOT_FOUND", "Proyek tidak ditemukan.", 404);
  }

  const start = Number(startSeconds);
  const end = Number(endSeconds);

  if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
    return sendError(
      res,
      "VALIDATION_ERROR",
      "Rentang waktu klip tidak valid (Waktu selesai harus lebih besar dari waktu mulai).",
      400
    );
  }

  const maxDuration = project.durationSeconds || 7200;
  if (start >= maxDuration || end > maxDuration + 1) {
    return sendError(
      res,
      "VALIDATION_ERROR",
      `Rentang waktu (${start}s - ${end}s) melebihi durasi video asli (${maxDuration}s).`,
      400
    );
  }

  const jobId = uuidv4();
  const newJob = {
    id: jobId,
    clipId: req.params.id,
    projectId: project.id,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.jobs.push(newJob);
  saveDB(db);

  // Trigger background rendering worker
  runRender(
    jobId,
    project.originalVideoPath,
    start,
    end,
    framing,
    subtitleText,
    !!project.hasAudio
  ).catch((e) => console.error("Background render error:", e));

  sendSuccess(res, { jobId, status: "queued" });
});

// 9. Download Rendered Video File
app.get("/api/download/:filename", (req, res) => {
  // Prevent directory traversal
  const safeFilename = path.basename(req.params.filename);
  const filepath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(filepath)) {
    return sendError(
      res,
      "FILE_NOT_FOUND",
      "File video hasil render tidak ditemukan atau sudah kedaluwarsa.",
      404
    );
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
});

// 10. Export Source Code JSON
app.get("/api/export/source-code", (req, res) => {
  try {
    const bundle = buildSourceCodeExport();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const filename = `shortcut-ai-source-${dateStr}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).send(JSON.stringify(bundle, null, 2));
  } catch (err: any) {
    console.error("Failed to build source code export:", err);
    return sendError(
      res,
      "EXPORT_FAILED",
      err.message || "Gagal membuat paket ekspor kode sumber.",
      500,
      true
    );
  }
});

// 11. Source Code Metadata / Stats Info
app.get("/api/export/source-code/info", (req, res) => {
  try {
    const bundle = buildSourceCodeExport();
    sendSuccess(res, {
      appName: bundle.appName,
      appVersion: bundle.appVersion,
      fileCount: bundle.fileCount,
      totalBytes: bundle.totalBytes,
      excludedCategories: bundle.excludedCategories,
      samplePaths: bundle.files.slice(0, 15).map((f) => f.path),
    });
  } catch (err: any) {
    return sendError(
      res,
      "EXPORT_INFO_FAILED",
      err.message || "Gagal membaca metadata kode sumber.",
      500,
      true
    );
  }
});

// -------------------------------------------------------------
// BACKGROUND WORKERS
// -------------------------------------------------------------

async function runAnalysis(
  projectId: string,
  language: string,
  clipsCount: number,
  durationTarget: string
) {
  const db = getDB();
  const project = db.projects.find((p: any) => p.id === projectId);
  if (!project) return;

  let uploadResult: any = null;

  try {
    const videoPath = path.join(uploadsDir, project.originalVideoPath);
    if (!fs.existsSync(videoPath)) {
      throw new Error("File video asli tidak ditemukan di server.");
    }

    // 1. Upload video to Gemini File API
    uploadResult = await ai.files.upload({
      file: videoPath,
      config: { mimeType: "video/mp4" },
    });

    // 2. Wait for file processing on Gemini
    let fileInfo = await ai.files.get({ name: uploadResult.name });
    let waitCount = 0;
    while (fileInfo.state === "PROCESSING" && waitCount < 60) {
      await new Promise((r) => setTimeout(r, 2000));
      fileInfo = await ai.files.get({ name: uploadResult.name });
      waitCount++;
    }

    if (fileInfo.state === "FAILED") {
      throw new Error("Pemrosesan file video oleh Gemini API gagal.");
    }

    const mode = project.mode;
    const videoDuration = project.durationSeconds || 60;

    const prompt = `You are an expert video editor and YouTube Shorts producer.
Analyze the provided video and extract the top ${clipsCount} best vertical clips suitable for YouTube Shorts.

Content Category: ${mode}
${
  mode === "KOMEDI"
    ? "Focus on complete comedic moments with clear context, strong setup, punchline delivery, and immediate laughter/reactions. Never cut prematurely before the punchline resolves."
    : "Focus on standalone educational nuggets, actionable advice, clear answers to engaging questions, or complete self-contained explanations."
}

Target language for title & metadata: ${language}
Target clip duration: approx ${durationTarget} seconds (between 10s and 60s).
Source video total duration: ${videoDuration} seconds.

Output must strictly adhere to the provided JSON schema. Ensure:
- startSeconds is a valid number >= 0.
- endSeconds is a valid number > startSeconds and <= ${videoDuration}.
- duration is endSeconds - startSeconds.
- editorialScore is between 0 and 100.
`;

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    let response: any = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              fileData: {
                fileUri: uploadResult.uri,
                mimeType: uploadResult.mimeType || "video/mp4",
              },
            },
            { text: prompt },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                clips: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      category: { type: Type.STRING },
                      title: { type: Type.STRING },
                      startSeconds: { type: Type.NUMBER },
                      endSeconds: { type: Type.NUMBER },
                      duration: { type: Type.NUMBER },
                      selectionReason: { type: Type.STRING },
                      openingHook: { type: Type.STRING },
                      mainPayoff: { type: Type.STRING },
                      contextWarning: { type: Type.STRING },
                      editorialScore: { type: Type.NUMBER },
                      scoreBreakdown: {
                        type: Type.OBJECT,
                        properties: {
                          openingStrength: { type: Type.NUMBER },
                          standaloneClarity: { type: Type.NUMBER },
                          categoryFit: { type: Type.NUMBER },
                          endingQuality: { type: Type.NUMBER },
                        },
                      },
                      suggestedDescription: { type: Type.STRING },
                      suggestedHashtags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      transcriptSegments: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            startSeconds: { type: Type.NUMBER },
                            endSeconds: { type: Type.NUMBER },
                            text: { type: Type.STRING },
                          },
                        },
                      },
                    },
                    required: [
                      "id",
                      "title",
                      "startSeconds",
                      "endSeconds",
                      "duration",
                      "editorialScore",
                    ],
                  },
                },
              },
              required: ["clips"],
            },
          },
        });
        break; // Successfully generated
      } catch (err: any) {
        console.warn(`Attempt ${attempts} failed:`, err?.message || err);
        if (attempts >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, attempts * 3000));
      }
    }

    const resultText = response?.text;
    if (!resultText) throw new Error("Tidak ada data respon dari model AI.");

    const parsed = JSON.parse(resultText);
    const rawClips = Array.isArray(parsed.clips) ? parsed.clips : [];

    // Sanitize and validate clips timestamps
    const validatedClips = rawClips
      .filter((clip: any) => {
        const start = Number(clip.startSeconds);
        const end = Number(clip.endSeconds);
        return (
          !isNaN(start) &&
          !isNaN(end) &&
          start >= 0 &&
          end > start &&
          start < videoDuration
        );
      })
      .map((clip: any) => {
        const start = Math.max(0, Number(clip.startSeconds));
        const end = Math.min(videoDuration, Number(clip.endSeconds));
        return {
          id: clip.id || uuidv4(),
          category: clip.category || mode,
          title: clip.title || "Klip Menarik",
          startSeconds: Math.round(start * 10) / 10,
          endSeconds: Math.round(end * 10) / 10,
          duration: Math.round((end - start) * 10) / 10,
          selectionReason: clip.selectionReason || "Momen sorotan yang kuat.",
          openingHook: clip.openingHook || "Pembuka klip",
          mainPayoff: clip.mainPayoff || "Puncak momen atau pesan utama",
          contextWarning: clip.contextWarning || "",
          editorialScore: Math.min(100, Math.max(0, Number(clip.editorialScore) || 85)),
          scoreBreakdown: clip.scoreBreakdown || {
            openingStrength: 85,
            standaloneClarity: 85,
            categoryFit: 90,
            endingQuality: 85,
          },
          suggestedDescription:
            clip.suggestedDescription || `${clip.title} #shorts`,
          suggestedHashtags: Array.isArray(clip.suggestedHashtags)
            ? clip.suggestedHashtags
            : ["#shorts", "#viral"],
          transcriptSegments: Array.isArray(clip.transcriptSegments)
            ? clip.transcriptSegments
            : [],
        };
      });

    const freshDb = getDB();
    const freshProject = freshDb.projects.find((p: any) => p.id === projectId);
    if (freshProject) {
      freshProject.status = "analyzed";
      freshProject.clips = validatedClips;
      freshProject.error = undefined;
      saveDB(freshDb);
    }
  } catch (error: any) {
    console.error("Analysis Error:", error);
    let errorMsg = error.message || "Gagal menganalisis video";
    if (
      errorMsg.includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("429")
    ) {
      errorMsg =
        "Batas kuota Gemini API tercapai atau server sedang sibuk. Silakan gunakan tombol 'Coba Analisis Ulang' dalam beberapa saat.";
    } else if (errorMsg.includes("overloaded") || errorMsg.includes("503")) {
      errorMsg =
        "Layanan AI sedang mengalami beban tinggi. Silakan coba analisis ulang.";
    }

    const freshDb = getDB();
    const freshProject = freshDb.projects.find((p: any) => p.id === projectId);
    if (freshProject) {
      freshProject.status = "error";
      freshProject.error = errorMsg;
      saveDB(freshDb);
    }
  } finally {
    // Clean up Gemini File API artifact
    if (uploadResult?.name) {
      try {
        await ai.files.delete({ name: uploadResult.name });
      } catch (delErr) {
        // silent ignore
      }
    }
  }
}

// Background Render Worker (FFmpeg)
async function runRender(
  jobId: string,
  originalVideoPath: string,
  start: number,
  end: number,
  framing: string,
  subtitleText: string,
  hasAudio: boolean
) {
  let db = getDB();
  let job = db.jobs.find((j: any) => j.id === jobId);
  if (!job) return;

  try {
    job.status = "processing";
    job.updatedAt = new Date().toISOString();
    saveDB(db);

    const inputPath = path.join(uploadsDir, originalVideoPath);
    const outputFileName = `render-${jobId}.mp4`;
    const outputPath = path.join(uploadsDir, outputFileName);
    const clipDuration = Math.max(1, end - start);

    // Format subtitle SRT content if subtitle text provided
    const srtFileName = `subs-${jobId}.srt`;
    const srtPath = path.join(uploadsDir, srtFileName);
    const hasSubtitles = Boolean(subtitleText && subtitleText.trim() !== "");

    if (hasSubtitles) {
      const durationInt = Math.floor(clipDuration);
      const srtContent = `1
00:00:00,000 --> 00:00:${durationInt < 10 ? "0" + durationInt : durationInt},000
${subtitleText.trim().replace(/\r\n/g, "\n")}
`;
      fs.writeFileSync(srtPath, srtContent, "utf-8");
    }

    await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .setStartTime(start)
        .setDuration(clipDuration)
        .videoCodec("libx264")
        .outputOptions([
          "-preset fast",
          "-movflags +faststart",
          "-pix_fmt yuv420p",
          "-r 30",
        ]);

      if (hasAudio) {
        command.audioCodec("aac").audioBitrate("128k");
      } else {
        // If no audio stream in source, don't fail aac encoding
        command.noAudio();
      }

      // Vertical 9:16 Video Filter Pipeline
      if (framing === "fit-blur") {
        // Scale to 1080x1920 with background blur and sharp centered foreground
        const complexFilter = [
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg]",
          "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]",
        ];
        command.complexFilter(complexFilter, "outv");
      } else {
        // Center crop without distortion
        command.videoFilters([
          "crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9)",
          "scale=1080:1920",
        ]);
      }

      command
        .on("progress", (progress) => {
          // Progress tracking if available
        })
        .on("end", () => {
          resolve(true);
        })
        .on("error", (err) => {
          console.error("FFmpeg execution error:", err);
          reject(err);
        })
        .save(outputPath);
    });

    // Verify output file existence & size
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("File output FFmpeg kosong atau gagal dibuat.");
    }

    // Clean up temporary srt file
    if (fs.existsSync(srtPath)) {
      try {
        fs.unlinkSync(srtPath);
      } catch (e) {}
    }

    db = getDB();
    job = db.jobs.find((j: any) => j.id === jobId);
    if (job) {
      job.status = "completed";
      job.outputFileName = outputFileName;
      job.progress = 100;
      job.updatedAt = new Date().toISOString();
      saveDB(db);
    }
  } catch (error: any) {
    console.error("Render Job Error:", error);
    db = getDB();
    job = db.jobs.find((j: any) => j.id === jobId);
    if (job) {
      job.status = "failed";
      job.error = error.message || "Gagal merender video vertical dengan FFmpeg.";
      job.updatedAt = new Date().toISOString();
      saveDB(db);
    }
  }
}

// -------------------------------------------------------------
// STRICT API 404 & ERROR HANDLER (BEFORE VITE SPA FALLBACK)
// -------------------------------------------------------------

// Ensure any unmatched /api route returns JSON 404
app.all("/api/*", (req: Request, res: Response) => {
  sendError(
    res,
    "NOT_FOUND",
    `Endpoint API '${req.method} ${req.path}' tidak ditemukan di server.`,
    404
  );
});

// Global API error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    console.error("Unhandled API Error:", err);
    return sendError(
      res,
      "INTERNAL_SERVER_ERROR",
      err.message || "Terjadi kesalahan pada server internal.",
      500,
      true
    );
  }
  next(err);
});

// -------------------------------------------------------------
// VITE SPA MIDDLEWARE / PRODUCTION STATIC SERVING
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ShortCut AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
