// ─── KAIRO · Firebase Authentication ───
// Uses Firebase v10 CDN (ES module)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ─── Firebase Config ───
const firebaseConfig = {
  apiKey: "AIzaSyA3dNPe3jMQ8CLj8kscirHEhaoIUhyxnm0",
  authDomain: "kairo-8b9ce.firebaseapp.com",
  projectId: "kairo-8b9ce",
  storageBucket: "kairo-8b9ce.firebasestorage.app",
  messagingSenderId: "685824038955",
  appId: "1:685824038955:web:5d1230a958253b0ba8b26e",
  measurementId: "G-9GFR9WRRPL"
};

// ─── Initialize Firebase ───
const firebaseApp = initializeApp(firebaseConfig);
const analytics  = getAnalytics(firebaseApp);
const auth       = getAuth(firebaseApp);
const provider   = new GoogleAuthProvider();

// Hint to show all Google accounts in picker
provider.setCustomParameters({ prompt: "select_account" });

// ─── Check if running on a proper HTTP origin ───
function isFileProtocol() {
  return location.protocol === "file:";
}

// ─── UI Helpers ───
function showAuthError(msg, isSuccess = false) {
  document.querySelectorAll(".firebase-error").forEach((el) => el.remove());

  const err = document.createElement("p");
  err.className = "firebase-error";
  err.textContent = msg;

  if (isSuccess) {
    err.style.cssText =
      "color:#1a7a4a;font-size:0.85rem;font-weight:600;margin:0;padding:8px 12px;" +
      "background:rgba(26,122,74,0.1);border-radius:10px;border:1px solid rgba(26,122,74,0.25);" +
      "line-height:1.4;";
  } else {
    err.style.cssText =
      "color:#a32b1a;font-size:0.85rem;font-weight:600;margin:0;padding:8px 12px;" +
      "background:rgba(192,57,43,0.1);border-radius:10px;border:1px solid rgba(192,57,43,0.2);" +
      "line-height:1.4;";
  }

  const activeForm =
    document.querySelector(".screen--auth.is-active form") ||
    document.querySelector("#signin-form");
  if (activeForm) {
    const btn = activeForm.querySelector(".cta-button");
    if (btn) activeForm.insertBefore(err, btn);
    else activeForm.appendChild(err);
  }
}

function clearAuthErrors() {
  document.querySelectorAll(".firebase-error").forEach((el) => el.remove());
}

function setButtonLoading(btn, loading, loadText = "Please wait…") {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = loadText;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

// ─── Friendly error messages ───
function friendlyError(code) {
  console.warn("[KAIRO Firebase] Auth error code:", code); // helpful for debugging
  const map = {
    "auth/invalid-email":             "❌ Invalid email address.",
    "auth/user-not-found":            "❌ No account found with this email.",
    "auth/wrong-password":            "❌ Incorrect password. Try again.",
    "auth/invalid-credential":        "❌ Incorrect email or password.",
    "auth/email-already-in-use":      "❌ Email already registered. Sign in instead.",
    "auth/weak-password":             "❌ Password must be at least 6 characters.",
    "auth/too-many-requests":         "⏳ Too many attempts. Wait a moment and retry.",
    "auth/network-request-failed":    "❌ Network error. Check your connection.",
    "auth/popup-blocked":
      "🚫 Popup was blocked by your browser. Allow popups for this site and try again.",
    "auth/popup-closed-by-user":      "", // silent
    "auth/cancelled-popup-request":   "", // silent
    "auth/unauthorized-domain":
      "🚫 Domain not authorized in Firebase Console. Add this domain to Authorized Domains in Firebase Authentication settings.",
    "auth/operation-not-allowed":
      "⚙️ Google Sign-In is not enabled in Firebase Console. Enable it under Authentication → Sign-in methods.",
    "auth/account-exists-with-different-credential":
      "❌ An account already exists with this email using a different sign-in method.",
    "auth/internal-error":
      "⚙️ Firebase internal error. Make sure Google Sign-In is enabled in Firebase Console.",
    "auth/missing-or-invalid-nonce":  "❌ Auth nonce error. Please try again.",
    "auth/app-not-authorized":
      "⚙️ This app is not authorized. Check your Firebase project settings."
  };
  return map[code] || `❌ Something went wrong (${code || "unknown"}). Please try again.`;
}

// ─── Check redirect result on page load ───
// (Handles Google redirect flow after returning from Google's page)
getRedirectResult(auth)
  .then((result) => {
    if (result?.user) {
      clearAuthErrors();
      const additionalInfo = getAdditionalUserInfo(result);
      const isNewUser = additionalInfo?.isNewUser || false;
      if (window.__kairoGoHome) window.__kairoGoHome(result.user, isNewUser);
    }
  })
  .catch((err) => {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  });

// ─── Auth State Listener ───
// Fires on page load to restore session & handle navigation
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in — sync profile
    const displayName = user.displayName || user.email?.split("@")[0] || "User";
    const email    = user.email    || "";
    const photoURL = user.photoURL || "";

    if (window.__kairoSetProfile) {
      window.__kairoSetProfile({ name: displayName, email, photoURL });
    }

    // Auto-navigate: show greeting then go to chat
    const activeScreen = document.querySelector(".screen.is-active");
    const authScreens  = ["onboarding", "signin", "signup"];
    if (!activeScreen || authScreens.includes(activeScreen.dataset?.screen)) {
      if (window.__kairoGoHome) window.__kairoGoHome(user, false);
    } else {
      // Already on an app screen — just hide the splash if visible
      if (window.__kairoHideSplash) window.__kairoHideSplash();
    }
  } else {
    // User signed out — hide splash, go back to onboarding
    if (window.__kairoHideSplash) window.__kairoHideSplash();
    if (window.__kairoHideGreeting) window.__kairoHideGreeting();

    const activeScreen = document.querySelector(".screen.is-active");
    const appScreens   = ["home", "chat", "history", "profile"];
    if (activeScreen && appScreens.includes(activeScreen.dataset?.screen)) {
      setTimeout(() => {
        if (window.__kairoSetScreen) window.__kairoSetScreen("onboarding");
      }, 100);
    } else {
      // First load, no user — just hide the splash to show onboarding
      setTimeout(() => {
        if (window.__kairoHideSplash) window.__kairoHideSplash();
      }, 1200); // let splash play for at least 1.2s before revealing onboarding
    }
  }
});

