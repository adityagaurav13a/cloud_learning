// ============================================================
// auth.js — Cognito PKCE Auth (Security Hardened)
// ============================================================

const COGNITO_CONFIG = {
  region: "ap-south-1",
  userPoolDomain: "ap-south-1ogiug3ddn.auth.ap-south-1.amazoncognito.com",
  clientId: "4eprukneus6l3dhng3s1s1jffp",
  redirectUri: "https://d1f1xea7s22zua.cloudfront.net/admin-dashboard.html",
  logoutRedirectUri: "https://d1f1xea7s22zua.cloudfront.net/admin-login.html",
};

let _memoryTokens = null; // { idToken, accessToken, refreshToken, expiresAt }

const REFRESH_TOKEN_KEY = "js_admin_refresh_token";
const PKCE_VERIFIER_KEY = "js_admin_pkce_verifier";
const PKCE_STATE_KEY    = "js_admin_pkce_state";     // [FIX 2]

// ============================================================
// PKCE HELPERS (unchanged from original)
// ============================================================

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

// ============================================================
// TOKEN STORAGE — memory + sessionStorage for refresh token
// ============================================================

function storeTokens(tokens) {
  const now = Date.now();
  const ttlMs = (parseInt(tokens.expires_in || "3600", 10) - 60) * 1000;
  const expiresAt = now + ttlMs;

  _memoryTokens = {
    idToken:      tokens.id_token,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };

  if (tokens.refresh_token) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }

  return _memoryTokens;
}

function getMemoryTokens() {
  if (!_memoryTokens) return null;
  if (Date.now() > _memoryTokens.expiresAt) {
    _memoryTokens = null;
    return null;
  }
  return _memoryTokens;
}


async function silentRefresh() {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const { userPoolDomain, clientId } = COGNITO_CONFIG;
  const tokenUrl = `https://${userPoolDomain}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     clientId,
    refresh_token: refreshToken,
  });

  try {
    const res = await fetch(tokenUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });

    if (!res.ok) {
      console.warn("Silent refresh failed — session expired, redirecting to login");
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      return null;
    }

    const data = await res.json();
    if (!data.refresh_token) {
      data.refresh_token = refreshToken;
    }

    return storeTokens(data);
  } catch (err) {
    console.error("Silent refresh error:", err);
    return null;
  }
}

// ============================================================
// URL HELPERS (unchanged from original)
// ============================================================

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

// ============================================================
// LOGIN FLOW
// ============================================================

async function startCognitoLogin() {
  const { userPoolDomain, clientId, redirectUri } = COGNITO_CONFIG;

  const verifier   = generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         "code",
    scope:                 "openid email",
    redirect_uri:          redirectUri,
    code_challenge_method: "S256",
    code_challenge:        challenge,
    state,                
  });

  const authUrl = `https://${userPoolDomain}/oauth2/authorize?${params.toString()}`;
  window.location.href = authUrl;
}

async function exchangeCodeForTokens(code) {
  const { userPoolDomain, clientId, redirectUri } = COGNITO_CONFIG;

  const returnedState = getQueryParam("state");
  const storedState   = sessionStorage.getItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);

  if (!storedState || returnedState !== storedState) {
    console.error("State mismatch — possible CSRF attack. Aborting token exchange.");
    clearCodeFromUrl();
    window.location.href = "admin-login.html";
    return null;
  }

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    console.error("No PKCE verifier in sessionStorage");
    return null;
  }

  const tokenUrl = `https://${userPoolDomain}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     clientId,
    code,
    redirect_uri:  redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
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

// ============================================================
// PUBLIC FUNCTIONS — identical signatures to original
// ============================================================

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
    client_id:  clientId,
    logout_uri: logoutRedirectUri,
  });
  return `https://${userPoolDomain}/logout?${params.toString()}`;
}

async function logoutAdmin() {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
    || _memoryTokens?.refreshToken;

  if (refreshToken) {
    const { userPoolDomain, clientId } = COGNITO_CONFIG;
    const revokeUrl = `https://${userPoolDomain}/oauth2/revoke`;
    const body = new URLSearchParams({
      token:     refreshToken,
      client_id: clientId,
    });

    try {
      await fetch(revokeUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    body.toString(),
      });
    } catch (err) {
      console.warn("Token revocation request failed:", err);
    }
  }

  _memoryTokens = null;
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);

  window.location.href = buildLogoutUrl();
}

async function requireAdminAuth() {
  const err = getQueryParam("error");
  if (err) {
    const desc = getQueryParam("error_description") || "";
    console.error("Cognito login error:", err, desc);
    alert("Login failed: " + desc);
    clearCodeFromUrl();
    window.location.href = "admin-login.html";
    return;
  }

  const memory = getMemoryTokens();
  if (memory) {
    window.jsAdminTokens = memory;
    return;
  }

  const code = getQueryParam("code");
  if (code) {
    const newTokens = await exchangeCodeForTokens(code);
    if (newTokens) {
      window.jsAdminTokens = newTokens;
      return;
    }
  }

  const refreshed = await silentRefresh();
  if (refreshed) {
    window.jsAdminTokens = refreshed;
    return;
  }

  startCognitoLogin().catch((err) => {
    console.error("Login redirect failed:", err);
  });
}

window.redirectToCognitoLogin = redirectToCognitoLogin;
window.logoutAdmin            = logoutAdmin;
window.requireAdminAuth       = requireAdminAuth;
