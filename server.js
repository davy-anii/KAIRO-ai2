require("dotenv").config();
const express = require("express");
const Tesseract = require("tesseract.js");
const { create, all } = require("mathjs");

const app = express();
const port = process.env.PORT || 3000;
const math = create(all, {});

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

const normalizeText = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const looksLikeArithmetic = (value) => /^[0-9\s+\-*/÷×().^%=]+$/.test(value);

const trySolveArithmetic = (value) => {
  const cleaned = normalizeText(value)
    .replace(/[×x]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/=/g, "")
    .replace(/\s+/g, "");

  if (!cleaned || !looksLikeArithmetic(cleaned)) {
    return null;
  }

  try {
    const result = math.evaluate(cleaned);
    return {
      expression: cleaned,
      result: String(result)
    };
  } catch (error) {
    return null;
  }
};

const extractImageText = async (imageDataUrl) => {
  const result = await Tesseract.recognize(imageDataUrl, "eng");
  return normalizeText(result?.data?.text || "");
};

const getProviderConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isOpenRouterKey = apiKey.startsWith("sk-or-v1-");

  if (isOpenRouterKey) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    };
  }

  return {
    url: "https://api.openai.com/v1/chat/completions",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  };
};

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], imageDataUrl = null } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "API key is missing. Add OPENAI_API_KEY to your .env file."
      });
    }

    let imageContext = "";
    let directAnswer = null;

    if (imageDataUrl) {
      const extractedText = await extractImageText(imageDataUrl);
      imageContext = extractedText;
      directAnswer = trySolveArithmetic(extractedText);
    }

    if (directAnswer) {
      return res.json({
        reply: `The answer is ${directAnswer.result}.\n\nUsing order of operations on ${directAnswer.expression}.`
      });
    }

    const messages = [
      {
        role: "system",
        content: [
          "Your name is KAIRO. If asked your name, always say KAIRO.",
          "Keep answers clear, natural, and human-like.",
          "You can generate images! If the user asks you to generate, create, draw, or make an image of something, reply with EXACTLY this format and nothing else: [GENERATE_IMAGE: description of the image]",
          "Example: if user says 'generate an image of a sunset', reply: [GENERATE_IMAGE: a beautiful golden sunset over the ocean, vibrant colors, cinematic]",
          "If an image is provided, inspect it carefully and solve the problem shown in it.",
          "If the image clearly shows a math or homework question, answer directly without asking for more details.",
          "For image-based math or homework questions, solve it in a fast and simple way.",
          "Give the final answer first, then add only a very short explanation or the essential steps.",
          "For mathematical questions, solve step by step like a good tutor, but keep it brief and easy to follow.",
          "When useful, show formulas, substitutions, and only the most important reasoning.",
          "Do not sound robotic. Use a friendly, patient teaching style.",
          "If the question is ambiguous, say what you assume before solving it."
        ].join(" ")
      },
      ...history,
      {
        role: "user",
        content: imageDataUrl
          ? [
              {
                type: "text",
                text: [
                  message,
                  imageContext ? "" : "",
                  imageContext ? "OCR text extracted from the attached image:" : "",
                  imageContext,
                  imageContext ? "" : "",
                  "Solve the problem shown in the image directly and use the OCR text as support when helpful."
                ]
                  .filter(Boolean)
                  .join("\n")
              },
              { type: "image_url", image_url: { url: imageDataUrl } }
            ]
          : message
      }
    ];

    const provider = getProviderConfig();

    const response = await fetch(provider.url, {
      method: "POST",
      headers: provider.headers,
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorPayload?.error?.message || "Failed to get response from API."
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "Empty response from API." });
    }

    return res.json({ reply });
  } catch (error) {
    return res.status(500).json({ error: "Server error while processing chat." });
  }
});

if (require.main === module) {
  app.listen(port, () =>
    console.log(`Chatbot running at http://localhost:${port}`)
  );
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

    // Use OpenRouter's free image generation model
    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux-schnell:free",
        prompt: prompt,
        n: 1,
        response_format: "url"
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err?.error?.message || "Image generation failed."
      });
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      return res.status(502).json({ error: "No image returned from API." });
    }

    return res.json({ imageUrl });
  } catch (error) {
    return res.status(500).json({ error: "Server error during image generation." });
  }
});