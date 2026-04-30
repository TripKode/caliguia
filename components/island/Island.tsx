"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LANGUAGES, type LanguageCode, useExperience } from "../providers/ExperienceProvider";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

interface AIFloatingIslandProps {
  /** Context to inject into the system prompt (e.g. current location, zona, negocios) */
  context?: string;
}

// ─── Voice bar heights — animates while "speaking" ─────────────────────────
const BAR_COUNT = 5;
// ─── Component ─────────────────────────────────────────────────────────────
export function AIFloatingIsland({ context }: AIFloatingIslandProps) {
  const { experienceMode, language, setLanguage, toggleExperienceMode } = useExperience();
  const [isSpeaking, setIsSpeaking] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(4));
  const [showMenu, setShowMenu] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Bar animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMuted || !isSpeaking) {
      setBarHeights(Array(BAR_COUNT).fill(3));
      return;
    }

    const animate = () => {
      setBarHeights(
        Array.from({ length: BAR_COUNT }, (_, i) => {
          const base = 4;
          const amplitude = i === 2 ? 18 : i === 1 || i === 3 ? 14 : 9;
          return base + Math.abs(Math.sin(Date.now() / (120 + i * 30))) * amplitude;
        })
      );
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isSpeaking, isMuted]);

  // ── Show input → focus ────────────────────────────────────────────────────
  useEffect(() => {
    if (showInput) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showInput]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text, id: crypto.randomUUID() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue("");
    setIsLoading(true);
    setIsSpeaking(false);

    const systemPrompt = `Eres un asistente de navegación urbana para la ciudad de Cali, Colombia. 
Eres conciso, amigable y útil. ${LANGUAGES[language].instruction} 
Máximo 2 oraciones por respuesta a menos que el usuario pida más detalle.
${context ? `\nContexto actual del usuario:\n${context}` : ""}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const reply = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "Sin respuesta.";

      const assistantMsg: Message = { role: "assistant", content: reply, id: crypto.randomUUID() };
      setMessages(prev => [...prev, assistantMsg]);
      setIsSpeaking(true);

      // Simulate speaking duration based on text length
      const speakMs = Math.min(Math.max(reply.length * 55, 2000), 8000);
      setTimeout(() => setIsSpeaking(false), speakMs);
    } catch {
      const assistantMsg: Message = {
        role: "assistant",
        content: "Error de conexión. Intenta de nuevo.",
        id: crypto.randomUUID(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, messages, isLoading, context, language]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendMessage();
    if (e.key === "Escape") setShowInput(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="absolute left-1/2 top-2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none sm:top-3"
      style={{ width: "min(420px, calc(100vw - 32px))" }}
    >
      {/* ── Main island ── */}
      <div
        className="pointer-events-auto w-full"
        style={{
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(0,0,0,0.07)",
          borderRadius: "20px",
          padding: "10px 12px",
        }}
      >
        <div className="flex items-center gap-3">

          {/* Robot icon */}
          <div
            className="shrink-0 flex items-center justify-center rounded-[14px] transition-all duration-300"
            style={{
              width: 40, height: 40,
              background: isSpeaking && !isMuted
                ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)"
                : "rgba(241,245,249,1)",
              border: `1.5px solid ${isSpeaking && !isMuted ? "rgba(59,130,246,0.25)" : "rgba(0,0,0,0.06)"}`,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Antenna */}
              <line x1="12" y1="2" x2="12" y2="5" stroke={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="2" r="1.2" fill={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} />
              {/* Head */}
              <rect x="4" y="5" width="16" height="12" rx="3.5" fill={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} fillOpacity="0.12" />
              <rect x="4" y="5" width="16" height="12" rx="3.5" stroke={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.6" />
              {/* Eyes */}
              <circle cx="9" cy="11" r="1.8" fill={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} />
              <circle cx="15" cy="11" r="1.8" fill={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} />
              {/* Mouth */}
              <path d="M9 14.5 Q12 16 15 14.5" stroke={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.4" strokeLinecap="round" fill="none" />
              {/* Body connector */}
              <rect x="9" y="17" width="6" height="2" rx="1" fill={isSpeaking && !isMuted ? "#3b82f6" : "#94a3b8"} fillOpacity="0.4" />
            </svg>
          </div>

          {/* Voice bars */}
          <div className="flex items-center gap-[3px] flex-1" style={{ height: 28 }}>
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="rounded-full transition-none"
                style={{
                  width: 3,
                  height: `${h}px`,
                  background: isMuted
                    ? "#e2e8f0"
                    : isSpeaking
                      ? `rgba(59,130,246,${0.4 + (i === 2 ? 0.5 : i === 1 || i === 3 ? 0.35 : 0.2)})`
                      : "#e2e8f0",
                  transition: "height 60ms linear, background 300ms ease",
                  alignSelf: "center",
                }}
              />
            ))}
          </div>

          <div ref={menuRef} className="relative flex items-center gap-1.5 shrink-0">
            {/* Status label */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                {isLoading ? "Pensando" : isMuted ? "Silenciado" : isSpeaking ? "Hablando" : "Listo"}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isLoading ? "#f59e0b" : isSpeaking && !isMuted ? "#22c55e" : "#d1d5db",
                    animation: (isSpeaking && !isMuted) || isLoading ? "pulse 1.5s infinite" : "none",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMenu(open => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.06] bg-black/[0.04] transition-colors hover:bg-black/[0.06] md:hidden"
              title="Opciones"
              aria-label="Abrir opciones"
              aria-expanded={showMenu}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showMenu ? "#3b82f6" : "#6b7280"} strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 top-[calc(100%+12px)] z-50 w-56 rounded-2xl border border-black/[0.07] bg-white/95 p-3 shadow-xl shadow-zinc-900/10 backdrop-blur-xl md:hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      toggleExperienceMode();
                      setShowMenu(false);
                    }}
                    className={`mb-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                      experienceMode === "ar"
                        ? "border-blue-500/20 bg-blue-500/[0.08] text-blue-600"
                        : "border-black/[0.07] bg-zinc-50 text-zinc-700"
                    }`}
                  >
                    <span className="text-[12px] font-semibold">Realidad Aumentada</span>
                    <span
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        experienceMode === "ar" ? "bg-blue-500" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          experienceMode === "ar" ? "translate-x-[18px]" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>

                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="island-language" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Idioma
                    </label>
                    <select
                      id="island-language"
                      value={language}
                      onChange={event => setLanguage(event.target.value as LanguageCode)}
                      className="h-8 rounded-xl border border-black/[0.07] bg-zinc-50 px-2 text-[12px] font-semibold text-zinc-700 outline-none"
                    >
                      <option value="es">Español</option>
                      <option value="en">Inglés</option>
                      <option value="pt">Portugués</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0 ml-1">
            {/* Mute */}
            <button
              onClick={() => setIsMuted(m => !m)}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: isMuted ? "rgba(239,68,68,0.08)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${isMuted ? "rgba(239,68,68,0.18)" : "rgba(0,0,0,0.06)"}`,
              }}
              title={isMuted ? "Activar sonido" : "Silenciar"}
            >
              {isMuted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              )}
            </button>

            {/* Chat toggle */}
            <button
              onClick={() => setShowInput(s => !s)}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: showInput ? "rgba(59,130,246,0.10)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${showInput ? "rgba(59,130,246,0.22)" : "rgba(0,0,0,0.06)"}`,
              }}
              title="Abrir chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showInput ? "#3b82f6" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Expandable input ── */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: showInput ? "200px" : "0px",
            opacity: showInput ? 1 : 0,
            transition: "max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
          }}
        >
          {/* Recent messages (last 2) */}
          {messages.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5 max-h-[80px] overflow-y-auto px-0.5">
              {messages.slice(-4).map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[80%] px-3 py-1.5 rounded-2xl text-[11px] font-medium leading-relaxed"
                    style={{
                      background: m.role === "user" ? "#3b82f6" : "rgba(0,0,0,0.05)",
                      color: m.role === "user" ? "white" : "#374151",
                      borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div
            className="flex items-center gap-2 mt-3"
            style={{
              background: "rgba(0,0,0,0.04)",
              borderRadius: "12px",
              border: "1px solid rgba(0,0,0,0.07)",
              padding: "4px 4px 4px 12px",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pregúntale al agente..."
              className="flex-1 bg-transparent text-[12px] text-zinc-700 placeholder-zinc-400 outline-none font-medium"
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors shrink-0"
              style={{
                background: inputValue.trim() && !isLoading ? "#3b82f6" : "rgba(0,0,0,0.07)",
              }}
            >
              {isLoading ? (
                <div
                  className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white"
                  style={{ animation: "spin 0.7s linear infinite" }}
                />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={inputValue.trim() ? "white" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
