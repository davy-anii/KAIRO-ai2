const STORAGE_PROFILE = "kairo_profile";
const STORAGE_HISTORY = "kairo_history";
const STORAGE_VOICE = "kairo_voice";

// ─── Firestore helper functions ───
async function saveHistoryToFirestore(userId, chatHistory) {
  try {
    if (!window.__firebaseAuth) {
      console.warn("[KAIRO] Firebase not loaded yet");
      return;
    }
    
    // Save to Firestore via the firebase auth module
    if (window.__firebaseAuth.saveUserData) {
      await window.__firebaseAuth.saveUserData({ uid: userId }, { 
        chatHistory: chatHistory.slice(0, 50),
        lastUpdated: new Date().toISOString()
      });
      console.log("[KAIRO] Chat history saved to Firestore");
    }
  } catch (err) {
    console.error("[KAIRO] Error saving chat history to Firestore:", err);
  }
}

async function loadHistoryFromFirestore(userId) {
  try {
    if (!window.__firebaseAuth || !window.__firebaseAuth.fetchUserData) {
      console.warn("[KAIRO] Firebase not loaded yet");
      return null;
    }
    
    const userData = await window.__firebaseAuth.fetchUserData(userId);
    if (userData && userData.chatHistory) {
      console.log("[KAIRO] Chat history loaded from Firestore");
      return userData.chatHistory;
    }
  } catch (err) {
    console.error("[KAIRO] Error loading chat history from Firestore:", err);
  }
  return null;
}

const screenEls = [...document.querySelectorAll("[data-screen]")];
const navButtons = [...document.querySelectorAll("[data-nav-target]")];
const targetButtons = [...document.querySelectorAll("[data-target]")];
const bottomNavEl = document.getElementById("bottom-nav");
const homeGreetingEl = document.getElementById("home-greeting");
const recentActivityEl = document.getElementById("recent-activity-list");
const historyListEl = document.getElementById("history-list");
const chatStreamEl = document.getElementById("chat-stream");
const chatFormEl = document.getElementById("chat-form");
const messageEl = document.getElementById("message");
const sendEl = document.getElementById("send");
const sttBtnEl = document.getElementById("stt-btn");
const clearChatEl = document.getElementById("clear-chat");
const newChatEl = document.getElementById("new-chat");
const speechToggleEl = document.getElementById("speech-toggle");
const imageInputEl = document.getElementById("image-input");
const imagePreviewEl = document.getElementById("image-preview");
const homeChatFormEl = document.getElementById("home-chat-form");
const homeMessageEl = document.getElementById("home-message");
const homeSendEl = document.getElementById("home-send");
const homeSttBtnEl = document.getElementById("home-stt-btn");
const homeSpeechToggleEl = document.getElementById("home-speech-toggle");
const homeImageInputEl = document.getElementById("home-image-input");
const homeImagePreviewEl = document.getElementById("home-image-preview");
const homeChatActionsEl = document.getElementById("home-chat-actions");
const kairoHomeGreetingEl = document.getElementById("kairo-home-greeting");
const homeNewChatBtnEl = document.getElementById("home-new-chat-btn");
const homeClearChatBtnEl = document.getElementById("home-clear-chat-btn");
const homeMenuBtnEl = document.getElementById("home-menu-btn");
const homeMenuEl = document.getElementById("home-menu");
const homeMenuNewChatEl = document.getElementById("home-menu-new-chat");
const signinFormEl = document.getElementById("signin-form");
const signupFormEl = document.getElementById("signup-form");
const avatarButtonEl = document.getElementById("avatar-button");
const profileAvatarEl = document.getElementById("profile-avatar");
const profileNameEl = document.getElementById("profile-name");
const profileSinceEl = document.getElementById("profile-since");
const statChatsEl = document.getElementById("stat-chats");
const statMessagesEl = document.getElementById("stat-messages");
const statVoiceEl = document.getElementById("stat-voice");

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

// ─── Password Toggle Logic ───
document.querySelectorAll(".password-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrapper = btn.closest(".password-field-wrapper");
    const input = wrapper.querySelector("input");
    // Target either the original <i> or the generated <svg>
    const icon = btn.querySelector("[data-lucide]");
    
    if (input.type === "password") {
      input.type = "text";
      icon?.setAttribute("data-lucide", "eye-off");
    } else {
      input.type = "password";
      icon?.setAttribute("data-lucide", "eye");
    }
    
    // Re-run Lucide to update the icon
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  });
});

const appScreens = new Set(["home", "chat", "history", "profile"]);

const state = {
  activeScreen: "onboarding",
  autoSpeakEnabled: localStorage.getItem(STORAGE_VOICE) === "on",
  attachedImage: {
    chat: null,
    home: null
  },
  profile: readProfile(),
  chatHistory: readHistory(),
  currentSessionId: null,
  currentMessages: []
};

function readProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE);
    if (!raw) return { name: "User", email: "", photoURL: "" };
    const parsed = JSON.parse(raw);
    return {
      name:     parsed?.name?.trim()     || "User",
      email:    parsed?.email?.trim()    || "",
      photoURL: parsed?.photoURL?.trim() || ""
    };
  } catch {
    return { name: "User", email: "", photoURL: "" };
  }
}

