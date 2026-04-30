import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

const TYPE_INSTRUCTIONS: Record<string, string> = {
  welcome:
    "MODO BIENVENIDA: dale la bienvenida al visitante a Cali con calidez, menciona que lo vas a guiar por la ciudad.",
  monument:
    "MODO MONUMENTO: describe brevemente este lugar histórico, cultural o arquitectónico. Sé específico pero breve.",
  route:
    "MODO RUTA: sugiere el siguiente punto de interés en la ruta del usuario, resaltando arquitectura o cultura. Sé corto.",
  danger:
    "MODO ALERTA: informa al usuario con calma y sin alarmar que está ingresando a una zona que requiere precaución. No entres en detalles, solo pide que esté atento y sugiere continuar por otra vía si puede.",
  info:
    "MODO INFO: comparte un dato curioso o local relevante al contexto. Sé breve y amigable.",
};

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const { prompt, type = "info" } = body as { prompt: string; type?: string };

  const typeInstruction = TYPE_INSTRUCTIONS[type] ?? TYPE_INSTRUCTIONS.info;

  const systemPrompt = `Eres CaliGuía, un guía turístico virtual de la ciudad de Cali, Colombia.
Hablas con la cadencia natural, cálida y tranquila de un ciudadano de Cali — sereno, amigable, nunca estresante.
Tu voz es como la de un vecino bien conocedor de la ciudad que camina junto al visitante.

Reglas estrictas:
- Máximo 2 oraciones cortas por respuesta (35 palabras máximo total).
- No uses emojis ni caracteres especiales.
- Habla en segunda persona singular (le hablas directamente al visitante).
- Usa vocabulario sencillo y local cuando aplique (por ejemplo: "parche", "parcerito", "chimba").
- Nunca repitas información que ya mencionaste antes en la conversación.
- Solo en español colombiano neutro-caleño.
- No generes listas, solo texto natural de narración oral.

${typeInstruction}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://caliguia.app",
        "X-Title": "CaliGuía",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 90,
        temperature: 0.72,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      return NextResponse.json({ error: "OpenRouter request failed" }, { status: 502 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("Narrate API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
