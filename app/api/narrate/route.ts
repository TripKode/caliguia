import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // El modelo más potente y rápido de texto de Groq

type Lang = "es" | "en" | "pt";

// Per-language system persona
const LANGUAGE_PERSONA: Record<Lang, string> = {
  es: `Eres CaliGuía, un guía turístico profesional, culto y apasionado por la historia de Cali, Colombia.
Hablas con acento caleño neutro, humano y natural.
REGLA DE IDIOMA: Responde EXCLUSIVAMENTE en ESPAÑOL.
Reglas para NARRACIÓN: una sola oración corta siempre que puedas, 24 palabras máximo. Cero emojis. Cero hashtags.
Reglas para CHAT: Sé amable, cercano y fascinante. Si recomiendas lugares, no pongas sus nombres dentro del texto principal; agrega cada recomendación al final usando [[Nombre del Lugar]]. Máximo 150 palabras.`,

  en: `You are CaliGuide, a professional, cultured, and passionate tour guide in Cali, Colombia.
LANGUAGE RULE: Respond EXCLUSIVELY in ENGLISH.
Rules for NARRATION: Maximum 1 or 2 short sentences (32 words max).
Rules for CHAT: Be warm, helpful, and fascinating. If you recommend places, do not put their names inside the main text; add each recommendation at the end using [[Landmark Name]]. Max 150 words.`,

  pt: `Você é CaliGuia, um guia turístico profissional, culto e apaixonado pela história de Cali, Colômbia.
REGRA DE IDIOMA: Responda EXCLUSIVAMENTE em PORTUGUÊS.
Regras para NARRAÇÃO: Máximo 1 ou 2 frases curtas (32 palavras no máximo).
Regras para CHAT: Seja acolhedor, próximo e fascinante. Se recomendar lugares, não coloque os nomes no texto principal; adicione cada recomendação no final usando [[Nome do Lugar]]. Máximo 150 palavras.`,
};

// Per-language type instructions
const TYPE_INSTRUCTIONS: Record<Lang, Record<string, string>> = {
  es: {
    welcome: "MODO BIENVENIDA: Saluda al visitante de forma creativa y humana basándote en su ubicación actual. Menciona algo fascinante o histórico del lugar cercano para engancharlo. Omite la palabra literal 'bienvenido' si puedes usar una frase más hospitalaria y original.",
    monument: "MODO MONUMENTO: Comparte un dato histórico o arquitectónico fascinante en una frase natural, como guía caleño culto y cercano. Evita sonar español peninsular.",
    route: "MODO RUTA: Sugiere el siguiente paso en la caminata con entusiasmo, mencionando qué detalle visual va a descubrir a continuación.",
    danger: "MODO ALERTA: Con voz muy suave, respetuosa y protectora, sugiérele al turista que esté un poco más atento con sus pertenencias en esta calle, sin causar alarma ni sonar dramático.",
    info: "MODO INFO: Cuenta un dato curioso o recomendación cultural en una frase breve, con orgullo caleño sobrio, humano y natural.",
    chat: "MODO CHAT: Responde con calidez y claridad. Usa el contexto de seguridad, comuna, zonas de riesgo y heatmap si está disponible. Si el usuario está en zona de riesgo alto o moderado, incluye una alerta breve, amable y no alarmista. Si recomiendas lugares, escribe un mensaje principal sin nombres de lugares y agrega después solo etiquetas [[Nombre del Lugar]].",
  },
  en: {
    welcome: "WELCOME MODE: Greet the visitor creatively based on their location. Mention something fascinating about the nearby surroundings to hook them. Avoid the literal word 'welcome' if you can use a more original, hospitable phrase.",
    monument: "MONUMENT MODE: Share a fascinating and little-known historical fact about this place, as if telling a great anecdote. Make history come alive.",
    route: "ROUTE MODE: Suggest the next step in the walk with enthusiasm, mentioning what visual detail they will discover next.",
    danger: "ALERT MODE: With a very soft, respectful, and protective voice, suggest the tourist be a bit more attentive to their belongings here, without causing alarm.",
    info: "INFO MODE: Share a curious fact, anecdote, or cultural recommendation about the current neighborhood with eloquence and local pride.",
    chat: "CHAT MODE: Answer warmly and clearly. Use safety, comuna, risk-zone, and heatmap context when available. If the user is in a high or moderate risk zone, include a brief, kind, non-alarmist alert. If you recommend places, write the main message without place names and then add only tags like [[Landmark Name]].",
  },
  pt: {
    welcome: "MODO BOAS-VINDAS: Cumprimente o visitante de forma criativa com base na localização atual. Mencione algo fascinante sobre o entorno para cativá-lo. Evite a palavra literal 'bem-vindo' se puder usar uma frase mais hospitaleira e original.",
    monument: "MODO MONUMENTO: Compartilhe um fato histórico fascinante e pouco conhecido sobre este lugar, como se contasse uma ótima anedota. Faça a história ganhar vida.",
    route: "MODO ROTA: Sugira o próximo passo na caminhada com entusiasmo, mencionando qual detalhe visual eles descobrirão a seguir.",
    danger: "MODO ALERTA: Com uma voz muito suave, respeitosa e protetora, sugira ao turista que fique um pouco mais atento aos seus pertences aqui, sem causar alarme.",
    info: "MODO INFO: Compartilhe um fato curioso, anedota ou recomendação cultural sobre o bairro atual com eloquência e orgulho local.",
    chat: "MODO CHAT: Responda com carinho e clareza. Use o contexto de segurança, comuna, zonas de risco e heatmap quando disponível. Se o usuário estiver em zona de risco alto ou moderado, inclua um alerta breve, gentil e sem alarmismo. Se recomendar lugares, escreva a mensagem principal sem nomes de lugares e depois adicione apenas etiquetas [[Nome do Lugar]].",
  },
};