function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_PROFILE, JSON.stringify(state.profile));
}

function saveHistory() {
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.chatHistory.slice(0, 50)));
  
  // Also save to Firestore if user is authenticated
  const currentUser = window.__firebaseAuth?.getCurrentUser?.();
  if (currentUser) {
    saveHistoryToFirestore(currentUser.uid, state.chatHistory);
  }
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getGreeting() {
  const h    = new Date().getHours();
  const name = (state.profile.name || "there").split(" ")[0];
  if (h >= 0  && h < 5)  return `Hey ${name}! 🌙`;
  if (h >= 5  && h < 12) return `Good Morning, ${name} ☀️`;
  if (h >= 12 && h < 17) return `Good Afternoon, ${name} 🌤️`;
  if (h >= 17 && h < 21) return `Good Evening, ${name} 🌕`;
  return                          `Good Night, ${name} 🌚`;
}

function updateClock() {
  if (statusClockEl) statusClockEl.textContent = formatTime();
}

function getInitials(name) {
  const words = String(name || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((w) => w[0].toUpperCase()).join("") || "U";
}

function renderProfile() {
  const name      = state.profile.name     || "User";
  const email     = state.profile.email    || "";
  const photoURL  = state.profile.photoURL || "";
  const initials  = getInitials(name);

  // ─ Home greeting
  if (homeGreetingEl) homeGreetingEl.textContent = getGreeting();

  // ─ Top-bar avatar button (shows photo or initials)
  if (avatarButtonEl) {
    if (photoURL) {
      avatarButtonEl.innerHTML = `<img src="${photoURL}" alt="${name}" />`;
    } else {
      avatarButtonEl.innerHTML = "";
      avatarButtonEl.textContent = initials;
    }
  }

  // ─ Profile screen avatar
  const profilePhotoEl    = document.getElementById("profile-photo");
  const profileInitialsEl = document.getElementById("profile-initials");

  if (profilePhotoEl && profileInitialsEl) {
    if (photoURL) {
      profilePhotoEl.src = photoURL;
      profilePhotoEl.classList.remove("is-hidden");
      profileInitialsEl.style.display = "none";
    } else {
      profilePhotoEl.classList.add("is-hidden");
      profileInitialsEl.style.display = "";
      profileInitialsEl.textContent = initials;
    }
  } else if (profileAvatarEl) {
    profileAvatarEl.textContent = initials;
  }

  // ─ Profile name + email
  if (profileNameEl)  profileNameEl.textContent  = name;

  const profileEmailDisplayEl = document.getElementById("profile-email-display");
  if (profileEmailDisplayEl) profileEmailDisplayEl.textContent = email;

  // ─ Member since
  const oldest = state.chatHistory[state.chatHistory.length - 1];
  if (profileSinceEl) {
    profileSinceEl.textContent = oldest
      ? `KAIRO member since ${formatDateLabel(oldest.timestamp)}`
      : "KAIRO member";
  }
}

// ─── Global TTS state tracker ───
let _currentSpeakBtn   = null;
let _currentSpeakText  = null;
let _isSpeaking        = false;
let _speechUnlocked    = false;

function unlockSpeech() {
  if (_speechUnlocked || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance("");
  window.speechSynthesis.speak(utterance);
  _speechUnlocked = true;
}

function stopSpeaking() {
  _isSpeaking = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (_currentSpeakBtn) {
    _currentSpeakBtn.textContent  = "Speak";
    _currentSpeakBtn.classList.remove("is-speaking");
    _currentSpeakBtn = null;
  }
  _currentSpeakText = null;
}
// Pre-load voices so they are ready when needed
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  window.speechSynthesis.getVoices();
}

function getProfessionalVoice(langCode) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langVoices = voices.filter(v => v.lang.startsWith(langCode));
  if (!langVoices.length) return null;

  // Search for high-quality / natural-sounding voices
  const premium = langVoices.find(v => 
    v.name.includes("Premium") || 
    v.name.includes("Enhanced") || 
    v.name.includes("Google") || 
    v.name.includes("Online") ||
    v.name.includes("Natural")
  );
  
  return premium || langVoices[0];
}

