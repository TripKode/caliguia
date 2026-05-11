import { Client, handle_file } from "@gradio/client";

const DEFAULT_SPACE = "myshellai/OpenVoiceV2";
const DEFAULT_ENDPOINT = "/predict";

type GradioFileLike = {
  url?: string;
  path?: string;
  name?: string;
};

function getOpenVoiceSpace() {
  return process.env.GRADIO_OPENVOICE_SPACE || DEFAULT_SPACE;
}

function getOpenVoiceEndpoint() {
  return process.env.GRADIO_OPENVOICE_ENDPOINT || DEFAULT_ENDPOINT;
}

function findAudioUrl(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    return value.startsWith("http") ? value : "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
    return "";
  }

  if (typeof value === "object") {
    const file = value as GradioFileLike;
    if (typeof file.url === "string") return file.url;
    if (typeof file.path === "string" && file.path.startsWith("http")) return file.path;

    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
  }

  return "";
}

export async function createOpenVoiceSpeech(params: {
  file: File;
  text: string;
  style?: string;
}) {
  const app = await Client.connect(getOpenVoiceSpace());
  const result = await app.predict(getOpenVoiceEndpoint(), [
    params.text,
    params.style || "es_default",
    handle_file(params.file),
    1.0,
    true,
  ]);

  const audioUrl = findAudioUrl(result.data);
  if (!audioUrl) {
    throw new Error(`OpenVoice did not return an audio URL: ${JSON.stringify(result.data)}`);
  }

  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`OpenVoice audio fetch failed: ${audioResponse.status}`);
  }

  return {
    audioResponse,
    audioUrl,
    raw: result.data,
  };
}
