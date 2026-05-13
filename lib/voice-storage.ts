import { Storage } from "@google-cloud/storage";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "tripcode-internal",
});

const VOICE_BUCKET =
  process.env.CALIGUIA_VOICE_BUCKET ||
  process.env.GCS_VOICE_BUCKET ||
  process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
  "";

function requireVoiceBucket() {
  if (!VOICE_BUCKET) {
    throw new Error("Voice storage bucket is not configured. Set CALIGUIA_VOICE_BUCKET.");
  }
  return storage.bucket(VOICE_BUCKET);
}

function extensionFor(fileName: string, mimeType: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

export function buildVoiceObjectName(params: {
  userId: string;
  voiceId: string;
  fileName: string;
  mimeType: string;
}) {
  const ext = extensionFor(params.fileName, params.mimeType);
  return `users/${params.userId}/voices/${params.voiceId}/reference.${ext}`;
}

export async function uploadVoiceSample(params: {
  objectName: string;
  bytes: Buffer;
  mimeType: string;
  originalFileName: string;
  userId: string;
  voiceId: string;
}) {
  const file = requireVoiceBucket().file(params.objectName);
  await file.save(params.bytes, {
    resumable: false,
    contentType: params.mimeType,
    metadata: {
      cacheControl: "private, no-store",
      metadata: {
        originalFileName: params.originalFileName,
        userId: params.userId,
        voiceId: params.voiceId,
      },
    },
  });
}

export async function downloadVoiceSample(objectName: string) {
  const [bytes] = await requireVoiceBucket().file(objectName).download();
  return bytes;
}

export async function deleteVoiceSample(objectName: string) {
  await requireVoiceBucket().file(objectName).delete({ ignoreNotFound: true });
}