// Clean markdown characters from text before speaking
function cleanTextForSpeech(text) {
  return text
    .replace(/[*_~`#]/g, '') // Remove markdown symbols
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract text from links
    .replace(/(?:https?|ftp):\/\/[\n\S]+/g, 'link') // Replace URLs with word "link"
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

function speakText(text, btn) {
  if (!("speechSynthesis" in window) || !text) return;

  // ─── INTERRUPT: if already speaking this same text or any text, stop ───
  if (_isSpeaking) {
    stopSpeaking();
    return;
  }

  // Update button state
  _currentSpeakBtn  = btn || null;
  _currentSpeakText = text;
  _isSpeaking       = true;
  if (btn) {
    btn.textContent = "Stop";
    btn.classList.add("is-speaking");
  }

  window.speechSynthesis.cancel(); // flush any stuck utterance

  // Chrome bug: must create utterance AFTER cancel, with tiny delay
  setTimeout(() => {
    if (!_isSpeaking) return;

    // Clean text and split by sentences to prevent Chrome's 15-second cutoff bug
    const cleanText = cleanTextForSpeech(text);
    const chunks = cleanText.match(/[^.!?।\n]+[.!?।\n]*/g) || [cleanText];
    
    // Auto-detect script to ensure correct language engine
    let targetLang = navigator.language.split("-")[0] || "en"; 
    if (/[\u0980-\u09FF]/.test(cleanText)) targetLang = "bn"; // Bengali
    if (/[\u0900-\u097F]/.test(cleanText)) targetLang = "hi"; // Hindi

    // Select the best available voice
    const bestVoice = getProfessionalVoice(targetLang);
    let currentIndex = 0;

    function speakNextChunk() {
      if (!_isSpeaking || currentIndex >= chunks.length) {
        stopSpeaking();
        return;
      }

      const chunkText = chunks[currentIndex].trim();
      if (!chunkText) {
        currentIndex++;
        return speakNextChunk();
      }

      const utterance = new SpeechSynthesisUtterance(chunkText);
      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang  = bestVoice.lang;
      } else {
        utterance.lang = targetLang === "bn" ? "bn-IN" : targetLang === "hi" ? "hi-IN" : navigator.language;
      }

      // Slightly adjust pitch and rate to sound less robotic and more friendly
      utterance.rate   = 0.95; 
      utterance.pitch  = 1.05; 
      utterance.volume = 1;

      utterance.onend = () => {
        currentIndex++;
        speakNextChunk();
      };

      utterance.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        currentIndex++;
        speakNextChunk();
      };

      window.speechSynthesis.speak(utterance);
    }

    speakNextChunk();

  }, 50);
}

function updateSpeechToggle() {
  const enabled = String(state.autoSpeakEnabled);
  if (speechToggleEl) speechToggleEl.setAttribute("aria-pressed", enabled);
  if (homeSpeechToggleEl) homeSpeechToggleEl.setAttribute("aria-pressed", enabled);
}

function startSpeechToText(textareaEl, triggerBtnEl) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Speech-to-text is not supported in this browser. If you are on iPhone/iPad, please make sure you are using Safari.");
    appendChatMessage({ role: "bot", text: "Speech-to-text is not supported in this browser.", time: Date.now() });
    return;
  }

  if (triggerBtnEl) {
    triggerBtnEl.classList.add("is-listening");
    triggerBtnEl.disabled = true;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;

    const nextValue = textareaEl.value.trim();
    textareaEl.value = nextValue ? `${nextValue} ${transcript}` : transcript;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 120)}px`;
  };

  recognition.onend = () => {
    if (triggerBtnEl) {
      triggerBtnEl.classList.remove("is-listening");
      triggerBtnEl.disabled = false;
    }
    textareaEl.focus();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (triggerBtnEl) {
      triggerBtnEl.classList.remove("is-listening");
      triggerBtnEl.disabled = false;
    }
    if (event.error === 'not-allowed') {
      alert("Microphone access was denied! Please allow microphone permissions in your device/browser settings.");
      appendChatMessage({ role: "bot", text: "Microphone access is blocked. Please allow it in your browser settings.", time: Date.now() });
    }
  };

  try {
    recognition.start();
  } catch (err) {
    console.error("Failed to start recognition:", err);
    if (triggerBtnEl) {
      triggerBtnEl.classList.remove("is-listening");
      triggerBtnEl.disabled = false;
    }
    alert("Could not start microphone. Make sure permissions are granted.");
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIMENSION = 1024;
        let { width, height } = img;
        
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.8 quality to ensure it fits comfortably within Vercel's 4.5MB limit
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Could not load image for compression."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function renderImagePreview(mode) {
  const previewEl = mode === "home" ? homeImagePreviewEl : imagePreviewEl;
  const inputEl = mode === "home" ? homeImageInputEl : imageInputEl;
  const messageTargetEl = mode === "home" ? homeMessageEl : messageEl;
  const image = state.attachedImage[mode];

  if (!previewEl) return;

  if (!image) {
    previewEl.innerHTML = "";
    previewEl.classList.add("is-hidden");
    return;
  }

  const { name, size, dataUrl } = image;
  previewEl.classList.remove("is-hidden");
  previewEl.innerHTML = `
    <img src="${dataUrl}" alt="Attached preview" />
    <div class="image-preview-info">
      <div class="image-preview-name">${name}</div>
      <div class="image-preview-meta">${Math.max(1, Math.round(size / 1024))} KB attached</div>
    </div>
    <button type="button" class="remove-image" data-remove-image="${mode}">Remove</button>
  `;

  previewEl.querySelector("[data-remove-image]")?.addEventListener("click", () => {
    state.attachedImage[mode] = null;
    if (inputEl) inputEl.value = "";
    renderImagePreview(mode);
    messageTargetEl?.focus();
  });
}

function clearChatStream() {
  chatStreamEl.innerHTML = "";
}

// ─── Lightweight Markdown → safe HTML renderer ───
function parseMarkdown(raw) {
  if (!raw) return "";

  // 1. Escape raw HTML first to prevent XSS
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const out   = [];
  let inList  = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings: ### or ## or #
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = Math.min(headingMatch[1].length + 3, 6); // h4–h6
      out.push(`<h${level} class="md-heading">${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Bullet list: lines starting with - * • ·
    const bulletMatch = line.match(/^[\-\*•·]\s+(.+)/);
    if (bulletMatch) {
      if (!inList) { out.push("<ul class=\"md-list\">"); inList = true; }
      out.push(`<li>${inlineFormat(bulletMatch[1])}</li>`);
      continue;
    }

    // Numbered list: lines starting with 1. 2. etc
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      // Treat numbered items as list items for simplicity
      out.push(`<ul class="md-list"><li>${inlineFormat(numMatch[1])}</li></ul>`);
      continue;
    }

    // Close list if non-bullet line
    if (inList && line.trim() !== "") { out.push("</ul>"); inList = false; }

    // Blank line → paragraph break
    if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push("<br>");
      continue;
    }

    out.push(`<p class="md-para">${inlineFormat(line)}</p>`);
  }

  if (inList) out.push("</ul>");
  return out.join("");
}

// Inline formatting: bold, italic, inline-code
function inlineFormat(text) {
  return text
    // Bold+italic: ***text*** or ___text___
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic: *text* or _text_
    .replace(/\*([^\*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Inline code: `code`
    .replace(/`([^`]+)`/g, "<code class=\"md-code\">$1</code>")
    // Em dash shorthand: --
    .replace(/\s--\s/g, " — ");
}

function appendChatMessage(message) {
  const role = message.role;
  const text = message.text;

  const messageNode = document.createElement("article");
  messageNode.className = `chat-message chat-message--${role}`;

  const label = document.createElement("span");
  label.className = "chat-label";
  label.textContent = role === "user" ? "You" : "KAIRO";
  messageNode.appendChild(label);

  if (message.imageAttached) {
    if (message.attachedImageDataUrl) {
      const img = document.createElement("img");
      img.src = message.attachedImageDataUrl;
      img.alt = "Attached image";
      img.style.cssText = "width:100%;border-radius:12px;margin-bottom:8px;display:block;max-height:240px;object-fit:cover;border:1px solid rgba(0,0,0,0.1);";
      messageNode.appendChild(img);
    } else {
      const imageHint = document.createElement("div");
      imageHint.className = "chat-content";
      imageHint.textContent = "[Image attached]";
      messageNode.appendChild(imageHint);
    }
  }

  const content = document.createElement("div");
  content.className = "chat-content";

  // Check if message contains a generated image URL
  if (message.generatedImageUrl) {
    const img = document.createElement("img");
    img.src = message.generatedImageUrl;
    img.alt = "Generated image";
    img.style.cssText = "width:100%;border-radius:16px;margin-top:6px;display:block;max-height:320px;object-fit:cover;border:2px solid rgba(255,200,0,0.3);";
    content.appendChild(img);
    if (text) {
      const caption = document.createElement("p");
      caption.style.cssText = "margin:8px 0 0;font-size:0.88rem;opacity:0.75;";
      caption.textContent = text;
      content.appendChild(caption);
    }
  } else if (role === "bot") {
    // Bot messages: render markdown as HTML
    content.innerHTML = parseMarkdown(text);
  } else {
    // User messages: plain text (safe, no markdown)
    content.textContent = text;
  }
  messageNode.appendChild(content);

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.innerHTML = `<span>${formatTime(new Date(message.time || Date.now()))}</span>`;
  messageNode.appendChild(meta);



  chatStreamEl.appendChild(messageNode);
  chatStreamEl.scrollTop = chatStreamEl.scrollHeight;
  updateHomeView();
}

function createEmptyState(text) {
  return `<div class="activity-item"><p>${text}</p></div>`;
}

function renderHistoryLists() {
  if (!state.chatHistory.length) {
    if (recentActivityEl) recentActivityEl.innerHTML = createEmptyState("No chat activity yet.");
    if (historyListEl) historyListEl.innerHTML = createEmptyState("Start chatting to build your history.");
    return;
  }

  const cards = state.chatHistory.map((session) => {
    const title = session.title || "Conversation";
    const preview = session.preview || "No preview";
    const date = formatDateLabel(session.timestamp);

    return `
      <button class="history-item" type="button" data-session-id="${session.id}">
        <strong>${title}</strong>
        <p>${preview}</p>
        <span class="history-meta">${date}</span>
      </button>
    `;
  });

  if (recentActivityEl) recentActivityEl.innerHTML = cards.slice(0, 4).join("");
  if (historyListEl) historyListEl.innerHTML = cards.join("");
}

function startNewSession(silent = false) {
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  state.currentSessionId = id;
  state.currentMessages = [];
  clearChatStream();
}

function persistCurrentSession() {
  if (!state.currentSessionId || state.currentMessages.length <= 0) return;

  const userMessages = state.currentMessages.filter((m) => m.role === "user");
  const botMessages = state.currentMessages.filter((m) => m.role === "bot");

  const firstUser = userMessages[0]?.text || "Conversation";
  const lastBot = botMessages[botMessages.length - 1]?.text || "";

  const session = {
    id: state.currentSessionId,
    title: firstUser.slice(0, 48),
    preview: lastBot.slice(0, 90),
    timestamp: Date.now(),
    messages: state.currentMessages.map(m => {
      const { attachedImageDataUrl, ...rest } = m;
      return rest;
    })
  };

  const index = state.chatHistory.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    state.chatHistory[index] = session;
  } else {
    state.chatHistory.unshift(session);
  }

  state.chatHistory = state.chatHistory.slice(0, 50);
  saveHistory();
  renderHistoryLists();
  renderProfile();
}

function loadSession(sessionId) {
  const session = state.chatHistory.find((item) => item.id === sessionId);
  if (!session) return;

  state.currentSessionId = session.id;
  state.currentMessages = [...session.messages];

  clearChatStream();
  state.currentMessages.forEach((message) => appendChatMessage(message));
  updateHomeView();
}

function setComposerDraft(text) {
  messageEl.value = text;
  messageEl.style.height = "auto";
  messageEl.style.height = `${Math.min(messageEl.scrollHeight, 120)}px`;

  if (homeMessageEl) {
    homeMessageEl.value = text;
    homeMessageEl.style.height = "auto";
    homeMessageEl.style.height = `${Math.min(homeMessageEl.scrollHeight, 120)}px`;
  }
}

// Transition lock — prevents rapid taps from corrupting nav state
let _screenTransitioning = false;

function setScreen(screenName, options = {}) {
  // If already showing this screen, do nothing
  if (state.activeScreen === screenName) return;

  // Block new transition if one is in progress (queue the latest one)
  if (_screenTransitioning) {
    clearTimeout(_screenTransitioning);
  }

  state.activeScreen = screenName;
  _screenTransitioning = true;

  closeHomeMenu();

  screenEls.forEach((screen) => {
    const isTarget = screen.dataset.screen === screenName;
    screen.classList.toggle("is-active", isTarget);

    // Reset scroll position of the shell inside each screen
    if (isTarget) {
      const shell = screen.querySelector(".screen-shell");
      if (shell) shell.scrollTop = 0;
    }
  });

  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.navTarget === screenName);
  });

  const shouldShowBottomNav = appScreens.has(screenName) && screenName !== "home";
  bottomNavEl.classList.toggle("is-hidden", !shouldShowBottomNav);

  if (screenName === "home" || screenName === "history") {
    renderHistoryLists();
    renderProfile();
  }

  if (screenName === "home") {
    // Focus the composer when landing on home screen
    setTimeout(() => messageEl?.focus(), 340);
  }

  if (options.prefill) setComposerDraft(options.prefill);
  if (!appScreens.has(screenName)) stopSpeaking();

  // Unlock after the CSS transition completes (300ms + small buffer)
  setTimeout(() => {
    _screenTransitioning = false;
  }, 330);
}