// ─── Sign In ───
export async function firebaseSignIn(email, password) {
  clearAuthErrors();
  const btn = document.querySelector("#signin-form .cta-button[type='submit']");
  setButtonLoading(btn, true, "Signing in…");

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    clearAuthErrors();
    if (window.__kairoGoHome) window.__kairoGoHome(cred.user, false);
  } catch (err) {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Sign Up ───
export async function firebaseSignUp(name, email, password) {
  clearAuthErrors();
  const btn = document.querySelector("#signup-form .cta-button[type='submit']");
  setButtonLoading(btn, true, "Creating account…");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    clearAuthErrors();
    if (window.__kairoGoHome) window.__kairoGoHome(cred.user, true);
  } catch (err) {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Google Sign In ───
// Uses popup on HTTP, redirect on file:// (redirect won't fully work on file://)
export async function firebaseGoogleSignIn() {
  clearAuthErrors();

  // Guard: file:// protocol will never work with Google OAuth
  if (isFileProtocol()) {
    showAuthError(
      "🚫 Google Sign-In requires the app to run on http://localhost:3000.\n" +
      "Open your browser and go to: http://localhost:3000"
    );
    return;
  }

  const googleBtn = document.getElementById("google-signin-btn");
  setButtonLoading(googleBtn, true, "Opening Google…");

  try {
    // Try popup first
    const result = await signInWithPopup(auth, provider);
    const additionalInfo = getAdditionalUserInfo(result);
    const isNewUser = additionalInfo?.isNewUser || false;
    clearAuthErrors();
    if (window.__kairoGoHome) window.__kairoGoHome(result.user, isNewUser);
  } catch (err) {
    // If popup is blocked, fall back to redirect
    if (err.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(auth, provider);
        // after redirect, getRedirectResult() at top handles the result
      } catch (redirectErr) {
        const msg = friendlyError(redirectErr.code);
        if (msg) showAuthError(msg);
      }
    } else {
      const msg = friendlyError(err.code);
      if (msg) showAuthError(msg);
    }
  } finally {
    setButtonLoading(googleBtn, false);
  }
}

// ─── Sign Out ───
export async function firebaseSignOut() {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}

// ─── Forgot Password ───
export async function firebaseForgotPassword(email) {
  clearAuthErrors();
  if (!email) {
    showAuthError("Enter your email address first, then tap Forgot Password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthError("✅ Password reset email sent! Check your inbox.", true);
  } catch (err) {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  }
}

// ─── Expose to global scope for app.js to call ───
window.__firebaseAuth = {
  signIn:          firebaseSignIn,
  signUp:          firebaseSignUp,
  googleSignIn:    firebaseGoogleSignIn,
  signOut:         firebaseSignOut,
  forgotPassword:  firebaseForgotPassword,
  getCurrentUser:  () => auth.currentUser
};
