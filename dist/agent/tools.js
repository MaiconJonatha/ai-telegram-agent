"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastProvider = getLastProvider;
exports.generateWithProvider = generateWithProvider;
exports.generateResponse = generateResponse;
exports.transcribeAudio = transcribeAudio;
exports.generateImage = generateImage;
exports.generateVideo = generateVideo;
exports.searchImages = searchImages;
exports.getCurrentTime = getCurrentTime;
exports.getProviderStatus = getProviderStatus;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const openai_1 = __importDefault(require("openai"));
// Groq API (rápido, grátis)
const groq = new groq_sdk_1.default({
    apiKey: process.env.GROQ_API_KEY || "",
});
// OpenRouter (fallback, múltiplos modelos)
const openrouter = new openai_1.default({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
});
// Google Gemini (grátis, 15 req/min)
const gemini = new openai_1.default({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GEMINI_API_KEY || "",
});
// Hugging Face Inference (grátis, milhares de modelos)
const huggingface = new openai_1.default({
    baseURL: "https://api-inference.huggingface.co/v1",
    apiKey: process.env.HF_API_KEY || "",
});
// Cohere (grátis trial, 5 req/min)
const cohere = new openai_1.default({
    baseURL: "https://api.cohere.com/compatibility/v1",
    apiKey: process.env.COHERE_API_KEY || "",
});
// DeepSeek (chinesa, grátis créditos iniciais, muito forte)
const deepseek = new openai_1.default({
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
});
// SiliconFlow (chinesa, grátis, Qwen/GLM/DeepSeek)
const siliconflow = new openai_1.default({
    baseURL: "https://api.siliconflow.cn/v1",
    apiKey: process.env.SILICONFLOW_API_KEY || "",
});
// Rastrear qual provedor respondeu por último
let lastProvider = "nenhum";
function getLastProvider() { return lastProvider; }
// Gerar resposta com um provedor ESPECÍFICO (pra debates entre IAs)
async function generateWithProvider(provider, messages, systemPrompt) {
    const fullMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
    ];
    const providers = {
        groq: { client: groq, model: "llama-3.3-70b-versatile", name: "🦙 Llama (Groq)" },
        gemini: { client: gemini, model: "gemini-2.0-flash", name: "💎 Gemini (Google)" },
        deepseek: { client: deepseek, model: "deepseek-chat", name: "🐋 DeepSeek" },
        cohere: { client: cohere, model: "command-r-plus", name: "🌊 Command R+ (Cohere)" },
        openrouter: { client: openrouter, model: "google/gemma-3-27b-it:free", name: "🌐 Gemma (OpenRouter)" },
    };
    const p = providers[provider];
    if (!p)
        throw new Error(`Provedor ${provider} não encontrado`);
    try {
        const response = await p.client.chat.completions.create({
            model: p.model,
            messages: fullMessages,
            max_tokens: 512,
            temperature: 0.9,
        });
        const text = response.choices[0]?.message?.content;
        if (text)
            return { text, name: p.name };
    }
    catch (e) {
        console.log(`[${p.name}] Erro:`, e.message);
    }
    throw new Error(`${p.name} falhou`);
}
async function generateResponse(messages, systemPrompt) {
    const fullMessages = [
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
            if (text) {
                lastProvider = "Groq/Llama-3.3-70B";
                console.log(`[${lastProvider}] OK`);
                return text;
            }
        }
        catch (e) {
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
            if (text) {
                lastProvider = "Groq/Llama-3.1-8B";
                console.log(`[${lastProvider}] OK`);
                return text;
            }
        }
        catch (e) {
            console.log("[Groq-8B] Erro:", e.message);
        }
    }
    // 3. Google Gemini (grátis, 15 req/min)
    if (process.env.GEMINI_API_KEY) {
        const geminiModels = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
        ];
        for (const model of geminiModels) {
            try {
                const response = await gemini.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                    temperature: 0.7,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `Gemini/${model}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[Gemini/${model}] Erro:`, e.message);
            }
        }
    }
    // 4. Hugging Face Inference (grátis)
    if (process.env.HF_API_KEY) {
        const hfModels = [
            "meta-llama/Llama-3.1-70B-Instruct",
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
            "microsoft/Phi-3-mini-4k-instruct",
        ];
        for (const model of hfModels) {
            try {
                const response = await huggingface.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                    temperature: 0.7,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `HuggingFace/${model.split("/")[1]}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[HF/${model}] Erro:`, e.message);
            }
        }
    }
    // 5. Cohere (grátis trial)
    if (process.env.COHERE_API_KEY) {
        try {
            const response = await cohere.chat.completions.create({
                model: "command-r-plus",
                messages: fullMessages,
                max_tokens: 1024,
                temperature: 0.7,
            });
            const text = response.choices[0]?.message?.content;
            if (text) {
                lastProvider = "Cohere/Command-R+";
                console.log(`[${lastProvider}] OK`);
                return text;
            }
        }
        catch (e) {
            console.log("[Cohere] Erro:", e.message);
        }
    }
    // 6. DeepSeek (chinesa, muito forte em código e raciocínio)
    if (process.env.DEEPSEEK_API_KEY) {
        const dsModels = ["deepseek-chat", "deepseek-reasoner"];
        for (const model of dsModels) {
            try {
                const response = await deepseek.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                    temperature: 0.7,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `DeepSeek/${model}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[DeepSeek/${model}] Erro:`, e.message);
            }
        }
    }
    // 7. SiliconFlow (chinesa, Qwen + GLM + DeepSeek grátis)
    if (process.env.SILICONFLOW_API_KEY) {
        const sfModels = [
            "Qwen/Qwen2.5-72B-Instruct",
            "deepseek-ai/DeepSeek-V3",
            "THUDM/glm-4-9b-chat",
            "01-ai/Yi-1.5-34B-Chat",
        ];
        for (const model of sfModels) {
            try {
                const response = await siliconflow.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                    temperature: 0.7,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `SiliconFlow/${model.split("/")[1]}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[SiliconFlow/${model}] Erro:`, e.message);
            }
        }
    }
    // 8. OpenRouter modelos gratuitos
    if (process.env.OPENROUTER_API_KEY) {
        const freeModels = [
            "google/gemma-3-12b-it:free",
            "google/gemma-3-27b-it:free",
            "mistralai/mistral-small-3.1-24b-instruct:free",
        ];
        for (const model of freeModels) {
            try {
                const response = await openrouter.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `OpenRouter/${model.replace(":free", "")}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[${model}] Erro:`, e.message);
            }
        }
    }
    // 9. OpenRouter pagos (Claude + Gemini) - quando tiver créditos
    if (process.env.OPENROUTER_API_KEY) {
        for (const model of ["anthropic/claude-opus-4", "google/gemini-2.5-pro"]) {
            try {
                const response = await openrouter.chat.completions.create({
                    model,
                    messages: fullMessages,
                    max_tokens: 1024,
                });
                const text = response.choices[0]?.message?.content;
                if (text) {
                    lastProvider = `OpenRouter/${model}`;
                    console.log(`[${lastProvider}] OK`);
                    return text;
                }
            }
            catch (e) {
                console.log(`[${model}] Erro:`, e.message);
            }
        }
    }
    lastProvider = "nenhum";
    return "Todos os provedores estão temporariamente indisponíveis. Tente novamente em alguns minutos.";
}
async function transcribeAudio(buffer) {
    // 1. Groq Whisper (grátis)
    if (process.env.GROQ_API_KEY) {
        try {
            const file = new File([new Uint8Array(buffer)], "audio.ogg", { type: "audio/ogg" });
            const response = await groq.audio.transcriptions.create({
                file,
                model: "whisper-large-v3",
                language: "pt",
            });
            if (response.text) {
                console.log("[Whisper/Groq] OK");
                return response.text;
            }
        }
        catch (e) {
            console.log("[Whisper] Erro:", e.message);
        }
    }
    // 2. Hugging Face Whisper (fallback grátis)
    if (process.env.HF_API_KEY) {
        try {
            const res = await fetch("https://api-inference.huggingface.co/models/openai/whisper-large-v3", {
                method: "POST",
                headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
                body: buffer,
            });
            const data = await res.json();
            if (data.text) {
                console.log("[Whisper/HuggingFace] OK");
                return data.text;
            }
        }
        catch (e) {
            console.log("[Whisper/HF] Erro:", e.message);
        }
    }
    return "";
}
async function generateImage(prompt) {
    // 0. ImageFX Server Local (via Cloudflare Tunnel)
    if (process.env.IMAGEFX_SERVER_URL) {
        try {
            console.log(`[IMG/ImageFX] Gerando via servidor local: ${prompt.substring(0, 50)}...`);
            const res = await fetch(`${process.env.IMAGEFX_SERVER_URL}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    token: process.env.IMAGEFX_TOKEN || "opencrawsbuties2026",
                }),
                signal: AbortSignal.timeout(120000),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.images?.[0]) {
                    const buf = Buffer.from(data.images[0], "base64");
                    if (buf.length > 1000) {
                        console.log(`[IMG/ImageFX] OK! ${buf.length} bytes`);
                        return buf;
                    }
                }
            }
        }
        catch (e) {
            console.log("[IMG/ImageFX] Erro:", e.message);
        }
    }
    // 1. Gemini 2.5 Flash Image (grátis, gera imagens nativas)
    if (process.env.GEMINI_API_KEY) {
        try {
            console.log(`[IMG/Gemini] Gerando: ${prompt.substring(0, 50)}...`);
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
                    generationConfig: { responseModalities: ["IMAGE"] },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const parts = data.candidates?.[0]?.content?.parts || [];
                const imgPart = parts.find((p) => p.inlineData);
                if (imgPart?.inlineData?.data) {
                    console.log("[IMG/Gemini] OK!");
                    return Buffer.from(imgPart.inlineData.data, "base64");
                }
            }
        }
        catch (e) {
            console.log("[IMG/Gemini] Erro:", e.message);
        }
    }
    // 2. Pollinations.ai (grátis, sem chave, rápido)
    try {
        console.log(`[IMG/Pollinations] Gerando: ${prompt.substring(0, 50)}...`);
        const encodedPrompt = encodeURIComponent(prompt + ", high quality, detailed");
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`;
        const res = await fetch(url);
        if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);
            if (buf.length > 1000) {
                console.log("[IMG/Pollinations] OK!");
                return buf;
            }
        }
    }
    catch (e) {
        console.log("[IMG/Pollinations] Erro:", e.message);
    }
    // 2. Hugging Face (Stable Diffusion grátis)
    if (process.env.HF_API_KEY) {
        try {
            console.log(`[IMG/HuggingFace] Gerando: ${prompt.substring(0, 50)}...`);
            const res = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ inputs: prompt + ", high quality, detailed, 4k" }),
            });
            if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                const buf = Buffer.from(arrayBuffer);
                if (buf.length > 1000) {
                    console.log("[IMG/HuggingFace] OK!");
                    return buf;
                }
            }
        }
        catch (e) {
            console.log("[IMG/HF] Erro:", e.message);
        }
    }
    // 3. Stable Horde (grátis, anonymous key - mais lento)
    try {
        console.log(`[IMG/StableHorde] Gerando: ${prompt.substring(0, 50)}...`);
        const res = await fetch("https://stablehorde.net/api/v2/generate/async", {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: "0000000000" },
            body: JSON.stringify({
                prompt: prompt + ", high quality, detailed, 4k",
                params: { width: 512, height: 512, steps: 25 },
                models: ["AlbedoBase XL (SDXL)"],
            }),
        });
        const data = await res.json();
        const id = data.id;
        if (!id) {
            console.log("[IMG/Horde] Sem ID:", JSON.stringify(data));
            return null;
        }
        // Poll for result (max 2 min)
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`);
            const status = await check.json();
            if (status.done)
                break;
            if (i % 4 === 0)
                console.log(`[IMG/Horde] Aguardando... ${i * 5}s`);
        }
        const result = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`);
        const final = await result.json();
        if (final.generations?.[0]?.img) {
            const imgData = final.generations[0].img;
            console.log("[IMG/StableHorde] OK!");
            return Buffer.from(imgData, "base64");
        }
        console.log("[IMG/Horde] Sem imagem no resultado");
        return null;
    }
    catch (e) {
        console.log("[IMG/Horde] Erro:", e.message);
        return null;
    }
}
async function generateVideo(prompt) {
    // 0. Google Flow via Playwright (labs.google/fx/tools/flow)
    try {
        const { generateFlowVideo } = await Promise.resolve().then(() => __importStar(require("./flow")));
        console.log(`[VID/Flow] Tentando Google Flow...`);
        const flowResult = await generateFlowVideo(prompt);
        if (flowResult && flowResult.length > 1000) {
            console.log("[VID/Flow] OK!");
            return flowResult;
        }
    }
    catch (e) {
        console.log("[VID/Flow] Erro:", e.message);
    }
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
        console.log("[VID] Sem GEMINI_API_KEY");
        return null;
    }
    try {
        console.log(`[VID/Gemini-Veo] Gerando: ${prompt.substring(0, 50)}...`);
        // 1. Iniciar geração
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                instances: [{ prompt: prompt }],
                parameters: {
                    aspectRatio: "16:9",
                    durationSeconds: 8,
                    personGeneration: "allow_adult",
                },
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            console.log("[VID/Veo] Erro ao iniciar:", err);
            return null;
        }
        const data = await res.json();
        const operationName = data.name;
        if (!operationName) {
            console.log("[VID/Veo] Sem operation name:", JSON.stringify(data));
            return null;
        }
        // 2. Poll for completion (max 3 min)
        for (let i = 0; i < 36; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_KEY}`);
            const status = await check.json();
            if (status.done) {
                // Extrair vídeo
                const videoB64 = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.bytesBase64Encoded;
                if (videoB64) {
                    console.log("[VID/Gemini-Veo] OK!");
                    return Buffer.from(videoB64, "base64");
                }
                // Pode ter URI em vez de base64
                const videoUri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
                if (videoUri) {
                    console.log(`[VID/Veo] Baixando de URI...`);
                    const vidRes = await fetch(videoUri);
                    if (vidRes.ok) {
                        const buf = Buffer.from(await vidRes.arrayBuffer());
                        if (buf.length > 1000) {
                            console.log("[VID/Gemini-Veo] OK via URI!");
                            return buf;
                        }
                    }
                }
                console.log("[VID/Veo] Sem vídeo no resultado:", JSON.stringify(status).substring(0, 200));
                return null;
            }
            if (i % 6 === 0)
                console.log(`[VID/Veo] Aguardando... ${i * 5}s`);
        }
        console.log("[VID/Veo] Timeout");
        return null;
    }
    catch (e) {
        console.log("[VID/Veo] Erro:", e.message);
        return null;
    }
}
// Buscar imagens no Google (via scraping)
async function searchImages(query, count = 3) {
    const urls = [];
    // 1. Tentar Google Custom Search (se configurado)
    if (process.env.GEMINI_API_KEY) {
        try {
            const q = encodeURIComponent(query);
            const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${process.env.GEMINI_API_KEY}&cx=014635489189399665498:aapetswkbym&q=${q}&searchType=image&num=${count}`);
            if (res.ok) {
                const data = await res.json();
                if (data.items) {
                    data.items.forEach((i) => urls.push(i.link));
                    if (urls.length > 0) {
                        console.log(`[SEARCH/Google] ${urls.length} imagens encontradas`);
                        return urls;
                    }
                }
            }
        }
        catch (e) {
            console.log("[SEARCH/Google] Erro:", e.message);
        }
    }
    // 2. DuckDuckGo (grátis, sem chave)
    try {
        const q = encodeURIComponent(query);
        // Pegar vqd token
        const tokenRes = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`);
        const tokenHtml = await tokenRes.text();
        const vqdMatch = tokenHtml.match(/vqd=([\d-]+)/);
        if (vqdMatch) {
            const vqd = vqdMatch[1];
            const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${q}&o=json&p=1&s=0&u=bing&f=,,,,,&l=br-pt&vqd=${vqd}`);
            if (imgRes.ok) {
                const imgData = await imgRes.json();
                const results = imgData.results?.slice(0, count) || [];
                results.forEach((r) => { if (r.image)
                    urls.push(r.image); });
                if (urls.length > 0) {
                    console.log(`[SEARCH/DuckDuckGo] ${urls.length} imagens encontradas`);
                    return urls;
                }
            }
        }
    }
    catch (e) {
        console.log("[SEARCH/DDG] Erro:", e.message);
    }
    // 3. Fallback: gerar com Pollinations
    try {
        const encoded = encodeURIComponent(query + ", high quality, detailed");
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true`;
        urls.push(url);
        console.log("[SEARCH/Fallback] Usando Pollinations como fallback");
    }
    catch { }
    return urls;
}
function getCurrentTime() {
    return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
// Lista de todos os provedores configurados
function getProviderStatus() {
    const providers = [];
    if (process.env.GROQ_API_KEY)
        providers.push("✅ Groq (Llama 3.3 70B, Llama 3.1 8B)");
    else
        providers.push("❌ Groq (sem GROQ_API_KEY)");
    if (process.env.GEMINI_API_KEY)
        providers.push("✅ Google Gemini (Flash 2.0, Veo 3.0 vídeo)");
    else
        providers.push("❌ Google Gemini (sem GEMINI_API_KEY)");
    if (process.env.HF_API_KEY)
        providers.push("✅ Hugging Face (Llama 70B, Mixtral, Phi-3, Whisper, SDXL)");
    else
        providers.push("❌ Hugging Face (sem HF_API_KEY)");
    if (process.env.COHERE_API_KEY)
        providers.push("✅ Cohere (Command R+)");
    else
        providers.push("❌ Cohere (sem COHERE_API_KEY)");
    if (process.env.DEEPSEEK_API_KEY)
        providers.push("✅ DeepSeek 🇨🇳 (DeepSeek-Chat, DeepSeek-Reasoner)");
    else
        providers.push("❌ DeepSeek (sem DEEPSEEK_API_KEY)");
    if (process.env.SILICONFLOW_API_KEY)
        providers.push("✅ SiliconFlow 🇨🇳 (Qwen 72B, DeepSeek V3, GLM-4, Yi-34B)");
    else
        providers.push("❌ SiliconFlow (sem SILICONFLOW_API_KEY)");
    if (process.env.OPENROUTER_API_KEY)
        providers.push("✅ OpenRouter (Gemma, Mistral, Claude, Gemini Pro)");
    else
        providers.push("❌ OpenRouter (sem OPENROUTER_API_KEY)");
    providers.push("✅ Pollinations.ai (imagens, sem chave)");
    providers.push("✅ Stable Horde (imagens, sem chave)");
    return providers;
}
//# sourceMappingURL=tools.js.map