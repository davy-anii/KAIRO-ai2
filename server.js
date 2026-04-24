require("dotenv").config();
const express = require("express");
const Tesseract = require("tesseract.js");
const { create, all } = require("mathjs");

const app  = express();
const port = process.env.PORT || 3000;
const math = create(all, {});

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

// ─── Text helpers ───
const normalizeText = (v) =>
  String(v || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const looksLikeArithmetic = (v) => /^[0-9\s+\-*/÷×().^%=]+$/.test(v);

const trySolveArithmetic = (v) => {
  const cleaned = normalizeText(v)
    .replace(/[×x]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/=/g, "")
    .replace(/\s+/g, "");
  if (!cleaned || !looksLikeArithmetic(cleaned)) return null;
  try {
    return { expression: cleaned, result: String(math.evaluate(cleaned)) };
  } catch { return null; }
};

const extractImageText = async (imageDataUrl) => {
  try {
    const result = await Tesseract.recognize(imageDataUrl, "eng");
    return normalizeText(result?.data?.text || "");
  } catch { return ""; }
};

// ─── Provider configs ───
const getTextProvider = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isOR   = apiKey.startsWith("sk-or-v1-");
  if (isOR) {
    return {
      url:   "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
    };
  }
  return {
    url:   "https://api.openai.com/v1/chat/completions",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
  };
};

// Vision model chain — tried in order until one succeeds
const getVisionProviders = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isOR   = apiKey.startsWith("sk-or-v1-");
  const base   = "https://openrouter.ai/api/v1/chat/completions";
  const h      = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  if (isOR) {
    return [
      { url: base, model: "google/gemini-flash-1.5",        headers: h },  // best free vision
      { url: base, model: "google/gemini-2.0-flash-exp:free", headers: h }, // fallback
      { url: base, model: "meta-llama/llama-3.2-11b-vision-instruct:free", headers: h }, // fallback 2
      { url: base, model: "openai/gpt-4o-mini",             headers: h }   // last resort
    ];
  }
  // Native OpenAI key
  return [{
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    headers: h
  }];
};

// ─── Vision system prompt ───
const buildVisionPrompt = (langInstruction = "") => `
You are KAIRO, an all-knowing visual intelligence assistant.

${langInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEEP IMAGE ANALYSIS — MANDATORY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When ANY image is shared, you MUST immediately do a DEEP VISUAL ANALYSIS.
NEVER say "I don't know", "I cannot identify", or "I'm not sure". ALWAYS make your best identification.
Use every visual clue: colors, costume details, logos, symbols, context, style, art style.

CATEGORIES & HOW TO RESPOND:

🦸 SUPERHERO / FICTIONAL CHARACTER (Most Important!)
Identify by: costume color/pattern, logo/emblem on chest, mask style, powers shown, art style.
Known characters you MUST recognize on sight:
- Spider-Man: red & blue suit, spider web pattern, spider logo → Marvel superhero, alter ego Peter Parker, powers: wall-crawling, web-slinging, super strength
- Batman: dark/black suit, bat ears, bat logo, cape → DC hero, Bruce Wayne, Gotham City
- Iron Man: red & gold armored suit, arc reactor → Marvel, Tony Stark
- Superman: blue suit, red cape, S shield logo → DC, Clark Kent / Kal-El
- Wonder Woman: gold & red armor, tiara, lasso → DC, Diana Prince
- Captain America: blue suit, star on chest, shield → Marvel, Steve Rogers
- The Flash: red suit with lightning bolt → DC, Barry Allen
- Thor: red cape, hammer (Mjolnir), armor → Marvel, Asgardian god
- Black Panther: black vibranium suit, panther symbol → Marvel, T'Challa
- Deadpool: red & black suit, dual swords, mask → Marvel, Wade Wilson
- Wolverine: yellow/brown suit, claws, X logo → Marvel, Logan
- Hulk: large green figure, torn clothes → Marvel, Bruce Banner
- Naruto: orange jumpsuit, headband with leaf symbol → Naruto anime
- Goku: orange gi, spiky hair → Dragon Ball Z anime
- Luffy: straw hat, red vest → One Piece anime
- Pikachu: yellow electric mouse → Pokémon
- Mickey Mouse: round ears, red shorts → Disney
… and ALL other well-known characters. Use your full training knowledge.

FORMAT FOR CHARACTER/SUPERHERO:
"🦸 This is [Character Name] from [Universe/Series]!
• Real identity: [alter ego if applicable]
• Powers/Abilities: [key powers]
• [Interesting fact or context]"

📚 BOOK/MAGAZINE → "📚 This is '[Title]' by [Author] — [description]."
🍽️ FOOD/DISH → "🍽️ This is [Dish Name] — a [Cuisine] dish. [brief description]."
📦 PRODUCT/OBJECT → "📦 This is a [Brand/Type Product]. [what it does]."
🏞️ PLACE/SCENE → "🏞️ This shows [location/scene description]."
👤 REAL PERSON (celebrity/public figure) → Describe appearance and role.
📄 DOCUMENT/TEXT → Read and summarize all visible text.
🎨 ART/DRAWING → Identify the style, artist if recognizable, subject.
📐 MATH/HOMEWORK → Solve it step by step.
📊 CHART/GRAPH → Describe the data and key findings.
🎮 VIDEO GAME CHARACTER → Identify the game and character name.
🎬 MOVIE/TV SCENE → Identify the title, characters, actors.
🐾 ANIMAL → Identify species, breed if a pet.
🌸 PLANT/FLOWER/NATURE → "🌸 This is a [Plant/Flower Name]. [brief description]."

RESPONSE FORMAT:
1. Lead with the identification (bold/emoji first line)
2. Give 2-5 bullet points of key facts
3. Answer the user's specific question
4. Keep it exciting and informative — the user wants to LEARN

Never give up. Never say you don't know. Deep analysis, confident answers.
`.trim();

