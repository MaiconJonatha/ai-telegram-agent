/**
 * Geração de imagens e vídeos via APIs do Google (Gemini).
 * Sem Playwright - usa APIs REST diretamente.
 */

// ========== IMAGEM via Gemini ==========

export async function generateFlowImage(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log("[Flow/IMG] Sem GEMINI_API_KEY"); return null; }

  // 1. Gemini 2.5 Flash Image (gera imagens nativas)
  try {
    console.log(`[Flow/IMG] Gemini: ${prompt.substring(0, 50)}...`);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json() as any;
      const img = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (img?.inlineData?.data) {
        console.log("[Flow/IMG] Gemini OK!");
        return Buffer.from(img.inlineData.data, "base64");
      }
    } else {
      const err = await res.text();
      console.log("[Flow/IMG] Gemini erro:", err.substring(0, 150));
    }
  } catch (e: any) {
    console.log("[Flow/IMG] Gemini erro:", e.message);
  }

  // 2. Pollinations (grátis, sem chave)
  try {
    console.log(`[Flow/IMG] Pollinations: ${prompt.substring(0, 50)}...`);
    const encoded = encodeURIComponent(prompt + ", high quality, detailed");
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;
    const res = await fetch(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1000) {
        console.log("[Flow/IMG] Pollinations OK!");
        return buf;
      }
    }
  } catch (e: any) {
    console.log("[Flow/IMG] Pollinations erro:", e.message);
  }

  return null;
}

// ========== VÍDEO via Gemini Veo ==========

export async function generateFlowVideo(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log("[Flow/VID] Sem GEMINI_API_KEY"); return null; }

  try {
    console.log(`[Flow/VID] Veo 3.0: ${prompt.substring(0, 50)}...`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: "16:9", durationSeconds: 8, personGeneration: "allow_adult" },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.log("[Flow/VID] Veo erro:", err.substring(0, 150));
      return null;
    }

    const data = await res.json() as any;
    const op = data.name;
    if (!op) { console.log("[Flow/VID] Sem operation name"); return null; }

    // Poll (max 3 min)
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`);
      const status = await check.json() as any;

      if (status.done) {
        const b64 = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.bytesBase64Encoded;
        if (b64) { console.log("[Flow/VID] Veo OK!"); return Buffer.from(b64, "base64"); }

        const uri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (uri) {
          const r = await fetch(uri);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length > 1000) { console.log("[Flow/VID] Veo OK via URI!"); return buf; }
          }
        }
        return null;
      }

      if (i % 6 === 0) console.log(`[Flow/VID] Aguardando... ${i * 5}s`);
    }

    console.log("[Flow/VID] Timeout");
    return null;
  } catch (e: any) {
    console.log("[Flow/VID] Erro:", e.message);
    return null;
  }
}
