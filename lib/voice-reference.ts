import type { LanguageCode } from "@/components/providers/ExperienceProvider";

export const VOICE_REFERENCE_VERSION = "caliguia-v1";

export const VOICE_REFERENCE_TEXTS: Record<LanguageCode, string> = {
  es: "Hola, soy la voz de CaliGuia. Caminaré contigo por Cali con calma, curiosidad y mucho sabor local. Te contaré historias de sus calles, parques y monumentos, mientras descubrimos juntos la memoria viva de la sucursal del cielo.",
  en: "Hello, I am the voice of CaliGuia. I will walk with you through Cali with calm curiosity and local flavor, sharing stories from its streets, parks, and landmarks as we discover the city's living memory together.",
  pt: "Olá, sou a voz da CaliGuia. Vou caminhar com você por Cali com calma, curiosidade e sabor local, contando histórias de ruas, parques e monumentos enquanto descobrimos a memória viva da cidade.",
};

export function getVoiceReferenceText(language: LanguageCode = "es") {
  return VOICE_REFERENCE_TEXTS[language] ?? VOICE_REFERENCE_TEXTS.es;
}
