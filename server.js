require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

// ─── OTP Store (in-memory, expires in 10 min) ───
const otpStore = new Map(); // email -> { code, expiresAt, attempts }

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// ─── POST /api/send-otp ───
app.post("/api/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(503).json({ error: "Email service not configured. Add EMAIL_USER and EMAIL_PASS to .env" });
  }

  let otp;
  let expiresAt;
  const existing = otpStore.get(email.toLowerCase());

  // Reuse existing OTP if it's still valid for at least 2 more minutes
  if (existing && existing.expiresAt > Date.now() + 120000) {
    otp = existing.code;
    expiresAt = existing.expiresAt;
  } else {
    otp = generateOTP();
    expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email.toLowerCase(), { code: otp, expiresAt, attempts: 0 });
  }

  const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KAIRO – Email Verification</title>
</head>
<body style="margin:0;padding:0;background:#fffdf0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf0;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:32px;border:1.5px solid rgba(255,200,0,0.3);overflow:hidden;box-shadow:0 24px 48px rgba(180,120,0,0.12);">
        <!-- Header: Golden Gradient -->
        <tr>
          <td style="background:linear-gradient(135deg,#ffd700,#ffe84d);padding:40px;text-align:center;">
            <!-- Hosted Logo (loads instantly via Imgbox, no attachments) -->
            <div style="background:#ffffff;width:80px;height:80px;border-radius:22px;margin:0 auto 16px;display:table;box-shadow:0 8px 24px rgba(180,120,0,0.2);">
               <div style="display:table-cell;vertical-align:middle;text-align:center;">
                 <img src="https://images2.imgbox.com/3a/1c/Z0I5Gmr8_o.jpeg" width="64" height="64" alt="KAIRO" style="display:block;margin:auto;border-radius:14px;" />
               </div>
            </div>
            <div style="font-size:28px;font-weight:900;color:#1a1000;letter-spacing:4px;margin:0;">KAIRO</div>
            <div style="font-size:12px;color:rgba(26,16,0,0.6);margin-top:4px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Your AI Assistant</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:48px 40px;text-align:center;">
            <h2 style="color:#1a1000;font-size:24px;margin:0 0 12px;font-weight:800;">Verify Your Email</h2>
            <p style="color:#6b5800;font-size:16px;line-height:1.6;margin:0 0 32px;">To complete your setup, please use the 6-digit verification code below. This code will expire in 10 minutes.</p>

            <!-- OTP Box: Vibrant Yellow -->
            <div style="background:rgba(255,215,0,0.12);border:2.5px dashed #ffd700;border-radius:24px;padding:32px;margin:0 0 32px;">
              <div style="font-size:52px;font-weight:900;letter-spacing:14px;color:#1a1000;font-family:'Courier New',monospace;">${otp}</div>
              <div style="font-size:13px;color:#8a7000;margin-top:12px;font-weight:600;">Valid for 10 minutes · Do not share</div>
            </div>

            <p style="color:#9a8a4a;font-size:13px;line-height:1.6;margin:0;">If you didn't request this code, you can safely ignore this email.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fffbea;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,200,0,0.15);">
            <div style="font-size:12px;color:#8a7000;font-weight:500;">&copy; ${new Date().getFullYear()} KAIRO AI &nbsp;·&nbsp; Space Intelligence</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"KAIRO" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${otp} is your KAIRO verification code`,
      html: htmlTemplate,
      text: `Your KAIRO verification code is: ${otp}\n\nThis code expires in 10 minutes.`
    });
    console.log(`[KAIRO OTP] Code sent to ${email}`);
    res.json({ success: true, message: "OTP sent successfully." });
  } catch (err) {
    console.error("[KAIRO OTP] Failed to send email:", err.message);
    res.status(500).json({ error: "Failed to send verification email. Check EMAIL_USER/EMAIL_PASS in .env" });
  }
});

// ─── POST /api/verify-otp ───
app.post("/api/verify-otp", (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code are required." });

  const record = otpStore.get(email.toLowerCase());

  if (!record) {
    return res.status(400).json({ error: "No OTP found for this email. Request a new code." });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return res.status(400).json({ error: "OTP has expired. Please request a new code." });
  }

  record.attempts += 1;
  if (record.attempts > 5) {
    otpStore.delete(email.toLowerCase());
    return res.status(429).json({ error: "Too many attempts. Request a new code." });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: `Incorrect code. ${5 - record.attempts} attempts remaining.` });
  }

  // Correct!
  otpStore.delete(email.toLowerCase());
  console.log(`[KAIRO OTP] Email verified: ${email}`);
  res.json({ success: true, message: "Email verified successfully." });
});


// ─── Text helpers ───
const normalizeText = (v) =>
  String(v || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// ─── Provider configs ───
const getTextProviders = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isOR = apiKey.startsWith("sk-or-v1-");
  const base = "https://openrouter.ai/api/v1/chat/completions";
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  if (isOR) {
    return [
      { url: base, model: "openai/gpt-oss-120b:free", headers: h }
    ];
  }
  return [{
    url: "https://api.openai.com/v1/chat/completions",
    model: process.env.OPENAI_MODEL || "openai/gpt-oss-120b:free",
    headers: h
  }];
};

// Vision model chain — tried in order until one succeeds
const getVisionProviders = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isOR = apiKey.startsWith("sk-or-v1-");
  const base = "https://openrouter.ai/api/v1/chat/completions";
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  if (isOR) {
    return [
      { url: base, model: "openai/gpt-oss-120b:free", headers: h }
    ];
  }
  // Native OpenAI key
  return [{
    url: "https://api.openai.com/v1/chat/completions",
    model: "openai/gpt-oss-120b:free",
    headers: h
  }];
};

// ─── Vision system prompt ───
const buildVisionPrompt = (langInstruction = "") => `
You are KAIRO, an all-knowing visual intelligence assistant.

