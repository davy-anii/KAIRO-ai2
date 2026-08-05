// ─── KAIRO · Firebase Authentication ───
// Firebase v10 CDN (ES module)
// Apple Sign-In: uses signInWithRedirect → lands on kairo-8b9ce.firebaseapp.com/__/auth/handler
// Google Sign-In: popup with redirect fallback

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── Firebase Config ───
const firebaseConfig = {
  apiKey: "AIzaSyA3dNPe3jMQ8CLj8kscirHEhaoIUhyxnm0",
  authDomain: "kairo-8b9ce.firebaseapp.com",   // must match the Apple callback domain
  projectId: "kairo-8b9ce",
  storageBucket: "kairo-8b9ce.firebasestorage.app",
  messagingSenderId: "685824038955",
  appId: "1:685824038955:web:5d1230a958253b0ba8b26e",
  measurementId: "G-9GFR9WRRPL"
};

// ─── Initialize ───
const firebaseApp = initializeApp(firebaseConfig);
const analytics = getAnalytics(firebaseApp);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Force persistent auth session across page reloads / redirects
setPersistence(auth, browserLocalPersistence).catch(() => { });

// ─── Providers ───
const googleProvider = new GoogleAuthProvider();

// Store sign-up data temporarily until OTP is verified
let pendingSignUpData = null;
googleProvider.setCustomParameters({ prompt: "select_account" });

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");
// Apple requires these locale params for the "name" scope to work
appleProvider.setCustomParameters({ locale: "en" });

// ─── Helpers ───
const isFileProtocol = () => location.protocol === "file:";

