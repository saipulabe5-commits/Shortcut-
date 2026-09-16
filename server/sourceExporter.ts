import fs from "fs";
import path from "path";
import crypto from "crypto";

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

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "uploads",
  "data",
  "dist",
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".next",
  "coverage",
]);

const EXCLUDED_FILE_PATTERNS = [
  /^\.env(\..+)?$/, // Exclude .env, .env.local, .env.production etc. (EXCEPT .env.example which is whitelisted)
  /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv)$/i, // Media/Video files
  /\.(sqlite|sqlite3|db|db\.json)$/i, // Database files
  /\.(log|tmp|swp)$/i, // Log and temp files
  /\.(pem|key|pfx|p12)$/i, // Certificates & private keys
  /^id_(rsa|dsa|ecdsa|ed25519)/i, // SSH keys
  /^service[-_]?account.*\.json$/i, // Service account credentials
  /^shortcut-ai-source-.*\.json$/i, // Previous export archives
  /^\.DS_Store$/i,
  /^Thumbs\.db$/i,
];

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".wav",
]);

const SECRET_PATTERNS = [
  /AIzaSy[0-9A-Za-z-_]{33}/, // Google API key
  /sk-[0-9A-Za-z]{32,}/, // OpenAI/General secret key
  /ghp_[0-9A-Za-z]{36}/, // GitHub personal access token
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
];

function isBinaryFile(filePath: string, buffer: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  // Inspect first 512 bytes for null byte
  const checkLength = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function shouldExcludeFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const fileName = path.basename(normalized);

  // Allowed exception
  if (fileName === ".env.example") {
    return false;
  }

  for (const pattern of EXCLUDED_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }

  // Check if any segment is an excluded dir
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (EXCLUDED_DIRS.has(seg)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively scans directory for exportable source files.
 */
function scanDirectory(
  rootDir: string,
  currentDir: string,
  fileList: string[] = []
): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    // Prevent following symlinks out of project root
    try {
      const realPath = fs.realpathSync(fullPath);
      if (!realPath.startsWith(rootDir)) {
        continue;
      }
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || shouldExcludeFile(relPath)) {
        continue;
      }
      scanDirectory(rootDir, fullPath, fileList);
    } else if (entry.isFile()) {
      if (!shouldExcludeFile(relPath)) {
        fileList.push(relPath);
      }
    }
  }

  return fileList;
}

/**
 * Builds the complete structured JSON export of the real project source code.
 */
export function buildSourceCodeExport(rootDir: string = process.cwd()): SourceCodeExportBundle {
  const normalizedRoot = path.resolve(rootDir);
  const relativeFiles = scanDirectory(normalizedRoot, normalizedRoot, []);

  let appVersion = "1.0.0";
  try {
    const pkgPath = path.join(normalizedRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.version) appVersion = pkg.version;
    }
  } catch {
    // ignore
  }

  const exportFiles: SourceCodeFileItem[] = [];
  let totalBytes = 0;
  let partialScope = false;

  for (const relPath of relativeFiles) {
    const fullPath = path.join(normalizedRoot, relPath);

    // Ensure within root
    if (!path.resolve(fullPath).startsWith(normalizedRoot)) {
      continue;
    }

    const buffer = fs.readFileSync(fullPath);
    const isBin = isBinaryFile(relPath, buffer);

    let content: string;
    let encoding: "utf-8" | "base64";

    if (isBin) {
      encoding = "base64";
      content = buffer.toString("base64");
    } else {
      encoding = "utf-8";
      content = buffer.toString("utf-8");

      // Secret Scanner check (except placeholder template .env.example)
      if (relPath !== ".env.example") {
        let hasSecret = false;
        for (const secPattern of SECRET_PATTERNS) {
          if (secPattern.test(content)) {
            hasSecret = true;
            break;
          }
        }
        if (hasSecret) {
          console.warn(`[SourceExport] File ${relPath} matched secret pattern. Excluded for security.`);
          partialScope = true;
          continue;
        }
      }
    }

    const sizeBytes = buffer.length;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    totalBytes += sizeBytes;
    exportFiles.push({
      path: relPath,
      encoding,
      content,
      sizeBytes,
      sha256,
    });
  }

  // Sort files deterministically by relative path
  exportFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: "1.0.0",
    appName: "ShortCut AI",
    appVersion,
    exportedAt: new Date().toISOString(),
    exportScope: partialScope ? "partial_source_tree" : "complete_source_tree",
    fileCount: exportFiles.length,
    totalBytes,
    excludedCategories: [
      "secrets_and_env",
      "node_modules",
      "git_metadata",
      "user_uploads_and_media",
      "database_and_runtime_state",
      "build_artifacts",
      "previous_export_bundles",
    ],
    files: exportFiles,
  };
}