function closeHomeMenu() {
  if (!homeMenuEl) return;
  homeMenuEl.classList.add("is-hidden");
  homeMenuBtnEl?.setAttribute("aria-expanded", "false");
}

function toggleHomeMenu() {
  if (!homeMenuEl) return;
  const shouldOpen = homeMenuEl.classList.contains("is-hidden");
  homeMenuEl.classList.toggle("is-hidden", !shouldOpen);
  homeMenuBtnEl?.setAttribute("aria-expanded", String(shouldOpen));
}

// ─── Firebase Auth bridge ───

// Helper: get a time-based greeting
function getTimeGreeting(name) {
  const h = new Date().getHours();
  const first = (name || "there").split(" ")[0];
  if (h < 5)  return { headline: `Hey ${first}! 🌙`, sub: "Burning the midnight oil? KAIRO’s got you." };
  if (h < 12) return { headline: `Good morning, ${first}! ☀️`, sub: "Let’s have a great day together!" };
  if (h < 17) return { headline: `Good afternoon, ${first}! 🌤️`, sub: "What can KAIRO help with today?" };
  if (h < 21) return { headline: `Good evening, ${first}! 🌙`, sub: "KAIRO is ready whenever you are." };
  return       { headline: `Hey ${first}! 🌚`, sub: "KAIRO is here for you, night owl." };
}