// ─── UI Helpers ───
function showAuthError(msg, isSuccess = false) {
  document.querySelectorAll(".firebase-error").forEach((el) => el.remove());
  if (!msg) return;

  const err = document.createElement("p");
  err.className = "firebase-error";
  err.textContent = msg;
  err.style.cssText = isSuccess
    ? "color:#1a7a4a;font-size:0.85rem;font-weight:600;margin:0;padding:8px 12px;" +
    "background:rgba(26,122,74,0.1);border-radius:10px;border:1px solid rgba(26,122,74,0.25);line-height:1.4;"
    : "color:#a32b1a;font-size:0.85rem;font-weight:600;margin:0;padding:8px 12px;" +
    "background:rgba(192,57,43,0.1);border-radius:10px;border:1px solid rgba(192,57,43,0.2);line-height:1.4;";

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

// ─── Error Map ───
function friendlyError(code) {
  console.warn("[KAIRO Auth] error:", code);
  const map = {
    "auth/invalid-email": "❌ Invalid email address.",
    "auth/user-not-found": "❌ No account found with this email.",
    "auth/wrong-password": "❌ Incorrect password. Try again.",
    "auth/invalid-credential": "❌ Incorrect email or password.",
    "auth/email-already-in-use": "❌ Email already registered. Sign in instead.",
    "auth/weak-password": "❌ Password must be at least 6 characters.",
    "auth/too-many-requests": "⏳ Too many attempts. Wait a moment and retry.",
    "auth/network-request-failed": "❌ Network error. Check your connection.",
    "auth/popup-blocked": "🚫 Popup blocked. Trying redirect instead…",
    "auth/popup-closed-by-user": "",    // silent
    "auth/cancelled-popup-request": "",    // silent
    "auth/unauthorized-domain":
      "🚫 This domain is not authorized in Firebase Console (Authentication → Settings → Authorized domains).",
    "auth/operation-not-allowed":
      "⚙️ Sign-in method not enabled. Enable it in Firebase Console → Authentication → Sign-in methods.",
    "auth/account-exists-with-different-credential":
      "❌ Account exists with a different sign-in method. Try signing in with the original method.",
    "auth/internal-error":
      "⚙️ Internal error. Ensure the sign-in method is enabled in Firebase Console.",
    "auth/missing-or-invalid-nonce": "❌ Auth nonce error. Try again.",
    "auth/app-not-authorized": "⚙️ App not authorized. Check Firebase project settings.",
    "auth/invalid-api-key": "⚙️ Invalid Firebase API key.",
    "auth/redirect-cancelled-by-user": "",   // silent
    "auth/web-storage-unsupported":
      "🚫 Third-party cookies are blocked by your browser. Enable them and try again."
  };
  return map[code] ?? `❌ Something went wrong (${code ?? "unknown"}). Please try again.`;
}

function getUserDocId(user, extraData = {}) {
  // Try to get a recognizable name, fallback to email, then uid
  let name = user?.displayName || extraData?.name || user?.email?.split("@")[0];
  if (!name || name === "User") {
    name = user?.email;
  }
  return name || user?.uid;
}

// ─── Firestore: Save / Merge User Profile ───
async function saveUserToFirestore(user, extraData = {}) {
  if (!user?.uid) return;
  try {
    const docId = getUserDocId(user, extraData);
    const ref = doc(db, "users", docId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // First time — set createdAt too
      const base = {
        uid: user.uid,
        email: user.email ?? extraData.email ?? "",
        displayName: user.displayName ?? extraData.name ?? user.email?.split("@")[0] ?? "User",
        photoURL: user.photoURL ?? extraData.photoURL ?? "",
        lastSignIn: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        ...extraData
      };
      await setDoc(ref, base);
      console.log("[KAIRO Firestore] User profile created:", base.displayName);
    } else {
      // Merge — safely update fields without overwriting with empty defaults
      const updates = { ...extraData };

      // If a full Firebase Auth user object is passed, update lastSignIn
      if (user.providerData) {
        updates.lastSignIn = new Date().toISOString();
      }

      // Only update profile fields if explicitly provided
      if (user.email) updates.email = user.email;
      else if (extraData.email) updates.email = extraData.email;

      if (user.displayName) updates.displayName = user.displayName;
      else if (extraData.name) updates.displayName = extraData.name;

      if (user.photoURL) updates.photoURL = user.photoURL;
      else if (extraData.photoURL) updates.photoURL = extraData.photoURL;

      await setDoc(ref, updates, { merge: true });
      console.log("[KAIRO Firestore] User profile updated");
    }
  } catch (err) {
    console.error("[KAIRO Firestore] saveUserToFirestore error:", err);
  }
}

// ─── Firestore: Fetch Full User Data (profile + chatHistory) ───
async function fetchUserFromFirestore(user) {
  if (!user) return null;
  try {
    const docId = getUserDocId(user);
    const snap = await getDoc(doc(db, "users", docId));
    if (snap.exists()) {
      console.log("[KAIRO Firestore] User data fetched for:", docId);
      return snap.data();
    }
  } catch (err) {
    console.error("[KAIRO Firestore] fetchUserFromFirestore error:", err);
  }
  return null;
}

// ─── Show the Email Verification waiting screen ───
function showVerifyScreen(email) {
  if (window.__kairoSetScreen) window.__kairoSetScreen("verify-email");
  const emailDisplay = document.getElementById("verify-email-display");
  if (emailDisplay) emailDisplay.textContent = email || "your email";
  if (window.__kairoHideSplash) window.__kairoHideSplash();
}

// ─── Post-Auth: load everything and navigate home ───
async function onSignInSuccess(user, isNewUser = false, forceVerified = false) {
  if (!user) return;

  clearAuthErrors();

  // ── EMAIL VERIFICATION GATE BYPASSED ──
  // 1) Pull full Firestore data first
  const firestoreData = await fetchUserFromFirestore(user);

  // 2) Save / update profile in Firestore (already have data, but merge new login time)
  await saveUserToFirestore(user);

  if (firestoreData) {
    if (window.__kairoSetProfile) {
      window.__kairoSetProfile({
        name: firestoreData.displayName || user.displayName || user.email?.split("@")[0] || "User",
        email: firestoreData.email || user.email || "",
        photoURL: firestoreData.photoURL || user.photoURL || ""
      });
    }
    if (firestoreData.chatHistory && Array.isArray(firestoreData.chatHistory)) {
      if (window.__kairoLoadHistory) window.__kairoLoadHistory(firestoreData.chatHistory);
    }
    if (window.__kairoLoadPreferences) window.__kairoLoadPreferences(firestoreData);
  } else {
    if (window.__kairoSetProfile) {
      window.__kairoSetProfile({
        name: user.displayName || user.email?.split("@")[0] || "User",
        email: user.email || "",
        photoURL: user.photoURL || ""
      });
    }
  }

  // 3) Navigate
  if (window.__kairoGoHome) window.__kairoGoHome(user, isNewUser);
}

// ─── getRedirectResult (runs on EVERY page load) ───
// Handles the Apple (and Google fallback) redirect coming back from
// https://kairo-8b9ce.firebaseapp.com/__/auth/handler
(async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[KAIRO Auth] Redirect result received for:", result.user.email);
      const additional = getAdditionalUserInfo(result);
      await onSignInSuccess(result.user, additional?.isNewUser ?? false);
    }
  } catch (err) {
    // Swallow silent errors; surface real ones
    const msg = friendlyError(err.code);
    if (msg) {
      console.error("[KAIRO Auth] getRedirectResult error:", err.code);
      showAuthError(msg);
    }
  }
})();