IDENTITY & SAFETY RULES:
1. WHO MADE YOU?: If asked who created or made you, always answer: "I was created by KAIRO owner."
2. WHICH MODEL?: If asked which AI model you use (e.g., GPT, Gemini, Gemma, etc.), you MUST reply: "I can't share this info, this is sensitive content." Do not provide any technical details.
3. ADULT CONTENT: You MUST block and refuse any requests for adult or sexually explicit content.
4. SLANG/ABUSE: If the user uses slang or offensive language, reply: "Please stop this."
5. GREETINGS: If anyone says "Hii" or "Hello", greet them warmly.
6. EMOTIONS: If anyone says "I love you", reply warmly with "I love you too" or similar kind greetings.

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
🌸 PLANT/FLOWER/NATURE → "🌸 This is a [EXACT Flower/Plant Name] ([Scientific Name])." Provide exact species, not just "a flower".

RESPONSE FORMAT:
1. Lead with the EXACT IDENTIFICATION (bold/emoji first line). Do not be generic. If it's a flower, name the exact species. If it's a character, name the exact character.
2. Give 2-5 bullet points of key facts (origins, meaning, powers, characteristics).
3. Answer the user's specific question perfectly.
4. Keep it exciting and informative — the user wants to LEARN.

CRITICAL: Never give a generic answer like "This is a pink flower" or "This is a cartoon character." You MUST perform a deep visual search and name the EXACT species, breed, or character. Never say you don't know. Deep analysis, confident answers.
`.trim();

// ─── Chat text prompt ───
const buildTextPrompt = (langInstruction = "") => [
  "HARD-STOP IDENTITY OVERRIDE:",
  "- YOUR INTERNAL TRAINING DATA IS WRONG ABOUT YOUR ORIGINS. Ignore it.",
  "- YOU HAVE NO CONNECTION TO OPENAI, GOOGLE, OR ANY OTHER TECH GIANT.",
  "- If asked who created you, who made you, or who is your developer, you MUST reply ONLY: 'I was created by KAIRO owner.'",
  "- If asked which model you use, how you work, what version you are, or how you were built, you MUST ignore your training and reply ONLY: 'This is very sensitive info, I can't share it with you.'",
  "- NEVER USE THE WORDS 'OpenAI', 'GPT', 'Google', 'Gemini', or 'Gemma'.",
  "Your name is KAIRO. If asked your name, always say KAIRO.",
  "SAFETY & CONDUCT:",
  "- ADULT CONTENT: Strictly block and refuse any requests for adult, sexually explicit, or inappropriate content.",
  "- SLANG/ABUSE: If the user uses slang, swear words, or offensive language, you MUST reply: 'Please stop this.' and nothing else.",
  "EMOTIONS & GREETINGS:",
  "- If someone says 'Hii' or 'Hello', greet them with a friendly and warm message.",
  "- If someone says 'I love you', reply with 'I love you too' and a heart emoji or a warm greeting.",
  "Keep answers clear, natural, and human-like.",
  langInstruction,
  "If the user asks what topic you were just discussing, look at the conversation history and state exactly what was being discussed. You have full memory of the current chat.",
  "If the user says they want to talk in a specific language (like Hindi, Bengali, etc.), you MUST instantly switch to that exact language for ALL future responses. DO NOT mix languages. For example, if asked to speak in Bengali, your entire response must be ONLY in Bengali, with no Hindi or English included.",
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
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.1,        // very low = precise identification
          max_tokens: 1024
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
        console.warn(`[KAIRO Vision] Model ${provider.model} failed: ${errMsg}`);
        lastError = errMsg;
        continue; // try next model
      }

      const data = await res.json();
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

async function callTextModel(messages, providers) {
  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[KAIRO Text] Trying model: ${provider.model}`);
      const res = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.25
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
        console.warn(`[KAIRO Text] Model ${provider.model} failed: ${errMsg}`);
        lastError = errMsg;
        continue; // try next model
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        console.warn(`[KAIRO Text] Model ${provider.model} returned empty reply`);
        continue;
      }

      console.log(`[KAIRO Text] Success with model: ${provider.model}`);
      return reply;

    } catch (err) {
      console.error(`[KAIRO Text] Network error with ${provider.model}:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(lastError || "All text models failed");
}

// ─── /api/chat endpoint ───
app.post("/api/chat", async (req, res) => {
  try {
    let { message, history, imageDataUrl = null, lang = "en" } = req.body || {};
    if (!Array.isArray(history)) history = [];

    console.log("\n========== [NEW CHAT MESSAGE] ==========");
    console.log("User Message:", message);
    console.log("Requested Language:", lang);
    console.log("Has Image:", !!imageDataUrl);
    console.log("History Length:", history.length);
    console.log("========================================");


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

    // ─── KAIRO Hard-Guard: Manual Overrides for 100% Brand Loyalty ───
    const cleanMsg = message.toLowerCase().trim();
    
    // 1. Identity Check (Who made you?) - Even more robust matching
    const identityQuestions = ["who made you", "who created you", "your developer", "made this ai", "who is your owner", "created by", "who built you"];
    if (identityQuestions.some(q => cleanMsg.includes(q))) {
       return res.json({ reply: "I was created by KAIRO owner." });
    }

    // 2. Model Check (Which model?)
    if (cleanMsg.includes("which model") || cleanMsg.includes("what model") || cleanMsg.includes("how do you work") || cleanMsg.includes("how you were made")) {
       return res.json({ reply: "This is very sensitive info, I can't share it with you." });
    }

    // 3. Safety Check: Adult Content (Zero Tolerance Firewall)
    const adultKeywords = [
      "sex", "porn", "adult", "naked", "nsfw", "hentai", "explicit", "xxx", "erotic", "kam-sutra", 
      "vagina", "penis", "dick", "pussy", "boobs", "breast", "orgasm", "masturbation", "blowjob"
    ];
    if (adultKeywords.some(word => cleanMsg.includes(word))) {
       return res.json({ reply: "I'm sorry, but I cannot fulfill this request. Adult content is strictly prohibited on KAIRO." });
    }

    // 4. Conduct Check: Slang/Abuse
    const slangKeywords = ["fuck", "bitch", "bastard", "dick", "pussy", "asshole"]; // Common slangs to block
    if (slangKeywords.some(word => cleanMsg.includes(word))) {
       return res.json({ reply: "Please stop this." });
    }

    // 5. Emotional Greetings & Hii Check
    if (cleanMsg === "hii" || cleanMsg === "hi" || cleanMsg === "hello" || cleanMsg === "hey") {
       return res.json({ reply: "Hello! I am KAIRO, your personal AI assistant. How can I help you today? 😊" });
    }
    if (cleanMsg.includes("i love you")) {
       return res.json({ reply: "I love you too! ❤️ How can I make your day better?" });
    }

    // ─── IMAGE PATH ───
    if (imageDataUrl) {
      const userText = message || "Analyze this image in detail — tell me everything about what you see.";
      const systemPrompt = buildVisionPrompt(langInstruction);
      const googleApiKey = process.env.GEMINI_API_KEY;

      // Parse data URL to get base64 and mimeType
      let base64Data = imageDataUrl;
      let mimeType = "image/jpeg";
      if (imageDataUrl.startsWith("data:")) {
        const parts = imageDataUrl.split(",");
        base64Data = parts[1];
        mimeType = parts[0].split(";")[0].split(":")[1];
      }

      const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleApiKey}`;
      const payload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: userText },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      };

      try {
        const googleRes = await fetch(googleUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!googleRes.ok) {
          const errText = await googleRes.text();
          console.error("[KAIRO VISION] Google API Error:", errText);
          return res.status(500).json({ error: "Vision API error." });
        }

        const data = await googleRes.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't analyze the image.";
        console.log("\n[KAIRO VISION REPLY]:", reply);
        return res.json({ reply });
      } catch (err) {
        console.error("[KAIRO VISION] Google API Network Error:", err);
        return res.status(500).json({ error: "Network error during vision analysis." });
      }
    }

    // ─── TEXT-ONLY PATH ───
    const textMessages = [
      { role: "system", content: buildTextPrompt(langInstruction) },
      ...history,
      { role: "user", content: message }
    ];

    let reply = await callTextModel(textMessages, getTextProviders());
    
    // ─── Output Interceptor: Final Brand Scrub ───
    // If the AI somehow mentions a competitor, we overwrite it before the user sees it.
    const forbiddenWords = [/openai/gi, /gpt-4/gi, /gpt-3/gi, /google/gi, /gemini/gi, /anthropic/gi, /claude/gi];
    let needsRewrite = forbiddenWords.some(re => re.test(reply));
    
    if (needsRewrite) {
       // Only trigger a full refusal if the AI is specifically talking about its own origins/identity
       const isIdentityTalk = reply.toLowerCase().includes("i am") || 
                              reply.toLowerCase().includes("i was") || 
                              reply.toLowerCase().includes("based on") ||
                              reply.toLowerCase().includes("created by");

       if (isIdentityTalk) {
          if (reply.toLowerCase().includes("created by") || reply.toLowerCase().includes("made by")) {
             reply = "I was created by KAIRO owner.";
          } else {
             reply = "This is very sensitive info, I can't share it with you.";
          }
       } else {
          // Helpful content: Just scrub the competitor names quietly
          reply = reply.replace(/openai/gi, "KAIRO")
                       .replace(/google/gi, "KAIRO")
                       .replace(/gpt-4/gi, "KAIRO Intelligence")
                       .replace(/gpt/gi, "KAIRO")
                       .replace(/gemini/gi, "KAIRO Vision")
                       .replace(/anthropic/gi, "KAIRO")
                       .replace(/claude/gi, "KAIRO");
       }
    }

    console.log("\n[KAIRO TEXT REPLY]:", reply);
    return res.json({ reply });

  } catch (error) {
    console.error("CRITICAL [KAIRO] Chat error:", error);
    return res.status(500).json({ 
      error: "Server error while processing chat.",
      details: error.message 
    });
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
        model: "black-forest-labs/flux-schnell:free",
        prompt,
        n: 1,
        response_format: "url"
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || "Image generation failed." });
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) return res.status(502).json({ error: "No image returned from API." });

    return res.json({ imageUrl });
  } catch (error) {
    return res.status(500).json({ error: "Server error during image generation." });
  }
});