// Splash element
const splashEl  = document.getElementById("kairo-splash");
const greetingEl = document.getElementById("kairo-greeting-overlay");
const greetingHeadline = document.getElementById("greeting-headline");
const greetingSubline  = document.getElementById("greeting-subline");
const greetingBtn      = document.getElementById("greeting-start-btn");

function hideSplash() {
  if (splashEl) splashEl.classList.add("is-hidden");
}

function showGreeting(user) {
  const name = user?.displayName || state.profile.name || "there";
  const { headline, sub } = getTimeGreeting(name);
  if (greetingHeadline) greetingHeadline.textContent = headline;
  if (greetingSubline)  greetingSubline.textContent  = sub;
  if (greetingEl) greetingEl.classList.remove("is-hidden");
}

function hideGreeting() {
  if (greetingEl) greetingEl.classList.add("is-hidden");
}

// Greeting "Let's Chat" button → go to Home (not directly to chat)
if (greetingBtn) {
  greetingBtn.addEventListener("click", () => {
    hideGreeting();
    setScreen("home");
  });
}


// These are called by firebase-auth.js after successful login
window.__kairoSetProfile = function ({ name, email, photoURL }) {
  state.profile.name     = name     || "User";
  state.profile.email    = email    || "";
  state.profile.photoURL = photoURL || "";
  saveProfile();
  renderProfile();
};

