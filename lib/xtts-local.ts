const DEFAULT_XTTS_API_URL = "http://127.0.0.1:8010/tts";
const DEFAULT_XTTS_TIMEOUT_MS = 180_000;
const XTTS_NETWORK_RETRIES = 3;

function getXttsApiUrl() {
  return process.env.F5_TTS_API_URL || process.env.XTTS_API_URL || DEFAULT_XTTS_API_URL;
}

function getXttsBaseUrl() {
  return getXttsApiUrl().replace(/\/tts\/?$/, "");
}

function getXttsApiUrls() {
  const primary = getXttsApiUrl();
  const urls = [primary];

  if (primary.includes("://localhost:")) {
    urls.push(primary.replace("://localhost:", "://127.0.0.1:"));
  } else if (primary.includes("://127.0.0.1:")) {
    urls.push(primary.replace("://127.0.0.1:", "://localhost:"));
  }

  return Array.from(new Set(urls));
}

function getXttsBaseUrls() {
  return getXttsApiUrls().map((url) => url.replace(/\/tts\/?$/, ""));
}

function getXttsTimeoutMs() {
  const raw = process.env.XTTS_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_XTTS_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_XTTS_TIMEOUT_MS;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(error: unknown) {
  return error instanceof Error && error.name !== "AbortError";
}

async function fetchWithRetry(urls: string[], initFactory: (signal: AbortSignal) => RequestInit, timeoutMessage: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < XTTS_NETWORK_RETRIES; attempt += 1) {
    for (const url of urls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), getXttsTimeoutMs());

      try {
        return await fetch(url, initFactory(controller.signal));
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(timeoutMessage);
        }
        if (!isNetworkError(error)) {
          throw error;
        }
        console.warn(`[xtts-local] Network error calling ${url} (attempt ${attempt + 1}/${XTTS_NETWORK_RETRIES}):`, error);
      } finally {
        clearTimeout(timeout);
      }
    }

    await wait(900 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("F5-TTS local network error");
}

function createSpeechFormData(params: {
  file?: Blob;
  fileName?: string;
  voiceId?: string;
  text: string;
  language: string;
  reference_text?: string;
}) {
  const formData = new FormData();
  formData.append("text", params.text);
  formData.append("language", params.language);
  if (params.voiceId) {
    formData.append("voice_id", params.voiceId);
  }
  if (params.reference_text) {
    formData.append("reference_text", params.reference_text);
  }
  if (params.file) {
    formData.append("speaker_wav", params.file, params.fileName || "caliguia-reference-voice.webm");
  }
  return formData;
}

export async function createLocalXttsSpeech(params: {
  file?: Blob;
  fileName?: string;
  voiceId?: string;
  text: string;
  language: string;
  reference_text?: string;
}) {
  const response = await fetchWithRetry(
    getXttsApiUrls(),
    (signal) => ({
      method: "POST",
      body: createSpeechFormData(params),
      signal,
    }),
    `F5-TTS local no respondió en ${Math.round(getXttsTimeoutMs() / 1000)}s`
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `XTTS local API failed: ${response.status}`);
  }

  return response;
}

export async function validateLocalXttsReference(params: {
  file: Blob;
  fileName?: string;
  referenceText: string;
  language?: string;
}) {
  return fetchWithRetry(
    getXttsBaseUrls().map((baseUrl) => `${baseUrl}/validate-reference`),
    (signal) => {
      const formData = new FormData();
      formData.append("reference_text", params.referenceText);
      if (params.language) {
        formData.append("language", params.language);
      }
      formData.append("speaker_wav", params.file, params.fileName || "caliguia-reference-voice.webm");
      return {
      method: "POST",
      body: formData,
        signal,
      };
    },
    `F5-TTS local no validó la voz en ${Math.round(getXttsTimeoutMs() / 1000)}s`
  );
}
