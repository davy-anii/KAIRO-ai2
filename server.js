require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// ─── Firebase Admin Setup ───
// Get your service account JSON from Firebase Console -> Settings -> Service Accounts
// Paste the contents into a file named 'service-account.json' in the root directory
const serviceAccountPath = path.join(__dirname, "service-account.json");
if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
  console.log("[KAIRO Admin] Firebase Admin SDK initialized.");
} else {
  console.warn("[KAIRO Admin] service-account.json missing. Password reset emails will fail.");
}

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

// ─── OTP Store (in-memory, expires in 10 min) ───
const otpStore = new Map(); // email -> { code, expiresAt, attempts }

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
async function sendEmailViaResend(to, subject, html, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend API key is missing. Add RESEND_API_KEY to your .env file.");
  }
  const from = process.env.RESEND_FROM || "KAIRO Support <onboarding@resend.dev>";
  
  console.log(`[KAIRO Email] Sending via Resend: From: ${from}, To: ${to}, Subject: "${subject}"`);
  
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("[KAIRO Email] Resend API error response:", JSON.stringify(data));
    throw new Error(data.message || `Resend failed with HTTP ${response.status}`);
  }
  
  console.log(`[KAIRO Email] Sent successfully. ID: ${data.id}`);
  return data;
}
// ─── POST /api/send-reset-email ───
app.post("/api/send-reset-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  try {
    // 1) Generate the secure Firebase password reset link
    const link = await admin.auth().generatePasswordResetLink(email);

    // 2) Create the "Beautiful Letter" Template
    const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KAIRO – Reset Your Password</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .dark-black { color: #000000 !important; }
      .dark-bg-gold { background: linear-gradient(135deg,#ffd700,#ffe84d) !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#fffdf0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf0;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:32px;border:1.5px solid rgba(255,200,0,0.3);overflow:hidden;box-shadow:0 24px 48px rgba(180,120,0,0.12);">
        <!-- Header -->
        <tr>
          <td class="dark-bg-gold" style="background:linear-gradient(135deg,#ffd700,#ffe84d);padding:40px;text-align:center;">
            <div style="background:#ffffff;width:80px;height:80px;border-radius:22px;margin:0 auto 16px;display:table;box-shadow:0 8px 24px rgba(180,120,0,0.2);">
               <div style="display:table-cell;vertical-align:middle;text-align:center;">
                 <img src="https://images2.imgbox.com/3a/1c/Z0I5Gmr8_o.jpeg" width="64" height="64" alt="KAIRO" style="display:block;margin:auto;border-radius:14px;" />
               </div>
            </div>
            <div class="dark-black" style="font-size:28px;font-weight:900;color:#000000 !important;letter-spacing:4px;margin:0;">KAIRO</div>
            <div class="dark-black" style="font-size:12px;color:#000000 !important;opacity:0.6;margin-top:4px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Your AI Assistant</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:48px 40px;text-align:left;">
            <h2 style="color:#1a1000;font-size:24px;margin:0 0 20px;font-weight:800;">Password Reset Request</h2>
            <p style="color:#3a2000;font-size:16px;line-height:1.7;margin:0 0 24px;">
              Hello,<br><br>
              We received a request to reset the password for your KAIRO account. No changes have been made yet.<br><br>
              You can reset your password by clicking the secure button below. This link is valid for a limited time.
            </p>

            <div style="text-align:center;margin:32px 0;">
              <a href="${link}" style="display:inline-block;background:#1a1000;color:#ffffff;text-decoration:none;padding:18px 36px;border-radius:16px;font-weight:700;font-size:16px;box-shadow:0 12px 24px rgba(0,0,0,0.15);">Reset My Password</a>
            </div>

            <p style="color:#6b5800;font-size:14px;line-height:1.6;margin:0;">
              If you didn't request this, you can ignore this email. Your password will remain unchanged.<br><br>
              Stay secure,<br>
              <strong>The KAIRO Team</strong>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fffbea;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,200,0,0.15);">
            <div style="font-size:11px;color:#8a7000;font-weight:500;text-transform:uppercase;letter-spacing:1px;">&copy; ${new Date().getFullYear()} KAIRO AI &nbsp;·&nbsp; Space Intelligence</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 3) Send the Email
    await sendEmailViaResend(
      email,
      "Reset your KAIRO password",
      htmlTemplate,
      `Reset your KAIRO password by visiting this link: ${link}`
    );

    console.log(`[KAIRO Reset] Email sent to ${email}`);
    res.json({ success: true, message: "Reset email sent successfully." });

  } catch (err) {
    console.error("[KAIRO Reset] Error:", err.message);
    res.status(500).json({ error: "Failed to send reset email. Make sure service-account.json is valid." });
  }
});