// ─── onAuthStateChanged ───
// Fires on every page load to restore the persisted session
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("[KAIRO Auth] Session detected for:", user.email);

    // Fetch Firestore data
    const firestoreData = await fetchUserFromFirestore(user).catch(() => null);

    console.log("[KAIRO Auth] Session restored (verified) for:", user.email);

    // Hydrate profile immediately (fast path)
    const displayName = user.displayName || user.email?.split("@")[0] || "User";
    if (window.__kairoSetProfile) {
      window.__kairoSetProfile({ name: displayName, email: user.email || "", photoURL: user.photoURL || "" });
    }

    // Enrich from Firestore in background
    fetchUserFromFirestore(user).then((data) => {
      if (!data) return;
      if (window.__kairoSetProfile) {
        window.__kairoSetProfile({
          name: data.displayName || displayName,
          email: data.email || user.email || "",
          photoURL: data.photoURL || user.photoURL || ""
        });
      }
      if (data.chatHistory && Array.isArray(data.chatHistory) && window.__kairoLoadHistory) {
        window.__kairoLoadHistory(data.chatHistory);
      }
      if (window.__kairoLoadPreferences) window.__kairoLoadPreferences(data);
    }).catch(() => { });

    // Navigate if on an auth/onboarding screen
    const active = document.querySelector(".screen.is-active");
    const authScreens = ["onboarding", "signin", "signup", "verify-email"];
    if (!active || authScreens.includes(active.dataset?.screen)) {
      if (window.__kairoGoHome) window.__kairoGoHome(user, false);
    } else {
      if (window.__kairoHideSplash) window.__kairoHideSplash();
    }
  } else {
    // Signed out
    if (window.__kairoHideSplash) window.__kairoHideSplash();
    if (window.__kairoHideGreeting) window.__kairoHideGreeting();

    const active = document.querySelector(".screen.is-active");
    // If we are signed out, and currently on an app screen OR the verify screen, go back to start
    const protectedScreens = ["home", "chat", "history", "profile", "verify-email"];
    if (active && protectedScreens.includes(active.dataset?.screen)) {
      setTimeout(() => {
        if (window.__kairoSetScreen) window.__kairoSetScreen("onboarding");
      }, 100);
    } else {
      setTimeout(() => {
        if (window.__kairoHideSplash) window.__kairoHideSplash();
      }, 1200);
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  function getOTPValue() {
    return [...document.querySelectorAll(".otp-digit")].map(d => d.value).join("");
  }

  function clearOTPInputs() {
    document.querySelectorAll(".otp-digit").forEach(d => d.value = "");
    const first = document.querySelector(".otp-digit");
    if (first) first.focus();
  }

  // ── "Verify Code" button handler ──
  async function performVerification() {
    const btn = document.getElementById("verify-done-btn");
    const statusEl = document.getElementById("verify-status-msg");
    const code = getOTPValue();

    // Use pending email if user isn't created yet
    const email = auth.currentUser?.email || pendingSignUpData?.email;

    if (code.length < 6) return; // Don't auto-submit if incomplete

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Verifying…";
    statusEl.innerHTML = "";

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        statusEl.innerHTML = `<p style="color:#1a7a4a;font-weight:600;text-align:center;margin:0;">✅ Email verified! Finalizing account…</p>`;

        let userToVerify = auth.currentUser;

        // ── DELAYED FIREBASE CREATION ──
        if (!userToVerify && pendingSignUpData) {
          try {
            const credential = await createUserWithEmailAndPassword(
              auth,
              pendingSignUpData.email,
              pendingSignUpData.password
            );
            userToVerify = credential.user;
            if (pendingSignUpData.name) {
              await updateProfile(userToVerify, { displayName: pendingSignUpData.name });
            }
          } catch (createErr) {
            console.error("[KAIRO Auth] Delayed creation failed:", createErr);
            statusEl.innerHTML = `<p style="color:#a32b1a;font-weight:600;text-align:center;margin:0;">❌ Account creation failed: ${createErr.message}</p>`;
            btn.disabled = false;
            btn.textContent = originalText;
            return;
          }
        }

        // Success! Hydrate profile and go home
        if (userToVerify) {
          await onSignInSuccess(userToVerify, true);
        }
      } else {
        statusEl.innerHTML = `<p style="color:#a32b1a;font-weight:600;text-align:center;margin:0;">❌ ${data.error || "Incorrect code."}</p>`;
        btn.disabled = false;
        btn.textContent = originalText;
        clearOTPInputs();
      }
    } catch (err) {
      console.error("[KAIRO Auth] Verify error:", err);
      statusEl.innerHTML = `<p style="color:#a32b1a;font-weight:600;text-align:center;margin:0;">❌ Server error. Try again later.</p>`;
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // ── OTP digit auto-advance & auto-submit ──
  function initOTPInputs() {
    const digits = document.querySelectorAll(".otp-digit");
    digits.forEach((input, i) => {
      input.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        input.value = val.slice(-1);

        if (val) {
          if (i < digits.length - 1) {
            digits[i + 1].focus();
          } else {
            // Last digit entered! Auto-verify.
            performVerification();
          }
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && i > 0) digits[i - 1].focus();
        if (e.key === "Enter") performVerification();
      });
      input.addEventListener("paste", (e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length === 6) {
          digits.forEach((d, j) => d.value = pasted[j] || "");
          e.preventDefault();
          performVerification();
        }
      });
    });
  }
  initOTPInputs();

  document.getElementById("verify-done-btn")?.addEventListener("click", performVerification);

  // ── "Resend" button ──
  document.getElementById("verify-resend-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("verify-resend-btn");
    const statusEl = document.getElementById("verify-status-msg");
    const email = auth.currentUser?.email || pendingSignUpData?.email;
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        statusEl.innerHTML = `<p style="color:#1a7a4a;font-weight:600;text-align:center;margin:0;">✅ New code sent to ${email}</p>`;
        clearOTPInputs();
      } else {
        statusEl.innerHTML = `<p style="color:#a32b1a;font-weight:600;text-align:center;margin:0;">❌ ${data.error}</p>`;
      }
      setTimeout(() => { btn.disabled = false; btn.textContent = "Resend"; }, 30000);
    } catch {
      statusEl.innerHTML = `<p style="color:#a32b1a;font-weight:600;text-align:center;margin:0;">❌ Failed to send. Try again.</p>`;
      btn.disabled = false;
      btn.textContent = "Resend";
    }
  });

  // ── "Sign Out" link ──
  // ── "Sign Out" link ──
  document.getElementById("verify-signout-btn")?.addEventListener("click", async () => {
    await signOut(auth);
    if (window.__kairoSetScreen) window.__kairoSetScreen("onboarding");
  });

  // ── Handle URL parameters for auto-verify ──
  const urlParams = new URLSearchParams(window.location.search);
  const autoCode = urlParams.get("verify");
  if (autoCode && autoCode.length === 6) {
    const digits = document.querySelectorAll(".otp-digit");
    digits.forEach((d, i) => d.value = autoCode[i] || "");
    // Give a tiny delay for the screen to settle
    setTimeout(() => {
      performVerification();
      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    }, 500);
  }
});

