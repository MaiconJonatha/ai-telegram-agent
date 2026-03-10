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
        max_tokens: 1024,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) { console.log("[Groq/Llama] OK"); return text; }
    } catch (e: any) {
      console.log("[Groq] Erro:", e.message);
    }
  }

  // 2. Groq Llama 8B (menor, mais tokens/dia)
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: fullMessages,
        max_tokens: 1024,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) { console.log("[Groq/Llama-8B] OK"); return text; }
    } catch (e: any) {
      console.log("[Groq-8B] Erro:", e.message);
    }
  }

  // 3. OpenRouter modelos gratuitos (não precisa créditos)
  if (process.env.OPENROUTER_API_KEY) {
    const freeModels = [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-235b-a22b:free",
    ];
    for (const model of freeModels) {
      try {
        const response = await openrouter.chat.completions.create({
          model,
          messages: fullMessages,
          max_tokens: 1024,
        });
        const text = response.choices[0]?.message?.content;
        if (text) { console.log(`[OpenRouter/${model}] OK`); return text; }
      } catch (e: any) {
        console.log(`[${model}] Erro:`, e.message);
      }
    }
  }

  // 4. OpenRouter pagos (Claude + Gemini) - quando tiver créditos
  if (process.env.OPENROUTER_API_KEY) {
    for (const model of ["anthropic/claude-opus-4", "google/gemini-2.5-pro"]) {
      try {
        const response = await openrouter.chat.completions.create({
          model,
          messages: fullMessages,
          max_tokens: 1024,
        });
        const text = response.choices[0]?.message?.content;
        if (text) { console.log(`[${model}] OK`); return text; }
      } catch (e: any) {
        console.log(`[${model}] Erro:`, e.message);
      }
    }
  }

  return "Todos os provedores estão temporariamente indisponíveis. Tente novamente em alguns minutos.";
}

export function getCurrentTime(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
