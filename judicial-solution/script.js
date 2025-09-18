document.getElementById("contactForm").addEventListener("submit", function(e) {
  e.preventDefault();

  let name = document.getElementById("name").value.trim();
  let email = document.getElementById("email").value.trim();
  let phone = document.getElementById("phone").value.trim();
  let countryCode = document.getElementById("countryCode").value;
  let message = document.getElementById("message").value.trim();
  let formMessage = document.getElementById("formMessage");

  // Email validation
  let emailPattern = /^[A-Za-z0-9._%+-]+@(gmail\.com|yahoo\.com|outlook\.com)$/;
  if (!emailPattern.test(email)) {
    formMessage.textContent = "❌ Email must be valid and from Gmail, Yahoo, or Outlook.";
    return;
  }

  // Phone validation: 10 digits
  if (!/^\d{10}$/.test(phone)) {
    formMessage.textContent = "❌ Phone number must be 10 digits.";
    return;
  }

  // Name validation
  if (name === "") {
    formMessage.textContent = "❌ Name is required.";
    return;
  }

  // Message validation
  if (message === "") {
    formMessage.textContent = "❌ Message cannot be empty.";
    return;
  }

  formMessage.style.color = "green";
  formMessage.textContent = "✅ Form submitted successfully!";

  // Reset form
  document.getElementById("contactForm").reset();
});