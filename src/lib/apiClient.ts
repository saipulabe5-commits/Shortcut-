import { ApiResponse } from '../types';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  retryable: boolean;
  requestId?: string;

  constructor(message: string, code = 'UNKNOWN_ERROR', statusCode = 500, retryable = false, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Centralized API request wrapper.
 * Intercepts HTML / non-JSON responses, checks status codes, and transforms errors into structured Indonesian messages.
 */
export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const response = await fetch(endpoint, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const requestId = response.headers.get('x-request-id') || undefined;

    // Handle case where server returned HTML (e.g. 404/500 from proxy, SPA fallback, or web server)
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      if (text.trim().startsWith('<') || text.includes('<html') || text.includes('<head')) {
        if (response.status === 404) {
          throw new ApiError(
            'Endpoint API tidak ditemukan di server (404 Not Found).',
            'NOT_FOUND',
            404,
            false,
            requestId
          );
        }
        if (response.status >= 500) {
          throw new ApiError(
            'Server mengalami kendala internal dan mengembalikan respons HTML.',
            'SERVER_ERROR',
            response.status,
            true,
            requestId
          );
        }
        throw new ApiError(
          `Server mengembalikan format non-JSON (${response.status} ${response.statusText}).`,
          'INVALID_RESPONSE_FORMAT',
          response.status,
          false,
          requestId
        );
      }
      
      // If empty body on success (204)
      if (response.status === 204 || text.trim() === '') {
        return {} as T;
      }

      throw new ApiError(
        'Respons dari server bukan JSON yang valid.',
        'INVALID_RESPONSE_FORMAT',
        response.status,
        false,
        requestId
      );
    }

    let payload: ApiResponse<T>;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        'Gagal mengurai respons JSON dari server.',
        'JSON_PARSE_ERROR',
        response.status,
        false,
        requestId
      );
    }

    // Check application-level contract
    if (!response.ok || payload.success === false) {
      const errorObj = payload.error || {
        code: 'API_ERROR',
        message: 'Permintaan gagal diproses oleh server.',
        retryable: response.status >= 500 || response.status === 429,
      };

      let userMessage = errorObj.message;
      if (response.status === 429 || errorObj.code === 'RATE_LIMIT') {
        userMessage = 'Batas permintaan model AI tercapai. Silakan coba kembali dalam beberapa detik.';
      } else if (response.status === 404) {
        userMessage = userMessage || 'Data atau sumber daya yang dicari tidak ditemukan.';
      }

      throw new ApiError(
        userMessage,
        errorObj.code || 'API_ERROR',
        response.status,
        errorObj.retryable ?? (response.status >= 500 || response.status === 429),
        payload.requestId || requestId
      );
    }

    return payload.data !== undefined ? payload.data : (payload as unknown as T);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError(
        'Permintaan melebihi batas waktu tunggu (Timeout). Periksa koneksi internet Anda.',
        'TIMEOUT',
        408,
        true
      );
    }
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new ApiError(
        'Koneksi ke backend terputus atau backend tidak dapat dihubungi. Pastikan server aktif.',
        'NETWORK_ERROR',
        0,
        true
      );
    }
    throw new ApiError(
      err.message || 'Terjadi kesalahan yang tidak terduga.',
      'UNEXPECTED_ERROR',
      500,
      false
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface SourceCodeMetaInfo {
  appName: string;
  appVersion?: string;
  fileCount: number;
  totalBytes: number;
  excludedCategories: string[];
  samplePaths: string[];
}

/**
 * Fetches metadata regarding available source code.
 */
export async function fetchSourceCodeInfo(): Promise<SourceCodeMetaInfo> {
  return apiRequest<SourceCodeMetaInfo>('/api/export/source-code/info');
}

/**
 * Downloads the source code JSON bundle directly from the backend endpoint.
 * Validates the response to ensure it is valid JSON and not an HTML error page.
 */
export async function downloadSourceCodeJson(): Promise<{ fileName: string; byteSize: number }> {
  const response = await fetch('/api/export/source-code', {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    let errorMsg = 'Gagal mengunduh file source code dari server.';
    try {
      const errorJson = await response.json();
      if (errorJson.error?.message) {
        errorMsg = errorJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(errorMsg, 'DOWNLOAD_FAILED', response.status);
  }

  // Get filename from header or generate default
  let fileName = 'shortcut-ai-source-code.json';
  const disposition = response.headers.get('content-disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      fileName = match[1];
    }
  }

  const blob = await response.blob();
  const byteSize = blob.size;

  // Create temporary anchor to trigger browser download
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }, 200);

  return { fileName, byteSize };
}