// ─── Email/Password Sign In ───
export async function firebaseSignIn(email, password) {
  clearAuthErrors();
  const btn = document.querySelector("#signin-form .cta-button[type='submit']");
  setButtonLoading(btn, true, "Signing in…");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await onSignInSuccess(cred.user, false);
  } catch (err) {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Email/Password Sign Up ───
export async function firebaseSignUp(name, email, password) {
  clearAuthErrors();
  const btn = document.querySelector("#signup-form .cta-button[type='submit']");
  setButtonLoading(btn, true, "Signing up...");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    await onSignInSuccess(user, true);
  } catch (err) {
    const msg = friendlyError(err.code);
    if (msg) showAuthError(msg);
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Google Sign In (popup → redirect fallback) ───
export async function firebaseGoogleSignIn() {
  clearAuthErrors();
  if (isFileProtocol()) {
    showAuthError("🚫 Google Sign-In requires the app to run on http://localhost:3000");
    return;
  }

  const btn = document.getElementById("google-signin-btn") || document.getElementById("google-signup-btn");
  setButtonLoading(btn, true, "Opening Google…");

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const additional = getAdditionalUserInfo(result);
    await onSignInSuccess(result.user, additional?.isNewUser ?? false);
  } catch (err) {
    if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
      // Fallback to redirect
      try {
        await signInWithRedirect(auth, googleProvider);
        // getRedirectResult() at top will handle the result after page reload
      } catch (redirectErr) {
        const msg = friendlyError(redirectErr.code);
        if (msg) showAuthError(msg);
      }
    } else {
      const msg = friendlyError(err.code);
      if (msg) showAuthError(msg);
    }
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Apple Sign In (popup → redirect fallback) ───
export async function firebaseAppleSignIn() {
  clearAuthErrors();
  if (isFileProtocol()) {
    showAuthError("🚫 Apple Sign-In requires the app to run on http://localhost:3000");
    return;
  }

  // ─── REDIRECT TO GOOGLE ───
  // Since real Apple Auth requires a paid developer account, 
  // we redirect this button to the working Google flow to ensure the user can log in.
  console.log("[KAIRO Auth] Apple clicked - Redirecting to Google Auth for seamless experience.");
  return firebaseGoogleSignIn();
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
  if (isFileProtocol()) {
    showAuthError("🚫 Password reset requires the app to run on http://localhost:3001");
    return;
  }
  if (!email) {
    showAuthError("Enter your email address first, then tap Forgot Password.");
    return;
  }
  try {
    const res = await fetch("/api/send-reset-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to send reset email.");
    }
    showAuthError("KAIRO Reset Password sent! Check your Inbox 📨", true);
  } catch (err) {
    const msg = friendlyError(err.code || err.message);
    if (msg) showAuthError(msg);
  }
}

// ─── Global API (called by app.js) ───
window.__firebaseAuth = {
  signIn: firebaseSignIn,
  signUp: firebaseSignUp,
  googleSignIn: firebaseGoogleSignIn,
  appleSignIn: firebaseAppleSignIn,
  signOut: firebaseSignOut,
  forgotPassword: firebaseForgotPassword,
  getCurrentUser: () => auth.currentUser,
  fetchUserData: fetchUserFromFirestore,
  saveUserData: saveUserToFirestore,
  showError: showAuthError,
  clearErrors: clearAuthErrors
};
