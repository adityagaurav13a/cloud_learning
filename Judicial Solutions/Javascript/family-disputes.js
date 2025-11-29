// ===============================
// 👨‍👩‍👧 Family Disputes Form Validation (Standalone)
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("familyContactForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = form.querySelector("#name");
    const phone = form.querySelector("#phone");
    const email = form.querySelector("#email");
    const message = form.querySelector("#message");
    const formMessage = form.querySelector("#formMessage");

    // Trimmed values
    const nameVal = name.value.trim();
    const phoneVal = phone.value.trim();
    const emailVal = email.value.trim();
    const messageVal = message.value.trim();

    // Regex patterns
    const namePattern = /^[A-Za-z\s]+$/;
    const phonePattern = /^\d{10}$/;
    const emailPattern = /^[A-Za-z0-9._%+-]+@(gmail\.com|yahoo\.com|outlook\.com)$/;

    // Reset styles
    [name, phone, email, message].forEach(i => i.classList.remove("invalid"));

    // Validation checks
    if (!nameVal || !phoneVal || !emailVal || !messageVal) {
      showError(formMessage, "⚠️ All fields are required.");
      highlightInvalid([name, phone, email, message]);
      return;
    }

    if (!namePattern.test(nameVal)) {
      showError(formMessage, "⚠️ Name must contain only letters and spaces.");
      highlightInvalid([name]);
      return;
    }

    if (!phonePattern.test(phoneVal)) {
      showError(formMessage, "⚠️ Phone number must be exactly 10 digits.");
      highlightInvalid([phone]);
      return;
    }

    if (!emailPattern.test(emailVal)) {
      showError(formMessage, "⚠️ Use a valid Gmail, Yahoo, or Outlook email.");
      highlightInvalid([email]);
      return;
    }

    if (messageVal.length < 5) {
      showError(formMessage, "⚠️ Message must be at least 5 characters.");
      highlightInvalid([message]);
      return;
    }

    // ✅ Success
    formMessage.style.color = "green";
    formMessage.textContent = "✅ Message sent successfully!";
    form.reset();
  });

  // Helper: Show error message
  function showError(target, msg) {
    target.style.color = "red";
    target.textContent = msg;
  }

  // Helper: Highlight invalid fields
  function highlightInvalid(fields) {
    fields.forEach(field => {
      field.classList.add("invalid", "shake");
      setTimeout(() => field.classList.remove("shake"), 500);
    });
  }
});

 /* ------------------ Corporate Law Form ------------------ */
const corporateForm = document.getElementById("corporateContactForm");
if (corporateForm) {
    corporateForm.addEventListener("submit", function(e) {
        e.preventDefault();

        const name = corporateForm.querySelector("#name");
        const phone = corporateForm.querySelector("#phone");
        const email = corporateForm.querySelector("#email");
        const message = corporateForm.querySelector("#message");
        const formMessage = corporateForm.querySelector("#formMessage");

        const nameVal = name.value.trim();
        const phoneVal = phone.value.trim();
        const emailVal = email.value.trim();
        const messageVal = message.value.trim();

        // Regex patterns
        const namePattern = /^[A-Za-z\s]+$/;
        const phonePattern = /^\d{10}$/;
        const emailPattern = /^[A-Za-z0-9._%+-]+@(gmail\.com|yahoo\.com|outlook\.com)$/;

        // Reset styles
        [name, phone, email, message].forEach(field => field.classList.remove("invalid"));

        // Validation
        if (!nameVal || !phoneVal || !emailVal || !messageVal) {
            showError(formMessage, "⚠️ All fields are required.");
            highlightInvalid([name, phone, email, message]);
            return;
        }

        if (!namePattern.test(nameVal)) {
            showError(formMessage, "⚠️ Name must contain only letters and spaces.");
            highlightInvalid([name]);
            return;
        }

        if (!phonePattern.test(phoneVal)) {
            showError(formMessage, "⚠️ Phone number must be exactly 10 digits.");
            highlightInvalid([phone]);
            return;
        }

        if (!emailPattern.test(emailVal)) {
            showError(formMessage, "⚠️ Use a valid Gmail, Yahoo, or Outlook email.");
            highlightInvalid([email]);
            return;
        }

        if (messageVal.length < 5) {
            showError(formMessage, "⚠️ Message must be at least 5 characters.");
            highlightInvalid([message]);
            return;
        }

        // ✅ Success
        formMessage.style.color = "green";
        formMessage.textContent = "✅ Message sent successfully!";
        corporateForm.reset();
    });
}

/* ------------------ Helper Functions ------------------ */
function showError(target, msg) {
    target.style.color = "red";
    target.textContent = msg;
}

function highlightInvalid(fields) {
    fields.forEach(field => {
        field.classList.add("invalid", "shake");
        setTimeout(() => field.classList.remove("shake"), 500);
    });
}
