const DEFAULT_XTTS_API_URL = "http://127.0.0.1:8010/tts";
const DEFAULT_XTTS_TIMEOUT_MS = 60_000;

function getXttsApiUrl() {
  return process.env.F5_TTS_API_URL || process.env.XTTS_API_URL || DEFAULT_XTTS_API_URL;
}

function getXttsTimeoutMs() {
  const raw = process.env.XTTS_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_XTTS_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_XTTS_TIMEOUT_MS;
}

export async function createLocalXttsSpeech(params: {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getXttsTimeoutMs());

  let response: Response;
  try {
    response = await fetch(getXttsApiUrl(), {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`F5-TTS local no respondió en ${Math.round(getXttsTimeoutMs() / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `XTTS local API failed: ${response.status}`);
  }

  return response;
}