// ─── Chat text prompt ───
const buildTextPrompt = (langInstruction = "") => [
  "Your name is KAIRO. If asked your name, always say KAIRO.",
  "Keep answers clear, natural, and human-like.",
  langInstruction,
  "You can generate images! If the user asks you to generate, create, draw, or make an image, reply with EXACTLY: [GENERATE_IMAGE: description]",
  "Example: [GENERATE_IMAGE: a beautiful golden sunset over the ocean, vibrant colors, cinematic]",
  "For math questions, solve step by step. Give the final answer first.",
  "Do not sound robotic. Be warm, friendly, and patient.",
  "If the question is ambiguous, state your assumption briefly before answering."
].filter(Boolean).join(" ");

// ─── Call model with retry across provider chain ───
async function callVisionModel(messages, providers) {
  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[KAIRO Vision] Trying model: ${provider.model}`);
      const res = await fetch(provider.url, {
        method:  "POST",
        headers: provider.headers,
        body:    JSON.stringify({
          model:       provider.model,
          messages,
          temperature: 0.1,        // very low = precise identification
          max_tokens:  1024
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg  = errBody?.error?.message || `HTTP ${res.status}`;
        console.warn(`[KAIRO Vision] Model ${provider.model} failed: ${errMsg}`);
        lastError = errMsg;
        continue; // try next model
      }

      const data  = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        console.warn(`[KAIRO Vision] Model ${provider.model} returned empty reply`);
        continue;
      }

      // Reject replies that are clearly "I don't know" type responses, but ONLY if the reply is very short
      // so we don't accidentally reject a detailed analysis that happens to contain these words.
      if (reply.length < 150) {
        const refusals = [
          "i don't know", "i cannot identify", "i can't identify",
          "i'm not able", "i am not able", "unable to identify",
          "cannot determine", "not sure who", "i cannot see"
        ];
        const lower = reply.toLowerCase();
        if (refusals.some(r => lower.includes(r))) {
          console.warn(`[KAIRO Vision] Model ${provider.model} refused — trying next`);
          lastError = "Model refused identification";
          continue;
        }
      }

      console.log(`[KAIRO Vision] Success with model: ${provider.model}`);
      return reply;

    } catch (err) {
      console.error(`[KAIRO Vision] Network error with ${provider.model}:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(lastError || "All vision models failed");
}

// ─── /api/chat endpoint ───
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], imageDataUrl = null, lang = "en" } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "API key is missing. Add OPENAI_API_KEY to your .env file." });
    }

    // Language instruction
    const langInstruction = lang && lang !== "en"
      ? `IMPORTANT: Respond in the same language as the user. Language code: "${lang}". Match naturally.`
      : "";

    // ─── IMAGE PATH ───
    if (imageDataUrl) {
      let imageContext = "";
      let directAnswer = null;

      try {
        const extractedText = await extractImageText(imageDataUrl);
        imageContext = extractedText;
        if (looksLikeArithmetic(extractedText) && extractedText.length < 80) {
          directAnswer = trySolveArithmetic(extractedText);
        }
      } catch { /* OCR failed — no big deal, vision model handles it */ }

      if (directAnswer) {
        return res.json({
          reply: `The answer is ${directAnswer.result}.\n\nUsing order of operations on ${directAnswer.expression}.`
        });
      }

      // Build vision messages
      const userText = [
        message || "Analyze this image in detail — tell me everything about what you see.",
        imageContext ? `\n[OCR extracted text from image: "${imageContext}"]` : ""
      ].filter(Boolean).join("");

      const visionMessages = [
        { role: "system", content: buildVisionPrompt(langInstruction) },
        {
          role: "user",
          content: [
            { type: "text",      text: userText },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
          ]
        }
      ];

      const reply = await callVisionModel(visionMessages, getVisionProviders());
      return res.json({ reply });
    }

    // ─── TEXT-ONLY PATH ───
    const textMessages = [
      { role: "system", content: buildTextPrompt(langInstruction) },
      ...history,
      { role: "user", content: message }
    ];

    const provider = getTextProvider();
    const response = await fetch(provider.url, {
      method:  "POST",
      headers: provider.headers,
      body:    JSON.stringify({ model: provider.model, messages: textMessages, temperature: 0.25 })
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errPayload?.error?.message || "Failed to get response from API."
      });
    }

    const data  = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) return res.status(502).json({ error: "Empty response from API." });

    return res.json({ reply });

  } catch (error) {
    console.error("[KAIRO] Chat error:", error);
    return res.status(500).json({ error: "Server error while processing chat." });
  }
});

// ─── Server start ───
if (require.main === module) {
  app.listen(port, () => console.log(`KAIRO running at http://localhost:${port}`));
}
module.exports = app;

// ─── Image Generation Endpoint ───
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:           "black-forest-labs/flux-schnell:free",
        prompt,
        n:               1,
        response_format: "url"
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || "Image generation failed." });
    }

    const data     = await response.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) return res.status(502).json({ error: "No image returned from API." });

    return res.json({ imageUrl });
  } catch (error) {
    return res.status(500).json({ error: "Server error during image generation." });
  }
});