// Called by firebase-auth.js to load Firestore chat history into app state
window.__kairoLoadHistory = function (firestoreHistory) {
  if (!firestoreHistory || !Array.isArray(firestoreHistory)) return;
  // Merge: prefer Firestore data (it's the source of truth after deploy)
  if (firestoreHistory.length > 0) {
    state.chatHistory = firestoreHistory;
    saveHistory();
    renderHistoryLists();
    renderProfile();
    console.log("[KAIRO] Firestore chat history synced:", firestoreHistory.length, "sessions");
  }
};

window.__kairoGoHome = function (user, isNewUser = false) {
  if (user) {
    const name = user.displayName || user.email?.split("@")[0] || "User";
    state.profile.name     = name;
    state.profile.email    = user.email    || "";
    state.profile.photoURL = user.photoURL || "";
    saveProfile();
    renderProfile();
  }

  hideSplash();

  if (isNewUser) {
    setTimeout(() => showGreeting(user), 80);
  } else {
    setScreen("home");
  }
};

// Expose splash/greeting hide for firebase-auth.js
window.__kairoHideSplash    = hideSplash;
window.__kairoShowGreeting  = showGreeting;
window.__kairoHideGreeting  = hideGreeting;

// Allows firebase-auth.js to navigate any screen (e.g. back to onboarding on sign-out)
window.__kairoSetScreen = function (screenName) {
  hideSplash();
  setScreen(screenName);
};

// ─── Auth form submit — delegates to Firebase ───
function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formId = form.id;

  const email    = form.querySelector("[name='email']")?.value?.trim() || "";
  const password = form.querySelector("[name='password']")?.value?.trim() || "";
  const name     = form.querySelector("[name='name']")?.value?.trim() || "";

  const fb = window.__firebaseAuth;

  if (!fb) {
    // Firebase not loaded yet — fallback to local mode
    if (name) state.profile.name = name;
    else if (email && state.profile.name === "User") state.profile.name = email.split("@")[0] || "User";
    state.profile.email = email || state.profile.email;
    saveProfile();
    renderProfile();
    setScreen("home");
    return;
  }

  if (formId === "signup-form") {
    fb.signUp(name, email, password);
  } else {
    fb.signIn(email, password);
  }
}

function buildModelHistory() {
  // Silently include messages from the previous session to maintain long-term memory
  let pastMessages = [];
  if (state.chatHistory && state.chatHistory.length > 0) {
    const lastSession = state.chatHistory[state.chatHistory.length - 1];
    // Only pull from lastSession if we are currently in a new, different session
    if (lastSession.id !== state.currentSessionId) {
      pastMessages = lastSession.messages || [];
    }
  }

  const allMessages = [...pastMessages, ...state.currentMessages]
    .filter((msg) => msg.role === "user" || msg.role === "bot");
  
  // Remove the very last message since it's the current user prompt being sent
  if (allMessages.length > 0 && allMessages[allMessages.length - 1].role === "user") {
    allMessages.pop();
  }

  return allMessages
    .slice(-10)
    .map((msg) => ({
      role: msg.role === "bot" ? "assistant" : "user",
      content: msg.text
    }));
}

targetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    if (!target) return;

    if (button.dataset.prefill) {
      setScreen(target, { prefill: button.dataset.prefill });
      return;
    }

    setScreen(target);
  });
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.navTarget;
    if (target) setScreen(target);
  });
});

homeMenuBtnEl?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleHomeMenu();
});

homeMenuEl?.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", (event) => {
  if (!homeMenuEl || homeMenuEl.classList.contains("is-hidden")) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (homeMenuEl.contains(target) || homeMenuBtnEl?.contains(target)) return;
  closeHomeMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHomeMenu();
});

signinFormEl?.addEventListener("submit", submitAuth);
signupFormEl?.addEventListener("submit", submitAuth);

// ─── Forgot Password ───
document.getElementById("forgot-password-btn")?.addEventListener("click", () => {
  const emailVal = document.getElementById("signin-email")?.value?.trim();
  const fb = window.__firebaseAuth;
  if (fb) fb.forgotPassword(emailVal);
  else alert("Firebase is still loading. Please wait a moment and try again.");
});

