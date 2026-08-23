// js/auth.js
// Sign up / log in gate + the "backend" behind it.
//
// FRAMEWORK NOTE: there's no real server yet, so signUp/logIn/logOut/
// getSession below are implemented against localStorage. They're written
// the way a real API client would be -- signUp/logIn are async and return
// { ok, error } -- specifically so that when a real backend exists, only
// the INSIDES of these functions change (localStorage reads/writes become
// fetch() calls to real endpoints); every caller (this file's own UI, and
// window.DD.forum's getCurrentUser()) already awaits them and branches on
// {ok, error} exactly like it would against a real API.
//
// Passwords are stored as a salted SHA-256 hash (Web Crypto), never
// plaintext -- but to be honest about what that does and doesn't buy:
// this still isn't real server-side auth. Anyone with access to this
// device's localStorage can see the hashes (though not the passwords
// themselves), and there's no rate limiting, no email verification, no
// password reset. Treat this as the placeholder it is until the real
// backend exists.
//
// ACCESS CODE: one shared code, required to sign up. Change it by editing
// ACCESS_CODE below (there's no admin screen for it yet -- that's part of
// "the rest of it" waiting on the real backend).
//
// ADMIN ACCESS CODE: a second, separate code that signs up an admin
// account instead of a regular driver account. Map creation (Setup Mode
// in Maps) is restricted to admin accounts -- everyone else can view
// pins once they exist, but only an admin can add/move/delete them. Keep
// this code to yourself; don't share it the way ACCESS_CODE gets shared
// with drivers.
(function () {
  window.DD = window.DD || {};

  const ACCESS_CODE = "VILLA2026";
  const ADMIN_ACCESS_CODE = "VILLAOWNER2026";

  const STORAGE_KEY = "driversDoughAuth";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return { accounts: [], sessionUserId: null };
      if (!Array.isArray(parsed.accounts)) parsed.accounts = [];
      return parsed;
    } catch (err) {
      return { accounts: [], sessionUserId: null };
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {}
  }
  let store = loadStore();

  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function randomSaltHex() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function hashPassword(password, saltHex) {
    const data = new TextEncoder().encode(saltHex + ":" + password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function findAccountByUsername(username) {
    const needle = username.trim().toLowerCase();
    return store.accounts.find((a) => a.username.toLowerCase() === needle) || null;
  }

  function getSession() {
    if (!store.sessionUserId) return null;
    const account = store.accounts.find((a) => a.id === store.sessionUserId);
    if (!account) return null;
    return { id: account.id, username: account.username, name: account.name, isAdmin: account.role === "admin" };
  }
  function isLoggedIn() {
    return !!getSession();
  }

  async function signUp({ accessCode, username, password, confirmPassword, name }) {
    username = (username || "").trim();
    name = (name || "").trim();
    password = password || "";
    confirmPassword = confirmPassword || "";
    const trimmedCode = (accessCode || "").trim();
    let role;
    if (trimmedCode === ADMIN_ACCESS_CODE) role = "admin";
    else if (trimmedCode === ACCESS_CODE) role = "driver";
    else return { ok: false, error: "That access code isn't valid." };
    if (!name) return { ok: false, error: "Enter your name." };
    if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (password !== confirmPassword) return { ok: false, error: "Passwords don't match." };
    if (findAccountByUsername(username)) return { ok: false, error: "That username is already taken." };

    const salt = randomSaltHex();
    const passwordHash = await hashPassword(password, salt);
    const account = { id: genId("acc"), username, name, role, salt, passwordHash, createdAt: Date.now() };
    store.accounts.push(account);
    store.sessionUserId = account.id;
    saveStore();
    return { ok: true };
  }

  async function logIn({ username, password }) {
    username = (username || "").trim();
    password = password || "";
    if (!username || !password) return { ok: false, error: "Enter your username and password." };
    const account = findAccountByUsername(username);
    if (!account) return { ok: false, error: "No account found with that username." };
    const hash = await hashPassword(password, account.salt);
    if (hash !== account.passwordHash) return { ok: false, error: "Incorrect password." };
    store.sessionUserId = account.id;
    saveStore();
    return { ok: true };
  }

  function logOut() {
    store.sessionUserId = null;
    saveStore();
  }

  window.DD.auth = { getSession, isLoggedIn, signUp, logIn, logOut };

  // --- UI --------------------------------------------------------------
  const gate = document.getElementById("dd-auth-gate");
  const tabs = document.querySelectorAll(".dd-auth-tab");
  const loginForm = document.getElementById("dd-auth-login-form");
  const signupForm = document.getElementById("dd-auth-signup-form");
  const msgEl = document.getElementById("dd-auth-msg");

  const menuLabel = document.getElementById("menuUserLabel");
  const menuLogout = document.getElementById("menuLogout");
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  const hamburgerBtn = document.getElementById("hamburgerBtn");

  function showMsg(text) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.classList.toggle("hide", !text);
  }

  function setTab(tab) {
    tabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
    loginForm?.classList.toggle("hide", tab !== "login");
    signupForm?.classList.toggle("hide", tab !== "signup");
    showMsg("");
  }
  tabs.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  function refreshMenuUserLabel() {
    const session = getSession();
    if (menuLabel) menuLabel.textContent = session ? "Signed in as " + session.name : "";
  }

  function enterApp() {
    gate?.classList.add("hide");
    refreshMenuUserLabel();
  }

  // On load: if there's already a session (stays logged in on this device
  // until Log Out), skip straight past the gate.
  if (isLoggedIn()) enterApp();

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");
    const username = document.getElementById("dd-auth-login-username")?.value || "";
    const password = document.getElementById("dd-auth-login-password")?.value || "";
    const result = await logIn({ username, password });
    if (!result.ok) {
      showMsg(result.error);
      return;
    }
    loginForm.reset();
    enterApp();
  });

  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");
    const accessCode = document.getElementById("dd-auth-signup-code")?.value || "";
    const name = document.getElementById("dd-auth-signup-name")?.value || "";
    const username = document.getElementById("dd-auth-signup-username")?.value || "";
    const password = document.getElementById("dd-auth-signup-password")?.value || "";
    const confirmPassword = document.getElementById("dd-auth-signup-confirm")?.value || "";
    const result = await signUp({ accessCode, name, username, password, confirmPassword });
    if (!result.ok) {
      showMsg(result.error);
      return;
    }
    signupForm.reset();
    enterApp();
  });

  menuLogout?.addEventListener("click", () => {
    hamburgerMenu?.classList.remove("is-open");
    hamburgerMenu?.setAttribute("aria-hidden", "true");
    hamburgerBtn?.setAttribute("aria-expanded", "false");
    logOut();
    setTab("login");
    gate?.classList.remove("hide");
  });
})();
