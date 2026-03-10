import Groq from "groq-sdk";
import OpenAI from "openai";

// Groq API (rápido, grátis)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

// OpenRouter (fallback, múltiplos modelos)
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

// Ollama local (fallback final)
const ollama = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function generateResponse(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // 1. Groq (Llama 3.3 70B) - mais rápido
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: fullMessages,
        max_tokens: 2048,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) { console.log("[Groq/Llama] OK"); return text; }
    } catch (e: any) {
      console.log("[Groq] Erro:", e.message);
    }
  }

  // 2. Claude (via OpenRouter) - inteligência máxima
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await openrouter.chat.completions.create({
        model: "anthropic/claude-opus-4",
        messages: fullMessages,
        max_tokens: 2048,
      });
      const text = response.choices[0]?.message?.content;
      if (text) { console.log("[Claude] OK"); return text; }
    } catch (e: any) {
      console.log("[Claude] Erro:", e.message);
    }
  }

  // 3. Gemini (via OpenRouter) - Google AI
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await openrouter.chat.completions.create({
        model: "google/gemini-2.5-pro",
        messages: fullMessages,
        max_tokens: 2048,
      });
      const text = response.choices[0]?.message?.content;
      if (text) { console.log("[Gemini] OK"); return text; }
    } catch (e: any) {
      console.log("[Gemini] Erro:", e.message);
    }
  }

  // 4. Ollama local (fallback final)
  try {
    const response = await ollama.chat.completions.create({
      model: "llama3.2:3b",
      messages: fullMessages,
      max_tokens: 2048,
    });
    return response.choices[0]?.message?.content || "Sem resposta.";
  } catch (e: any) {
    return `Erro em todos os provedores: ${e.message}`;
  }
}

export function getCurrentTime(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