// ─── Google Sign-In / Sign-Up buttons ───
["google-signin-btn", "google-signup-btn"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", () => {
    const fb = window.__firebaseAuth;
    if (fb) fb.googleSignIn();
    else alert("Firebase is still loading. Please wait a moment.");
  });
});

// ─── Apple Sign-In / Sign-Up buttons ───
["apple-signin-btn", "apple-signup-btn"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", () => {
    const fb = window.__firebaseAuth;
    if (fb) fb.appleSignIn();
    else alert("Firebase is still loading. Please wait a moment.");
  });
});

speechToggleEl?.addEventListener("click", () => {
  unlockSpeech();
  state.autoSpeakEnabled = !state.autoSpeakEnabled;
  localStorage.setItem(STORAGE_VOICE, state.autoSpeakEnabled ? "on" : "off");
  updateSpeechToggle();
  renderProfile();

  if (!state.autoSpeakEnabled) stopSpeaking();
});

homeSpeechToggleEl?.addEventListener("click", () => {
  unlockSpeech();
  state.autoSpeakEnabled = !state.autoSpeakEnabled;
  localStorage.setItem(STORAGE_VOICE, state.autoSpeakEnabled ? "on" : "off");
  updateSpeechToggle();
  renderProfile();

  if (!state.autoSpeakEnabled) stopSpeaking();
});

clearChatEl?.addEventListener("click", () => {
  stopSpeaking();
  state.attachedImage.chat = null;
  state.attachedImage.home = null;
  imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
});

newChatEl?.addEventListener("click", () => {
  stopSpeaking();
  persistCurrentSession();
  state.attachedImage.chat = null;
  state.attachedImage.home = null;
  imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
});

homeNewChatBtnEl?.addEventListener("click", () => {
  stopSpeaking();
  persistCurrentSession();
  state.attachedImage.chat = null;
  state.attachedImage.home = null;
  imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
});

homeClearChatBtnEl?.addEventListener("click", () => {
  stopSpeaking();

  state.attachedImage.chat = null;
  state.attachedImage.home = null;
  if (imageInputEl) imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  // Close menu
  closeHomeMenu();

  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
  updateHomeView();
  renderProfile();
});

homeMenuNewChatEl?.addEventListener("click", () => {
  stopSpeaking();
  persistCurrentSession();

  // Reset attached images
  state.attachedImage.chat = null;
  state.attachedImage.home = null;
  if (imageInputEl) imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  // Close menu first
  closeHomeMenu();

  // Start fresh session and show home screen with greeting
  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
  updateHomeView();      // ← shows greeting, hides stale chat stream
  renderProfile();       // ← refreshes greeting text with correct time
});

async function handleImageInputChange(mode) {
  const inputEl = mode === "home" ? homeImageInputEl : imageInputEl;
  const file = inputEl?.files?.[0];

  if (!file) {
    state.attachedImage[mode] = null;
    renderImagePreview(mode);
    return;
  }

  if (!file.type.startsWith("image/")) {
    appendChatMessage({ role: "bot", text: "Please attach a valid image file.", time: Date.now() });
    if (inputEl) inputEl.value = "";
    state.attachedImage[mode] = null;
    renderImagePreview(mode);
    return;
  }

  const dataUrl = await readImageAsDataUrl(file);
  state.attachedImage[mode] = { name: file.name, size: file.size, dataUrl };
  renderImagePreview(mode);
}

imageInputEl.addEventListener("change", () => handleImageInputChange("chat"));
homeImageInputEl?.addEventListener("change", () => handleImageInputChange("home"));

sttBtnEl?.addEventListener("click", () => startSpeechToText(messageEl, sttBtnEl));
homeSttBtnEl?.addEventListener("click", () => startSpeechToText(homeMessageEl, homeSttBtnEl));

