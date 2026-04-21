const STORAGE_PROFILE = "kairo_profile";
const STORAGE_HISTORY = "kairo_history";
const STORAGE_VOICE = "kairo_voice";

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

const appScreens = new Set(["home", "chat", "history", "profile"]);
const initialChatGreeting = "BEEP BOOP! Hello! I am KAIRO, your AI assistant.";

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
  const hour = new Date().getHours();
  const name = state.profile.name || "there";

  if (hour < 12) return `Good Morning, ${name} ☀️`;
  if (hour < 18) return `Good Afternoon, ${name} 🌤️`;
  return `Good Evening, ${name} 🌙`;
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

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window) || !text) return;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function updateSpeechToggle() {
  const enabled = String(state.autoSpeakEnabled);
  if (speechToggleEl) speechToggleEl.setAttribute("aria-pressed", enabled);
  if (homeSpeechToggleEl) homeSpeechToggleEl.setAttribute("aria-pressed", enabled);
}

function startSpeechToText(textareaEl, triggerBtnEl) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    appendChatMessage({ role: "bot", text: "Speech-to-text is not supported in this browser.", time: Date.now() });
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  if (triggerBtnEl) triggerBtnEl.disabled = true;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;

    const nextValue = textareaEl.value.trim();
    textareaEl.value = nextValue ? `${nextValue} ${transcript}` : transcript;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 120)}px`;
  };

  recognition.onend = () => {
    if (triggerBtnEl) triggerBtnEl.disabled = false;
    textareaEl.focus();
  };

  recognition.onerror = () => {
    if (triggerBtnEl) triggerBtnEl.disabled = false;
  };

  recognition.start();
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
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
    const imageHint = document.createElement("div");
    imageHint.className = "chat-content";
    imageHint.textContent = "[Image attached]";
    messageNode.appendChild(imageHint);
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
  } else {
    content.textContent = text;
  }
  messageNode.appendChild(content);

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.innerHTML = `<span>${formatTime(new Date(message.time || Date.now()))}</span>`;
  messageNode.appendChild(meta);

  if (role === "bot") {
    const actions = document.createElement("div");
    actions.className = "chat-actions";

    const speakButton = document.createElement("button");
    speakButton.type = "button";
    speakButton.className = "speak-btn";
    speakButton.textContent = "Speak";
    speakButton.addEventListener("click", () => speakText(text));

    actions.appendChild(speakButton);
    messageNode.appendChild(actions);
  }

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

function startNewSession() {
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  state.currentSessionId = id;
  state.currentMessages = [
    {
      role: "bot",
      text: initialChatGreeting,
      time: Date.now(),
      imageAttached: false
    }
  ];
}

function persistCurrentSession() {
  if (!state.currentSessionId || state.currentMessages.length <= 1) return;

  const userMessages = state.currentMessages.filter((m) => m.role === "user");
  const botMessages = state.currentMessages.filter((m) => m.role === "bot");

  const firstUser = userMessages[0]?.text || "Conversation";
  const lastBot = botMessages[botMessages.length - 1]?.text || "";

  const session = {
    id: state.currentSessionId,
    title: firstUser.slice(0, 48),
    preview: lastBot.slice(0, 90),
    timestamp: Date.now(),
    messages: state.currentMessages
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

  if (screenName === "chat") {
    setTimeout(() => messageEl.focus(), 340); // wait for transition
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

window.__kairoGoHome = function (user, isNewUser = false) {
  if (user) {
    const name     = user.displayName || user.email?.split("@")[0] || "User";
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
  return state.currentMessages
    .filter((msg) => msg.role === "user" || msg.role === "bot")
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

// ─── Google Sign In (Sign In screen) ───
document.getElementById("google-signin-btn")?.addEventListener("click", () => {
  const fb = window.__firebaseAuth;
  if (fb) fb.googleSignIn();
  else alert("Firebase is still loading. Please wait a moment and try again.");
});

// ─── Google Sign In (Sign Up screen) ───
document.getElementById("google-signup-btn")?.addEventListener("click", () => {
  const fb = window.__firebaseAuth;
  if (fb) fb.googleSignIn();
  else alert("Firebase is still loading. Please wait a moment and try again.");
});

speechToggleEl?.addEventListener("click", () => {
  state.autoSpeakEnabled = !state.autoSpeakEnabled;
  localStorage.setItem(STORAGE_VOICE, state.autoSpeakEnabled ? "on" : "off");
  updateSpeechToggle();
  renderProfile();

  if (!state.autoSpeakEnabled) stopSpeaking();
});

homeSpeechToggleEl?.addEventListener("click", () => {
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
  imageInputEl.value = "";
  if (homeImageInputEl) homeImageInputEl.value = "";
  renderImagePreview("chat");
  renderImagePreview("home");
  setComposerDraft("");

  startNewSession();
  clearChatStream();
  appendChatMessage(state.currentMessages[0]);
});

homeMenuNewChatEl?.addEventListener("click", () => {
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
  closeHomeMenu();
  setScreen("chat");
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
    imageAttached: Boolean(attachedImage)
  };

  state.currentMessages.push(userMsg);
  appendChatMessage(userMsg);

  if (mode === "home") {
    setScreen("chat");
  }

  textEl.value = "";
  autoResizeTextarea(textEl);
  sendButtonEl.disabled = true;

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
        imageDataUrl: attachedImage?.dataUrl || null
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

    state.attachedImage[mode] = null;
    if (mode === "home" && homeImageInputEl) homeImageInputEl.value = "";
    if (mode === "chat") imageInputEl.value = "";
    renderImagePreview(mode);
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

  loadSession(sessionId);
  setScreen("chat");
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
  const hasMessages = state.currentMessages.length > 1;
  if (hasMessages) {
    kairoHomeGreetingEl?.classList.add("is-hidden");
    homeChatActionsEl?.classList.remove("is-hidden");
    chatStreamEl?.classList.remove("is-hidden");
  } else {
    kairoHomeGreetingEl?.classList.remove("is-hidden");
    homeChatActionsEl?.classList.add("is-hidden");
    chatStreamEl?.classList.add("is-hidden");
  }
}

updateSpeechToggle();
renderProfile();
renderImagePreview("chat");
renderImagePreview("home");
renderHistoryLists();

startNewSession();
clearChatStream();
appendChatMessage(state.currentMessages[0]);

setScreen("onboarding");