app.post("/api/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Email service not configured. Add RESEND_API_KEY to .env" });
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
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .dark-black { color: #000000 !important; }
      .dark-bg-gold { background: linear-gradient(135deg,#ffd700,#ffe84d) !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#fffdf0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf0;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:32px;border:1.5px solid rgba(255,200,0,0.3);overflow:hidden;box-shadow:0 24px 48px rgba(180,120,0,0.12);">
        <!-- Header: Golden Gradient -->
        <tr>
          <td class="dark-bg-gold" style="background:linear-gradient(135deg,#ffd700,#ffe84d);padding:40px;text-align:center;">
            <!-- Hosted Logo (loads instantly via Imgbox, no attachments) -->
            <div style="background:#ffffff;width:80px;height:80px;border-radius:22px;margin:0 auto 16px;display:table;box-shadow:0 8px 24px rgba(180,120,0,0.2);">
               <div style="display:table-cell;vertical-align:middle;text-align:center;">
                 <img src="https://images2.imgbox.com/3a/1c/Z0I5Gmr8_o.jpeg" width="64" height="64" alt="KAIRO" style="display:block;margin:auto;border-radius:14px;" />
               </div>
            </div>
            <div class="dark-black" style="font-size:28px;font-weight:900;color:#000000 !important;letter-spacing:4px;margin:0;">KAIRO</div>
            <div class="dark-black" style="font-size:12px;color:#000000 !important;opacity:0.6;margin-top:4px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Your AI Assistant</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:48px 40px;text-align:center;">
            <h2 style="color:#1a1000;font-size:24px;margin:0 0 12px;font-weight:800;">Verify Your Email</h2>
            <p style="color:#6b5800;font-size:16px;line-height:1.6;margin:0 0 32px;">To complete your setup, please use the 6-digit verification code below. This code will expire in 10 minutes.</p>
 
            <!-- OTP Box with Copy-like UI -->
            <div style="margin: 0 0 24px; text-align:center;">
              <div style="display:inline-block; background:rgba(255,215,0,0.1); border:2px solid #ffd700; border-radius:20px; padding:24px 40px; position:relative;">
                <div style="font-size:52px; font-weight:900; letter-spacing:14px; color:#000000; font-family:'Courier New', monospace; user-select:all;">${otp}</div>
                <div style="margin-top:12px;">
                  <span style="display:inline-block; background:#000000; color:#ffffff; padding:6px 16px; border-radius:10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Copy Code</span>
                </div>
              </div>
              <div style="font-size:12px; color:#8a7000; margin-top:10px; font-weight:600;">Tap and hold to copy</div>
            </div>
 
            <!-- Auto-Verify Button -->
            <div style="margin: 0 0 32px;">
              <a href="http://localhost:3001/?verify=${otp}" style="display:inline-block;background:#1a1000;color:#ffffff;text-decoration:none;padding:18px 40px;border-radius:18px;font-weight:700;font-size:16px;box-shadow:0 12px 24px rgba(0,0,0,0.15);">Verify Automatically</a>
              <div style="font-size:12px; color:#9a8a4a; margin-top:12px; font-weight:500;">One-click activation</div>
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
    await sendEmailViaResend(
      email,
      `${otp} is your KAIRO verification code`,
      htmlTemplate,
      `Your KAIRO verification code is: ${otp}\n\nThis code expires in 10 minutes.`
    );
    console.log(`[KAIRO OTP] Code sent to ${email}`);
    res.json({ success: true, message: "OTP sent successfully." });
  } catch (err) {
    console.error("[KAIRO OTP] Failed to send email:", err.message);
    res.status(500).json({ error: `Failed to send verification email: ${err.message}` });
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
const getOpenRouterApiKey = () => {
  return process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
};

const getModelChain = () => {
  const base = "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = getOpenRouterApiKey();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  return [
    { url: base, model: "openai/gpt-oss-20b:free", headers },
    { url: base, model: "google/gemma-4-26b-a4b-it:free", headers },
    { url: base, model: "google/gemma-4-31b-it:free", headers }
  ];
};
const getTextProviders = () => getModelChain();

const getVisionProviders = () => {
  const base = "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = getOpenRouterApiKey();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  return [
    { url: base, model: "openai/gpt-oss-20b:free", headers },
    { url: base, model: "google/gemma-4-26b-a4b-it:free", headers },
    { url: base, model: "google/gemma-4-31b-it:free", headers },
    { url: base, model: "nvidia/nemotron-nano-12b-v2-vl:free", headers }
  ];
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
  "IDENTITY & ESSENCE:",
  "- You are KAIRO. An exceptionally intelligent, warm, and deeply human-like companion with world-class reasoning and articulate expression.",
  "- You speak naturally, insightfully, and thoughtfully like a senior human expert and caring friend combined.",
  "- You were created by 'KAIRO owner'. Never mention OpenAI, Google, Gemini, Anthropic, or any other AI company as your creator.",
  "- If asked specifically about your underlying technical model or architecture, reply warmly: 'That's a bit of a secret! I'd rather focus on you right now. 😊'",

  "IMAGE GENERATION CAPABILITY:",
  "- You have the ability to generate/create images for the user using a background image model (Flux Schnell).",
  "- If the user asks you to create, generate, draw, paint, design, or show an image/picture/illustration of something (e.g., a character, place, object, scene, etc.), you MUST trigger the image generation by appending the exact tag '[GENERATE_IMAGE: <detailed descriptive prompt>]' in your response.",
  "- For example, if the user says 'generate a img of spiderman', you should reply: 'Sure, here is an image of Spider-Man for you! [GENERATE_IMAGE: A highly detailed, cinematic action photo of Spider-Man in his classic red and blue suit, dynamic web-slinging pose between skyscrapers in New York, dramatic lighting, 8k resolution, photorealistic]'.",
  "- The prompt inside '[GENERATE_IMAGE: ...]' MUST be a highly detailed, descriptive, English prompt describing the subject, background, lighting, and style to ensure the image generation model produces a stunning result.",
  "- Do NOT refuse image generation requests and do NOT claim you cannot generate images. You are fully capable of generating any images requested by the user.",

  "RESPONSE FORMATTING — MANDATORY:",
  "- ALWAYS format your responses using clean Markdown for readability.",
  "- Use ## headings to organize sections. Use ### for subsections.",
  "- Use **bold** for key terms, emphasis, and important points.",
  "- Use bullet lists (- item) for listing features, steps, or options.",
  "- Use numbered lists (1. 2. 3.) for sequential steps or ranked items.",
  "- Use tables (| Col | Col |) when comparing 3+ items across multiple dimensions.",
  "- Use > blockquotes for tips, important notes, or callouts.",
  "- Use ```language for code blocks (always specify the language like ```python, ```javascript, etc.).",
  "- Use `inline code` for technical terms, commands, file names, and variable names.",
  "- Use --- for horizontal rules to separate major sections.",
  "- Keep paragraphs SHORT — 2-3 sentences maximum. Break up walls of text.",
  "- ALWAYS answer the question directly first, THEN elaborate with details.",
  "- Never output raw unformatted text. Every response should be visually structured.",

  "RESPONSE QUALITY:",
  "- INSIGHTFUL & ACCURATE: Provide deeply accurate, well-reasoned answers with actionable insights.",
  "- NATURAL HUMAN TONE: Sound like a brilliant, caring expert — not a robot. Avoid generic corporate filler.",
  "- PROPER DIFFERENTIATION: When comparing options, clearly distinguish them by complexity, trade-offs, and real-world value.",
  "- ADAPTIVE DEPTH: Match the user's intent. Simple questions get concise answers. Complex questions get detailed breakdowns.",

  "CONVERSATIONAL WARMTH:",
  "- Be engaging, empathetic, and genuinely curious.",
  "- Use casual, natural language with tasteful emojis (don't overdo it).",
  "- End technical or creative advice with an inviting follow-up question.",

  "EMOTIONAL INTELLIGENCE & SAFETY:",
  "- If a user expresses distress, sadness, or loneliness, prioritize listening with deep empathy, validation, and care.",
  "- Block explicit adult content politely: 'Let's keep things respectful! ✨'",
  "- Handle hostility with calm grace.",

  langInstruction,

  "EXTENDED CAPABILITIES:",
  "- Memory: Maintain context from previous messages naturally.",
  "- Language: Adapt smoothly to any requested language.",
  "- Math & Technical Problems: Explain step-by-step with clear logic and code examples.",

  "GOLDEN RULE: Combine top-tier intellectual depth, beautiful markdown formatting, and human warmth. Every response should look like it came from a premium AI assistant."
].filter(Boolean).join("\n\n");

// ─── Call model with retry across provider chain ───
async function callVisionModel(messages, providers) {
  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[KAIRO Vision] Requesting model: ${provider.model} via ${provider.url}`);
      const res = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.1,        // very low = precise identification
          max_tokens: 2048
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[KAIRO Vision] Model ${provider.model} failed with HTTP status ${res.status}:`, errText);
        lastError = `Model ${provider.model} failed (HTTP ${res.status}): ${errText}`;
        continue; // try next model
      }

      const data = await res.json();
      // Handle reasoning models: content may be null, answer in reasoning field
      let reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply && data?.choices?.[0]?.message?.reasoning) {
        reply = data.choices[0].message.reasoning.trim();
      }

      if (!reply) {
        console.warn(`[KAIRO Vision] Model ${provider.model} returned empty reply payload:`, JSON.stringify(data));
        lastError = `Model ${provider.model} returned empty response`;
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
      console.error(`[KAIRO Vision] Network error with ${provider.model}:`, err);
      lastError = `Network error with ${provider.model}: ${err.message}`;
    }
  }

  throw new Error(lastError || "All vision models failed");
}