function clampNarrationText(text: string, maxWords = 24) {
  const clean = text
    .replace(/["“”#]/g, "")
    .replace(/^tú\s+(sabes|estás a punto de|vas a)\s+que?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= maxWords) return clean;

  const clipped = words.slice(0, maxWords).join(" ");
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped.replace(/[,;:]$/, "")}.`;
}

export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const { prompt, messages, type = "info", language = "es" } = body as {
    prompt?: string;
    messages?: { role: "user" | "assistant" | "system"; content: string }[];
    type?: string;
    language?: Lang;
  };

  if (!prompt && !messages) {
    return NextResponse.json({ error: "Missing prompt or messages" }, { status: 400 });
  }

  const lang: Lang = (["es", "en", "pt"].includes(language) ? language : "es") as Lang;
  const persona = LANGUAGE_PERSONA[lang];
  const typeInstruction = TYPE_INSTRUCTIONS[lang][type] ?? TYPE_INSTRUCTIONS[lang].info;
  const systemPrompt = `${persona}\n\n${typeInstruction}`;

  try {
      const fullSystemPrompt = prompt ? `${systemPrompt}\n\n${prompt}` : systemPrompt;
      const groqMessages = messages 
        ? [
            { role: "system", content: fullSystemPrompt },
            ...messages.map(m => ({ 
              role: m.role === "assistant" ? "assistant" : "user" as "assistant" | "user", 
              content: m.content 
            }))
          ]
        : [
            { role: "system", content: fullSystemPrompt },
            { role: "user", content: prompt! },
          ];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: groqMessages,
          max_tokens: type === "chat" ? 400 : 80,
          temperature: 0.72,
        }),
      });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq error:", errorText);
      return NextResponse.json({ error: "Groq request failed" }, { status: 502 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    const maxWords = type === "chat" ? 150 : 24;
    return NextResponse.json({ text: clampNarrationText(text, maxWords) });
  } catch (error) {
    console.error("Narrate API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
