import { NextRequest, NextResponse } from "next/server";

// ─── Configuración ───────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const SUPPORTED_LANGUAGES = new Set(["es", "en", "pt"]);

const DEFAULT_CALI_LANDMARKS = [
  "Cristo Rey", "Cerro de las Tres Cruces", "Iglesia La Ermita", "Gato de Tejada",
  "Bulevar del Río", "Plaza de Caicedo", "Teatro Municipal Enrique Buenaventura",
  "Museo La Tertulia", "Parque del Perro", "San Antonio", "Zoológico de Cali",
  "Estadio Pascual Guerrero", "Centro Cultural de Cali", "Catedral de San Pedro",
  "Iglesia de San Francisco", "Museo Arqueológico La Merced", "Torre de Cali",
  "Avenida Roosevelt", "Plaza de Toros de Cañaveralejo", "Puente Ortiz",
  "Palacio Nacional de Cali", "Casa Proartes", "Parque Panamericano",
];

const NO_RECOGNITION = {
  es: "No logro reconocer un monumento turístico de Cali en esta vista.",
  en: "I cannot recognize a tourist landmark in Cali from this view.",
  pt: "Nao consigo reconhecer um ponto turistico de Cali nesta vista.",
};

function normalizeLanguage(language: unknown): "es" | "en" | "pt" {
  return typeof language === "string" && SUPPORTED_LANGUAGES.has(language) ? language as "es" | "en" | "pt" : "es";
}

function cleanLandmarkName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

function buildSystemPrompt(params: {
  language: "es" | "en" | "pt";
  landmarkNames: string[];
  coords?: { lat?: number; lng?: number; accuracy?: number } | null;
  currentComuna?: string;
}) {
  const landmarkList = params.landmarkNames.join(", ");
  const locationHint = params.coords?.lat && params.coords?.lng
    ? `Ubicacion aproximada del usuario: lat ${Number(params.coords.lat).toFixed(5)}, lng ${Number(params.coords.lng).toFixed(5)}${params.coords.accuracy ? `, precision ${Math.round(Number(params.coords.accuracy))}m` : ""}.`
    : "No hay coordenadas precisas disponibles.";
  const comunaHint = params.currentComuna ? `Comuna o zona actual: ${params.currentComuna}.` : "";

  const languageRules = {
    es: `Responde en español colombiano natural, apto para audio.`,
    en: `Respond in natural English, suitable for audio.`,
    pt: `Responda em portugues natural, adequado para audio.`,
  };

  return `Eres un experto guía turístico de Santiago de Cali, Valle del Cauca, Colombia. Analiza la imagen con mucha atención y usa el contexto de ubicación para reducir falsos positivos.

${locationHint}
${comunaHint}

Lugares permitidos para reconocer en esta vista: ${landmarkList}.

REGLAS ESTRICTAS:
1. Solo puedes reconocer lugares de la lista permitida. No inventes nombres.
2. Si reconoces claramente uno de esos lugares, responde SOLO JSON válido con:
{"recognized":true,"landmarkName":"Nombre exacto de la lista","text":"Descripción cultural breve, fascinante y hablable, máximo 45 palabras."}
3. Si la imagen es ambigua, genérica, interior, persona, objeto, calle sin sitio identificable, o no coincide claramente con la lista, responde SOLO:
{"recognized":false,"landmarkName":null,"text":"${NO_RECOGNITION[params.language]}"}
4. ${languageRules[params.language]}
5. Sin markdown, sin emojis, sin listas, sin texto fuera del JSON.`;
}

function parseVisionContent(content: string, language: "es" | "en" | "pt") {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const recognized = Boolean(parsed.recognized);
      const landmarkName = cleanLandmarkName(parsed.landmarkName);
      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      return {
        recognized: recognized && Boolean(landmarkName) && Boolean(text),
        landmarkName: recognized ? landmarkName : null,
        text: text || NO_RECOGNITION[language],
      };
    } catch {
      // fall through to legacy parsing
    }
  }

  const isNotRecognized =
    content.toLowerCase().includes("no logro reconocer") ||
    content.toLowerCase().includes("no reconozco") ||
    content.toLowerCase().includes("cannot recognize") ||
    content.toLowerCase().includes("nao consigo reconhecer") ||
    content.toLowerCase().includes("não consigo reconhecer");

  return {
    recognized: !isNotRecognized,
    landmarkName: !isNotRecognized ? cleanLandmarkName(content.split(/[,.]/)[0]) : null,
    text: isNotRecognized ? NO_RECOGNITION[language] : content.trim(),
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.image) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const {
    image,
    language: rawLanguage,
    coords,
    landmarks,
    currentComuna,
  } = body as {
    image: string;
    language?: string;
    coords?: { lat?: number; lng?: number; accuracy?: number } | null;
    landmarks?: Array<{ name?: string }>;
    currentComuna?: { name?: string } | string | null;
  };
  const language = normalizeLanguage(rawLanguage);
  const dynamicLandmarks = Array.isArray(landmarks)
    ? landmarks.map(item => cleanLandmarkName(item?.name)).filter(Boolean).slice(0, 18)
    : [];
  const landmarkNames = Array.from(new Set([...dynamicLandmarks, ...DEFAULT_CALI_LANDMARKS])).slice(0, 35);
  const currentComunaName = typeof currentComuna === "string" ? currentComuna : currentComuna?.name;
  const systemPrompt = buildSystemPrompt({
    language,
    landmarkNames,
    coords,
    currentComuna: currentComunaName,
  });

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analiza esta imagen y responde solo con el JSON indicado." },
              { type: "image_url", image_url: { url: image } }, // image ya viene como data URL base64
            ],
          },
        ],
        max_completion_tokens: 180,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Vision/Groq] Error (${response.status}):`, errText);
      return NextResponse.json({ error: `Groq error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      return NextResponse.json({ error: "Empty response from Groq" }, { status: 502 });
    }

    const parsed = parseVisionContent(text, language);

    return NextResponse.json({
      text: parsed.text,
      landmarkName: parsed.landmarkName,
      recognized: parsed.recognized,
      model: GROQ_MODEL,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Vision/Groq] Fetch error:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
