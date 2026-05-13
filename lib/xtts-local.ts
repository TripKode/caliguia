const DEFAULT_XTTS_API_URL = "http://127.0.0.1:8010/tts";

function getXttsApiUrl() {
  return process.env.XTTS_API_URL || DEFAULT_XTTS_API_URL;
}

export async function createLocalXttsSpeech(params: {
  file?: Blob;
  fileName?: string;
  text: string;
  language: string;
}) {
  const formData = new FormData();
  formData.append("text", params.text);
  formData.append("language", params.language);
  if (params.file) {
    formData.append("speaker_wav", params.file, params.fileName || "caliguia-reference-voice.webm");
  }

  const response = await fetch(getXttsApiUrl(), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `XTTS local API failed: ${response.status}`);
  }

  return response;
}
