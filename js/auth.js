// js/auth.js
// Sign up / log in gate, now talking to the real Supabase backend.
//
// The public shape of window.DD.auth is UNCHANGED from the localStorage
// version this replaced: getSession/isLoggedIn/signUp/logIn/logOut. That
// was the whole point of writing the old version the way it was written
// -- every other file that uses this (forum.js's getCurrentUser(),
// maps.js's admin check) needed zero changes to work against a real
// backend.
//
// One real change under the hood: getSession() has to stay SYNCHRONOUS
// (lots of code calls it expecting an instant answer, not a Promise), but
// checking a login with a real server is inherently a network call. The
// fix is the same one Supabase's own client uses: keep a small in-memory
// cache of "who's logged in right now" (cachedSession below), refresh it
// from the server on page load / login / signup / logout, and have
// getSession() just read that cache. It's accurate the entire time
// someone's using the app; it just takes one network round-trip to fill
// in when the page first loads (the auth gate stays up and covers the
// whole screen until that finishes, so there's no flash of the app
// underneath while that happens).
//
// The access codes themselves (VILLA2026 for drivers, VILLAOWNER2026 for
// the admin/owner account) no longer live in this file at all -- they're
// checked inside the dd_sign_up() function in the database, which is a
// real security improvement over the old framework version: this file's
// source (which anyone can view) never reveals what the codes are.
(function () {
  window.DD = window.DD || {};

  // From your Supabase project's Settings > API Keys ("Legacy anon,
  // service_role API keys" tab -- the anon key here, not service_role).
  // This key is meant to be public -- it's safe to ship in client-side
  // code like this, as long as (like here) the database's tables are
  // locked down with Row Level Security and only reachable through the
  // specific functions supabase_setup.sql created.
  const SUPABASE_URL = "https://nbxxmrngbhtekowcihnb.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ieHhtcm5nYmh0ZWtvd2NpaG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NzYxNDUsImV4cCI6MjEwMzA1MjE0NX0.UoEaLeYG1SiJdpXMhon7E04a1ofVp9M5MTrkCablW3A";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Shared with forum.js/maps.js so every file uses the same one client
  // instance instead of each creating its own.
  window.DD.supabaseClient = sb;

  const STORAGE_KEY = "driversDoughAuth";

  // Only the session token is kept on this device -- everything else
  // (accounts, password hashes) lives in the database now, not here.
  function readStoredToken() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.token ? parsed.token : null;
    } catch (err) {
      return null;
    }
  }
  function writeStoredToken(token) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));
    } catch (err) {}
  }
  function clearStoredToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {}
  }

  let cachedSession = null; // { id, username, name, isAdmin, trackStats } | null

  function getSession() {
    return cachedSession;
  }
  function isLoggedIn() {
    return !!cachedSession;
  }
  // Other first-party files (forum.js, maps.js) need the raw token to
  // prove who they are when calling their own write functions on the
  // server (dd_create_thread, dd_create_pin, etc. all take p_token).
  // This is the same token already sitting in localStorage -- just a
  // read, not a new thing being exposed.
  function getToken() {
    return readStoredToken();
  }

  function applySession(token, account) {
    cachedSession = {
      id: account.id,
      username: account.username,
      name: account.name,
      isAdmin: !!account.isAdmin,
      trackStats: account.trackStats !== false,
    };
    writeStoredToken(token);
  }

  // Called once when the app loads: if a token was saved from a previous
  // visit, ask the server whether it's still good and fill in
  // cachedSession from that -- this is what makes "stay logged in on
  // this device" work across reloads.
  async function restoreSession() {
    const token = readStoredToken();
    if (!token) return null;
    try {
      const { data, error } = await sb.rpc("dd_get_session", { p_token: token });
      if (error || !data) {
        clearStoredToken();
        return null;
      }
      cachedSession = {
        id: data.id,
        username: data.username,
        name: data.name,
        isAdmin: !!data.isAdmin,
        trackStats: data.trackStats !== false,
      };
      return cachedSession;
    } catch (err) {
      return null;
    }
  }

  async function signUp({ accessCode, username, password, confirmPassword, name }) {
    username = (username || "").trim();
    name = (name || "").trim();
    password = password || "";
    confirmPassword = confirmPassword || "";
    // Quick client-side checks first so obvious mistakes don't need a
    // round trip -- the database re-checks all of this too either way.
    if (!name) return { ok: false, error: "Enter your name." };
    if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (password !== confirmPassword) return { ok: false, error: "Passwords don't match." };

    try {
      const { data, error } = await sb.rpc("dd_sign_up", {
        p_access_code: (accessCode || "").trim(),
        p_username: username,
        p_password: password,
        p_name: name,
      });
      if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      if (!data.ok) return { ok: false, error: data.error };
      applySession(data.token, data.account);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  async function logIn({ username, password }) {
    username = (username || "").trim();
    password = password || "";
    if (!username || !password) return { ok: false, error: "Enter your username and password." };

    try {
      const { data, error } = await sb.rpc("dd_log_in", { p_username: username, p_password: password });
      if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      if (!data.ok) return { ok: false, error: data.error };
      applySession(data.token, data.account);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  // Clears the local session immediately (so the UI reacts right away),
  // then tells the server to forget this token in the background. Not
  // awaited by callers -- there's nothing left for them to wait on once
  // the local clear above has happened.
  function logOut() {
    const token = readStoredToken();
    cachedSession = null;
    clearStoredToken();
    if (token) {
      // sb.rpc() returns a "thenable" builder, not a real Promise, so it
      // doesn't have .catch() itself -- Promise.resolve() adopts it into
      // a real Promise first. Fire-and-forget: nothing to do if this
      // fails, the local session is already cleared either way.
      Promise.resolve(sb.rpc("dd_log_out", { p_token: token })).catch(() => {});
    }
  }

  // Both used by the new Account page (account.js). Neither touches
  // cachedSession's other fields -- changePassword doesn't need to (the
  // token stays valid), and setTrackStats only updates the one field once
  // the server confirms it saved.
  async function changePassword({ currentPassword, newPassword, confirmPassword }) {
    currentPassword = currentPassword || "";
    newPassword = newPassword || "";
    confirmPassword = confirmPassword || "";
    if (!currentPassword) return { ok: false, error: "Enter your current password." };
    if (newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters." };
    if (newPassword !== confirmPassword) return { ok: false, error: "New passwords don't match." };

    try {
      const { data, error } = await sb.rpc("dd_change_password", {
        p_token: getToken(),
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });
      if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      return data;
    } catch (err) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  async function setTrackStats(trackStats) {
    try {
      const { data, error } = await sb.rpc("dd_set_track_stats", { p_token: getToken(), p_track_stats: !!trackStats });
      if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
      if (data && data.ok && cachedSession) cachedSession.trackStats = !!trackStats;
      return data;
    } catch (err) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  window.DD.auth = { getSession, isLoggedIn, getToken, signUp, logIn, logOut, changePassword, setTrackStats };

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
    // Pull this driver's own deliveries/time card/stats down from the
    // server now that there's a session to load them for (see
    // script.js's refreshAll()). Fire-and-forget: script.js's own render
    // functions run once this resolves, nothing here needs to wait on it.
    window.DD.driverData?.refreshAll?.();
  }

  // On load: the gate is visible by default (see css/auth.css) so there's
  // no flash of the app underneath while this network check is in
  // flight. If a saved session checks out, skip straight past the gate.
  restoreSession().then((session) => {
    if (session) enterApp();
  });

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