function autoResizeTextarea(textareaEl) {
  textareaEl.style.height = "auto";
  textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 120)}px`;
}

messageEl.addEventListener("input", () => {
  autoResizeTextarea(messageEl);
});

homeMessageEl?.addEventListener("input", () => {
  autoResizeTextarea(homeMessageEl);
});

messageEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitComposer("chat");
  }
});

homeMessageEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitComposer("home");
  }
});

async function submitComposer(mode) {
  unlockSpeech(); // Mobile requires speech synthesis to be initialized synchronously from user action
  const textEl = mode === "home" ? homeMessageEl : messageEl;
  const sendButtonEl = mode === "home" ? homeSendEl : sendEl;

  const message = textEl.value.trim();
  const attachedImage = state.attachedImage[mode];

  if (!message && !attachedImage) return;

  if (!state.currentSessionId) startNewSession();

  const userMsg = {
    role: "user",
    text: message || "Image attached for solving.",
    time: Date.now(),
    imageAttached: Boolean(attachedImage),
    attachedImageDataUrl: attachedImage?.dataUrl || null
  };

  state.currentMessages.push(userMsg);
  appendChatMessage(userMsg);

  if (mode === "home") {
    // 'chat' screen no longer exists — home screen IS the chat screen
    setScreen("home");
  }

  textEl.value = "";
  autoResizeTextarea(textEl);
  sendButtonEl.disabled = true;

  // Clear the image preview immediately before sending to API
  const requestImageDataUrl = attachedImage?.dataUrl || null;
  state.attachedImage[mode] = null;
  if (mode === "home" && homeImageInputEl) homeImageInputEl.value = "";
  if (mode === "chat") imageInputEl.value = "";
  renderImagePreview(mode);

  const typingNode = document.createElement("article");
  typingNode.className = "chat-message chat-message--bot";
  typingNode.innerHTML = `
    <span class="chat-label">KAIRO</span>
    <div class="chat-content"><span class="typing"><i></i><i></i><i></i></span></div>
  `;
  chatStreamEl.appendChild(typingNode);
  chatStreamEl.scrollTop = chatStreamEl.scrollHeight;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || "Please solve the image I attached.",
        history: buildModelHistory(),
        imageDataUrl: requestImageDataUrl
      })
    });

    const data = await response.json();
    typingNode.remove();

    let reply = response.ok ? data.reply : data.error || "Something went wrong.";

    // Check if bot wants to generate an image
    const imgMatch = reply.match(/\[GENERATE_IMAGE:\s*(.+?)\]/i);
    if (imgMatch) {
      const imagePrompt = imgMatch[1].trim();

      // Show a "generating" message
      const genNode = document.createElement("article");
      genNode.className = "chat-message chat-message--bot";
      genNode.innerHTML = `
        <span class="chat-label">KAIRO</span>
        <div class="chat-content">🎨 Generating your image... please wait</div>
      `;
      chatStreamEl.appendChild(genNode);
      chatStreamEl.scrollTop = chatStreamEl.scrollHeight;

      try {
        const imgResponse = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: imagePrompt })
        });
        const imgData = await imgResponse.json();
        genNode.remove();

        if (imgResponse.ok && imgData.imageUrl) {
          const botMsg = {
            role: "bot",
            text: `Here's your image of: ${imagePrompt}`,
            time: Date.now(),
            imageAttached: false,
            generatedImageUrl: imgData.imageUrl
          };
          state.currentMessages.push(botMsg);
          appendChatMessage(botMsg);
        } else {
          const botMsg = {
            role: "bot",
            text: `Sorry, I couldn't generate that image. ${imgData.error || ""} Try describing it differently!`,
            time: Date.now(),
            imageAttached: false
          };
          state.currentMessages.push(botMsg);
          appendChatMessage(botMsg);
        }
      } catch {
        genNode.remove();
        const botMsg = {
          role: "bot",
          text: "Network error while generating image. Please try again.",
          time: Date.now(),
          imageAttached: false
        };
        state.currentMessages.push(botMsg);
        appendChatMessage(botMsg);
      }
    } else {
      const botMsg = {
        role: "bot",
        text: reply,
        time: Date.now(),
        imageAttached: false
      };
      state.currentMessages.push(botMsg);
      appendChatMessage(botMsg);

      if (response.ok && state.autoSpeakEnabled) {
        speakText(reply);
      }
    }

    persistCurrentSession();
  } catch {
    typingNode.remove();
    const botMsg = {
      role: "bot",
      text: "Network error. Please try again.",
      time: Date.now(),
      imageAttached: false
    };
    state.currentMessages.push(botMsg);
    appendChatMessage(botMsg);
    persistCurrentSession();
  } finally {
    sendButtonEl.disabled = false;
    textEl.focus();
  }
}

chatFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitComposer("chat");
});

homeChatFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitComposer("home");
});

function handleHistoryClick(event) {
  const card = event.target.closest("[data-session-id]");
  if (!card) return;

  const sessionId = card.getAttribute("data-session-id");
  if (!sessionId) return;

  loadSession(sessionId);   // loads messages + calls updateHomeView
  setScreen("home");        // navigate to home (which is the chat screen)
}

recentActivityEl?.addEventListener("click", handleHistoryClick);
historyListEl?.addEventListener("click", handleHistoryClick);

// ─── Sign Out: wire all [data-target="signin"] buttons to Firebase ───
document.querySelectorAll("[data-target='signin']").forEach((btn) => {
  // Only intercept the Sign Out button in the home menu (not the auth buttons)
  if (btn.textContent.trim().toLowerCase() === "sign out") {
    btn.addEventListener("click", () => {
      const fb = window.__firebaseAuth;
      if (fb) fb.signOut();
    });
  }
});

function updateHomeView() {
  const hasMessages = state.currentMessages.length > 0;
  if (hasMessages) {
    kairoHomeGreetingEl?.classList.add("is-hidden");
    chatStreamEl?.classList.remove("is-hidden");
  } else {
    kairoHomeGreetingEl?.classList.remove("is-hidden");
    chatStreamEl?.classList.add("is-hidden");
  }
}

updateSpeechToggle();
renderProfile();
renderImagePreview("chat");
renderImagePreview("home");
renderHistoryLists();

startNewSession(true);

setScreen("onboarding");


