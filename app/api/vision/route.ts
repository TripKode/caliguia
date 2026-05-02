import { NextRequest, NextResponse } from "next/server";

// ─── Configuración ───────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const CALI_LANDMARKS_LIST = [
  "Cristo Rey", "Cerro de las Tres Cruces", "Iglesia La Ermita", "Gato de Tejada",
  "Bulevar del Río", "Plaza de Caicedo", "Teatro Municipal Enrique Buenaventura",
  "Museo La Tertulia", "Parque del Perro", "San Antonio", "Zoológico de Cali",
  "Estadio Pascual Guerrero", "Centro Cultural de Cali", "Catedral de San Pedro",
  "Iglesia de San Francisco", "Museo Arqueológico La Merced", "Torre de Cali",
  "Avenida Roosevelt", "Plaza de Toros de Cañaveralejo", "Puente Ortiz",
  "Palacio Nacional de Cali", "Casa Proartes", "Parque Panamericano",
].join(", ");

const SYSTEM_PROMPT = `Eres un experto guía turístico de Santiago de Cali, Valle del Cauca, Colombia. Analiza la imagen proporcionada con mucha atención.

REGLA ESTRICTA E IRROMPIBLE: Solo puedes identificar y hablar sobre monumentos, lugares históricos, turísticos, íconos culturales o sitios reconocibles de la ciudad de Cali, como: ${CALI_LANDMARKS_LIST}.

CASOS DE RESPUESTA:
1. Si reconoces claramente uno de estos sitios icónicos de Cali → responde con UNA descripción cultural breve y fascinante (máximo 60 palabras), ideal para ser escuchada en voz alta. Comienza directamente con el nombre del lugar. Sin saludos, sin introducciones.
2. Si la imagen muestra un lugar genérico, interior de edificio, calle sin monumentos, persona, objeto, o cualquier lugar que NO sea un monumento turístico identificable de Cali → responde EXACTAMENTE y solo: "No logro reconocer un monumento turístico de Cali en esta vista."

Solo español colombiano. Sin emojis. Sin listas. Solo prosa narrativa fluida apta para audio.`;

const NO_RECOGNITION_PHRASE = "No logro reconocer un monumento turístico de Cali en esta vista.";

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.image) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const { image } = body as { image: string };

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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analiza esta imagen y responde según tus instrucciones estrictas." },
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

    const isNotRecognized =
      text.toLowerCase().includes("no logro reconocer") ||
      text.toLowerCase().includes("no reconozco");

    return NextResponse.json({
      text: isNotRecognized ? NO_RECOGNITION_PHRASE : text,
      recognized: !isNotRecognized,
      model: GROQ_MODEL,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Vision/Groq] Fetch error:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
