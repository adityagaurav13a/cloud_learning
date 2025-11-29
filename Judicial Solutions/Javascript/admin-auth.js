// JS/admin-auth.js

// ⚠ Demo-only credentials (for real app, move to backend)
const ADMIN_EMAIL = "admin@judicialsolutions.in";
const ADMIN_PASSWORD = "Admin@12345";
const AUTH_KEY = "judicial_admin_logged_in";

// Attach login handler only on login page
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("admin-login-form");
  if (form) {
    setupLoginForm(form);
  }
});

function setupLoginForm(form) {
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const errorBox = document.getElementById("login-error");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = (emailInput.value || "").trim();
    const password = passwordInput.value || "";

    // Simple hardcoded check
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      // Mark user as logged in
      localStorage.setItem(AUTH_KEY, "true");

      // Redirect to dashboard
      window.location.href = "admin-dashboard.html";
    } else {
      if (errorBox) {
        errorBox.style.display = "block";
        errorBox.textContent = "Invalid email or password.";
      }
    }
  });
}

// Helper: check if admin is logged in
function isAdminLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

// Helper: protect pages (call this from dashboard JS)
function requireAdminAuth() {
  if (!isAdminLoggedIn()) {
    // Not logged in → send to login page
    window.location.href = "admin-login.html";
  }
}

// Helper: logout (call on "Logout" click)
function adminLogout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "admin-login.html";
}
