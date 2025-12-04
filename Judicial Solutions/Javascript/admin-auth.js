// // JS/admin-auth.js

// // ⚠ Demo-only credentials (for real app, move to backend)
// const ADMIN_EMAIL = "admin@judicialsolutions.in";
// const ADMIN_PASSWORD = "Admin@12345";
// const AUTH_KEY = "judicial_admin_logged_in";

// // Attach login handler only on login page
// document.addEventListener("DOMContentLoaded", () => {
//   const form = document.getElementById("admin-login-form");
//   if (form) {
//     setupLoginForm(form);
//   }
// });

// function setupLoginForm(form) {
//   const emailInput = document.getElementById("admin-email");
//   const passwordInput = document.getElementById("admin-password");
//   const errorBox = document.getElementById("login-error");

//   form.addEventListener("submit", (e) => {
//     e.preventDefault();

//     const email = (emailInput.value || "").trim();
//     const password = passwordInput.value || "";

//     // Simple hardcoded check
//     if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
//       // Mark user as logged in
//       localStorage.setItem(AUTH_KEY, "true");

//       // Redirect to dashboard
//       window.location.href = "admin-dashboard.html";
//     } else {
//       if (errorBox) {
//         errorBox.style.display = "block";
//         errorBox.textContent = "Invalid email or password.";
//       }
//     }
//   });
// }

// // Helper: check if admin is logged in
// function isAdminLoggedIn() {
//   return localStorage.getItem(AUTH_KEY) === "true";
// }

// // Helper: protect pages (call this from dashboard JS)
// function requireAdminAuth() {
//   if (!isAdminLoggedIn()) {
//     // Not logged in → send to login page
//     window.location.href = "admin-login.html";
//   }
// }

// // Helper: logout (call on "Logout" click)
// function adminLogout() {
//   localStorage.removeItem(AUTH_KEY);
//   window.location.href = "admin-login.html";
// }


// Javascript/admin-auth.js
// Cognito Auth – Authorization Code + PKCE (no client secret)

// ========= CONFIG – EDIT THESE =========
const COGNITO_CONFIG = {
  region: "ap-south-1",
  // ⚠️ NO "https://" here
  userPoolDomain: "ap-south-1ogiug3ddn.auth.ap-south-1.amazoncognito.com",
  clientId: "4eprukneus6l3dhng3s1s1jffp",
  // MUST match callback URLs in Cognito exactly
  redirectUri: "http://localhost:5500/admin-dashboard.html",
  logoutRedirectUri: "http://localhost:5500/admin-login.html",
};

// ========= PKCE HELPERS =========

function base64UrlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

// ========= TOKEN STORAGE =========

const TOKEN_KEY = "js_admin_tokens";
const PKCE_VERIFIER_KEY = "js_admin_pkce_verifier";

function storeTokens(tokens) {
  const now = Date.now();
  const ttlMs = (parseInt(tokens.expires_in || "3600", 10) - 60) * 1000;
  const expiresAt = now + ttlMs;

  const payload = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
  return payload;
}

function getStoredTokens() {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    if (!t.expiresAt || Date.now() > t.expiresAt) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

// ========= URL HELPERS =========

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function clearCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());
}

// ========= LOGIN / LOGOUT FLOWS =========

async function startCognitoLogin() {
  const { userPoolDomain, clientId, redirectUri } = COGNITO_CONFIG;

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  const authUrl = `https://${userPoolDomain}/oauth2/authorize?${params.toString()}`;
  window.location.href = authUrl;
}

async function exchangeCodeForTokens(code) {
  const { userPoolDomain, clientId, redirectUri } = COGNITO_CONFIG;
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    console.error("No PKCE verifier in sessionStorage");
    return null;
  }

  const tokenUrl = `https://${userPoolDomain}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error("Token exchange failed", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const stored = storeTokens(data);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  clearCodeFromUrl();
  return stored;
}

// Called from admin-login.html button
function redirectToCognitoLogin() {
  console.log("Cognito login button clicked");
  startCognitoLogin().catch((err) => {
    console.error("Error starting login:", err);
    alert("Could not start login. See console for details.");
  });
}

function buildLogoutUrl() {
  const { userPoolDomain, clientId, logoutRedirectUri } = COGNITO_CONFIG;
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutRedirectUri,
  });
  return `https://${userPoolDomain}/logout?${params.toString()}`;
}

function logoutAdmin() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  window.location.href = buildLogoutUrl();
}

// ========= MAIN GUARD USED BY DASHBOARD =========

async function requireAdminAuth() {
  // 0) If Cognito sent an error, stop the loop and go back to login
  const err = getQueryParam("error");
  if (err) {
    const desc = getQueryParam("error_description") || "";
    console.error("Cognito login error:", err, desc);
    alert("Login failed: " + desc);
    clearCodeFromUrl();
    window.location.href = "admin-login.html";
    return;
  }

  // 1) valid stored tokens → OK
  const stored = getStoredTokens();
  if (stored) {
    window.jsAdminTokens = stored;
    return;
  }

  // 2) coming back from Cognito with ?code=...
  const code = getQueryParam("code");
  if (code) {
    const newTokens = await exchangeCodeForTokens(code);
    if (newTokens) {
      window.jsAdminTokens = newTokens;
      return;
    }
    // if exchange failed, fall through to login
  }

  // 3) no tokens → send to login
  startCognitoLogin().catch((err) => {
    console.error("Login redirect failed:", err);
  });
}

  // Make functions available to inline HTML handlers
  window.redirectToCognitoLogin = redirectToCognitoLogin;
  window.logoutAdmin = logoutAdmin;
  window.requireAdminAuth = requireAdminAuth;