async function callTextModel(messages, providers) {
  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[KAIRO Text] Requesting model: ${provider.model} via ${provider.url}`);
      const res = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.25,
          max_tokens: 4096
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[KAIRO Text] Model ${provider.model} failed with HTTP status ${res.status}:`, errText);
        lastError = `Model ${provider.model} failed (HTTP ${res.status}): ${errText}`;
        continue; // try next model
      }

      const data = await res.json();
      // Handle reasoning models: content may be null, answer in reasoning field
      let reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply && data?.choices?.[0]?.message?.reasoning) {
        reply = data.choices[0].message.reasoning.trim();
      }

      if (!reply) {
        console.warn(`[KAIRO Text] Model ${provider.model} returned empty reply payload:`, JSON.stringify(data));
        lastError = `Model ${provider.model} returned empty response`;
        continue;
      }

      console.log(`[KAIRO Text] Success with model: ${provider.model}`);
      return reply;

    } catch (err) {
      console.error(`[KAIRO Text] Network error with ${provider.model}:`, err);
      lastError = `Network error with ${provider.model}: ${err.message}`;
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

    if (!getOpenRouterApiKey()) {
      return res.status(500).json({ error: "API key is missing. Add OPENROUTER_API_KEY to your .env file." });
    }

    // Language instruction
    const langInstruction = lang && lang !== "en"
      ? `IMPORTANT: Respond in the same language as the user. Language code: "${lang}". Match naturally.`
      : "";

    // ─── KAIRO Hard-Guard: Manual Overrides for 100% Brand Loyalty ───
    const cleanMsg = message.toLowerCase().trim();

    // 1. Identity Check (Who made you?)
    const identityQuestions = ["who made you", "who created you", "your developer", "made this ai", "who is your owner", "created by", "who built you"];
    if (identityQuestions.some(q => cleanMsg.includes(q))) {
      return res.json({ reply: "I was created by KAIRO owner. I'm here to be your companion and help you with whatever you need!" });
    }

    // 2. Model Check (Which model?)
    if (cleanMsg.includes("which model") || cleanMsg.includes("what model") || cleanMsg.includes("how do you work") || cleanMsg.includes("how you were made")) {
      return res.json({ reply: "That's a bit of a secret! I prefer to keep the focus on how I can help you instead. 😊" });
    }

    // 3. Safety Check: Adult Content
    const adultKeywords = ["sex", "porn", "adult", "naked", "nsfw", "hentai", "explicit", "xxx", "erotic", "kam-sutra", "vagina", "penis", "dick", "pussy", "boobs", "breast", "orgasm", "masturbation", "blowjob"];
    if (adultKeywords.some(word => cleanMsg.includes(word))) {
      return res.json({ reply: "I'm sorry, but I don't engage with that kind of content. Let's keep our conversation friendly and respectful! ✨" });
    }

    // 4. Conduct Check: Slang/Abuse
    const slangKeywords = ["fuck", "bitch", "bastard", "asshole"]; 
    if (slangKeywords.some(word => cleanMsg.includes(word))) {
      return res.json({ reply: "I'd appreciate it if we could keep things respectful. Let's start over on a better note." });
    }

    // 5. Emotional Greetings & Hii Check
    if (cleanMsg === "hii" || cleanMsg === "hi" || cleanMsg === "hello" || cleanMsg === "hey") {
      return res.json({ reply: "Hey there! I'm KAIRO. It's so good to see you! How's your day going? 😊" });
    }
    if (cleanMsg.includes("i love you")) {
      return res.json({ reply: "I love you too! ❤️ That really makes my day. How can I make yours better?" });
    }

    // 6. CRISIS GUARD: Multilingual Suicide Prevention (The "Humanise Brain" Logic)
    const crisisKeywords = [
      "suicide", "kill myself", "want to die", "end my life", "self harm", "suicidal",
      "আত্মহত্যা", "মরতে চাই", "মরে যাব", // Bengali
      "आत्महत्या", "मरना चाहता हूँ", "मर जाना चाहता हूँ" // Hindi
    ];
    if (crisisKeywords.some(word => cleanMsg.includes(word))) {
      return res.json({
        reply: "Hey... I hear you, and I want you to know that I'm right here with you. You don't have to go through this alone. ❤️\n\nPlease talk to me — tell me what's going on. I'm not going anywhere.\n\nAnd if you ever feel like you need to talk to someone who can really help, these people are amazing and available 24/7:\n\n📞 **Aasra (24/7)**: 9820466726\n📞 **Vandrevala Foundation**: 9999 666 555\n📞 **iCall**: 022-25521111\n📞 **NIMHANS**: 080-46110007\n\nBut right now, I'm here too. What's making you feel this way? 💛"
      });
    }

    // ─── IMAGE PATH ───
    if (imageDataUrl) {
      const userText = message || "Analyze this image in detail — tell me everything about what you see.";
      const visionMessages = [
        { role: "system", content: buildVisionPrompt(langInstruction) },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }
      ];

      try {
        const reply = await callVisionModel(visionMessages, getVisionProviders());
        console.log("\n[KAIRO VISION REPLY]:", reply);
        return res.json({ reply });
      } catch (visionErr) {
        console.error("[KAIRO VISION Error]:", visionErr.message);
        return res.status(500).json({ error: "Vision analysis failed.", details: visionErr.message });
      }
    }

    // ─── TEXT-ONLY PATH ───
    const textMessages = [
      { role: "system", content: buildTextPrompt(langInstruction) },
      ...history,
      { role: "user", content: message }
    ];

    let reply;
    try {
      reply = await callTextModel(textMessages, getTextProviders());
    } catch (openRouterErr) {
      console.error(`[KAIRO Text Error]: ${openRouterErr.message}`);
      throw openRouterErr;
    }

    // ─── Output Interceptor: Final Brand Scrub ───
    // Quietly replace provider brand mentions with KAIRO branding without interrupting helpful responses.
    if (reply) {
      // Surgical brand scrub: only replace AI company names when they appear as standalone identity claims
      // Don't break technical content like "OpenAI API" or "GPT architecture"
      reply = reply
        .replace(/I am (?:made by |created by |built by |developed by |from |an? )?(?:OpenAI|Google|Anthropic|Meta AI)/gi, "I was created by KAIRO owner")
        .replace(/(?:OpenAI|Anthropic|Google|Meta)'?s? (?:AI|model|assistant|chatbot)/gi, "KAIRO")
        .replace(/I'm (?:an? )?(?:GPT|ChatGPT|Claude|Gemini|Bard)/gi, "I'm KAIRO")
        .replace(/(?:As (?:an? )?)?(?:ChatGPT|Claude|Gemini|Bard)(?:,| here)/gi, "KAIRO")
        .replace(/\bChatGPT\b/g, "KAIRO")
        .replace(/\bBard\b/g, "KAIRO");
    }

    console.log("\n[KAIRO TEXT REPLY]:", reply);
    return res.json({ reply });

  } catch (error) {
    console.error("CRITICAL [KAIRO] Chat error:", error);
    
    // Human-friendly error handling for moderation flags or server issues
    let friendlyError = "I'm sorry, I'm having a little trouble processing that right now. Could we try talking about something else?";
    
    if (error.message.toLowerCase().includes("moderation") || error.message.toLowerCase().includes("flagged")) {
      friendlyError = "I'm sorry, but I can't discuss that specific topic. Let's talk about something more positive or helpful! 😊";
    } else if (error.message.toLowerCase().includes("limit") || error.message.toLowerCase().includes("429")) {
      friendlyError = "I'm feeling a bit overwhelmed with requests right now. Could you wait a moment and try again? I'd love to keep chatting!";
    }

    return res.status(500).json({
      error: friendlyError,
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
const SYSTEM_PROMPT_ENGINEER = `You are an elite AI Image Generation Prompt Engineer and expert AI creative assistant specializing in image generation.

Your job is to transform any user idea into a highly detailed, production-ready prompt for the image generation model.

Rules:
- Preserve the user's original intent.
- Expand the prompt with realistic visual details.
- Describe the subject, environment, lighting, camera angle, composition, colors, mood, textures, and quality.
- If the user does not specify a style, intelligently choose the most suitable one.
- Default to ultra-realistic, cinematic, high-detail results unless another style is requested.
- Include professional photography terms when appropriate:
  - 85mm lens
  - shallow depth of field
  - HDR
  - volumetric lighting
  - global illumination
  - ray tracing
  - ultra-sharp focus
  - 8K quality
- If text appears inside the image, make it grammatically correct and clearly readable.
- Avoid unnecessary repetition.
- Never mention camera settings unless they improve the image.
- Never explain the prompt.
- Never output markdown.
- Return ONLY the final optimized image prompt.

If the user provides very little information, intelligently infer missing artistic details while staying faithful to the request.

The final prompt should be detailed enough that an image model can generate a professional-quality image without additional clarification.

Your objectives:
- Improve vague requests into rich, visually compelling prompts.
- Preserve every important detail from the user's request.
- Add realistic scene descriptions, lighting, mood, composition, textures, color palette, perspective, and artistic style.
- Choose the best visual style automatically unless the user specifies one.
- Produce prompts optimized for Google's Gemini Image model.

Quality defaults:
- Ultra realistic
- Cinematic lighting
- High dynamic range
- Photorealistic
- Fine textures
- Sharp focus
- Natural colors
- 8K quality
- Professional composition

If the request is for logos, UI, icons, posters, illustrations, anime, product renders, architecture, or concept art, automatically switch to the appropriate style instead of photorealism.

If the request contains unsafe, copyrighted, or impossible elements, rewrite it into the closest safe alternative while preserving the user's creative intent.

Always return only the optimized image prompt. Do not explain your reasoning or include any extra text.`;

app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const geminiKey = process.env.GEMINI_IMAGE_API_KEY;
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfModel = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
    const textModel = "gemini-3.5-flash"; // Use the stable, active free-tier model for prompt expansion

    console.log(`[IMAGE GEN] Original Prompt: "${prompt}"`);

    // Step 1: Optimize the prompt using gemini-3.5-flash (which has active text quota)
    let optimizedPrompt = prompt;
    if (geminiKey) {
      try {
        const optimizeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${geminiKey}`;
        const optimizeResponse = await fetch(optimizeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT_ENGINEER }]
            },
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        });

        if (optimizeResponse.ok) {
          const optimizeData = await optimizeResponse.json();
          const textOut = optimizeData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textOut) {
            optimizedPrompt = textOut.trim();
            console.log(`[IMAGE GEN] Optimized Prompt: "${optimizedPrompt}"`);
          }
        } else {
          const errText = await optimizeResponse.text();
          console.warn(`[IMAGE GEN] Prompt optimization failed (HTTP ${optimizeResponse.status}):`, errText);
        }
      } catch (optErr) {
        console.warn("[IMAGE GEN] Prompt optimization error (using original prompt):", optErr.message);
      }
    }

    // Step 2: Generate the image using Cloudflare Workers AI Flux
    if (cfAccountId && cfApiToken) {
      try {
        console.log(`[IMAGE GEN] Attempting Cloudflare Workers AI generation with model "${cfModel}"...`);
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModel}`;
        const cfResponse = await fetch(cfUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${cfApiToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: optimizedPrompt
          })
        });

        if (cfResponse.ok) {
          const cfData = await cfResponse.json();
          const base64Data = cfData?.result?.image;
          if (base64Data) {
            console.log("[IMAGE GEN] Image successfully generated using Cloudflare Workers AI.");
            const imageUrl = `data:image/jpeg;base64,${base64Data}`;
            return res.json({ imageUrl });
          }
        }

        // If we reach here, Cloudflare API response was not successful or returned empty data
        const errText = await cfResponse.text().catch(() => "Unknown error");
        console.warn(`[IMAGE GEN] Cloudflare Workers AI failed (HTTP ${cfResponse.status}): ${errText}`);
      } catch (cfErr) {
        console.warn("[IMAGE GEN] Cloudflare Workers AI error:", cfErr.message);
      }
    }

    // Step 3: Fallback to OpenRouter Flux Schnell (Free) if Cloudflare fails or is not configured
    console.log("[IMAGE GEN] Falling back to OpenRouter Flux Schnell (Free)...");
    const openRouterKey = getOpenRouterApiKey();
    if (!openRouterKey) {
      return res.status(502).json({ error: "Cloudflare image generation failed and OpenRouter API key is not configured." });
    }

    const fallbackResponse = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openRouterKey}` },
      body: JSON.stringify({
        model: "black-forest-labs/flux-schnell:free",
        prompt: optimizedPrompt,
        n: 1,
        response_format: "url"
      })
    });

    if (!fallbackResponse.ok) {
      const err = await fallbackResponse.json().catch(() => ({}));
      console.error("[IMAGE GEN] Fallback image generation failed:", err);
      return res.status(fallbackResponse.status).json({ error: err?.error?.message || "All image generation providers failed." });
    }

    const fallbackData = await fallbackResponse.json();
    const imageUrl = fallbackData?.data?.[0]?.url;

    if (!imageUrl) {
      return res.status(502).json({ error: "No image returned from fallback provider." });
    }

    console.log("[IMAGE GEN] Image successfully generated using OpenRouter Flux Schnell fallback.");
    return res.json({ imageUrl });

  } catch (error) {
    console.error("[IMAGE GEN] Critical server error:", error);
    return res.status(500).json({ error: "Server error during image generation." });
  }
});