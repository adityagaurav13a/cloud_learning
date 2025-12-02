/* =========================================================
   ./Javascript/script.js
   Purpose: Handles all page-specific form validations
   Author: [Aditya Gaurav]
   Date: 12-Oct-2025
   ========================================================= */

/* ------------------ Helper Functions ------------------ */

// Show error/success message
// function showMessage(target, msg, color = "red") {
//   target.style.color = color;
//   target.textContent = msg;
// }

// // Highlight invalid fields with CSS animation
// function highlightInvalid(fields) {
//   fields.forEach(field => {
//     field.classList.add("invalid", "shake");
//     setTimeout(() => field.classList.remove("shake"), 500);
//   });
// }

// // Common patterns
// const namePattern = /^[A-Za-z\s]+$/;
// const emailPattern = /^[A-Za-z0-9._%+-]+@(gmail\.com|yahoo\.com|outlook\.com)$/;
// const phonePattern = /^\d{10}$/;

// /* =========================================================
//    Function to attach form validation to any form
//    ========================================================= */
// function handleFormValidation(formId) {
//   const form = document.getElementById(formId);
//   if (!form) return;

//   let formMessage = form.querySelector("#formMessage");
//   if (!formMessage) {
//     formMessage = document.createElement("p");
//     formMessage.id = "formMessage";
//     formMessage.classList.add("form-message");
//     form.appendChild(formMessage);
//   }

//   form.addEventListener("submit", function (e) {
//     e.preventDefault();

//     const name = form.querySelector("#name");
//     const email = form.querySelector("#email");
//     const phone = form.querySelector("#phone");
//     const message = form.querySelector("#message");

//     const nameVal = name.value.trim();
//     const emailVal = email.value.trim();
//     const phoneVal = phone.value.trim();
//     const messageVal = message.value.trim();

//     // Reset previous styles
//     [name, email, phone, message].forEach(field => field.classList.remove("invalid"));

//     if (!nameVal || !emailVal || !phoneVal || !messageVal) {
//       showMessage(formMessage, "⚠️ All fields are required.");
//       highlightInvalid([name, email, phone, message]);
//       return;
//     }

//     if (!namePattern.test(nameVal)) {
//       showMessage(formMessage, "⚠️ Name must contain only letters and spaces.");
//       highlightInvalid([name]);
//       return;
//     }

//     if (!emailPattern.test(emailVal)) {
//       showMessage(formMessage, "⚠️ Use a valid Gmail, Yahoo, or Outlook email.");
//       highlightInvalid([email]);
//       return;
//     }

//     if (!phonePattern.test(phoneVal)) {
//       showMessage(formMessage, "⚠️ Phone number must be exactly 10 digits.");
//       highlightInvalid([phone]);
//       return;
//     }

//     if (messageVal.length < 5) {
//       showMessage(formMessage, "⚠️ Message must be at least 5 characters.");
//       highlightInvalid([message]);
//       return;
//     }

//     showMessage(formMessage, "✅ Form submitted successfully!", "green");
//     form.reset();
//   });
// }

// /* =========================================================
//    Attach validation to all forms
//    ========================================================= */
// const formsToValidate = [
//   "contactForm",
//   "familyContactForm",
//   "corporateContactForm",
//   "civilContactForm",
//   "criminalContactForm",
//   "legalContactForm"
// ];

// formsToValidate.forEach(formId => handleFormValidation(formId));


/* =========================================================
   Admin Page: Tic Tac Toe Game Logic
   ========================================================= */

// document.addEventListener("DOMContentLoaded", () => {
//   const board = document.getElementById("ticTacToeBoard");
//   if (!board) return;

//   const cells = document.querySelectorAll(".cell");
//   const status = document.getElementById("gameStatus");
//   const resetBtn = document.getElementById("resetGame");
//   let current = "X";
//   let gameActive = true;
//   let gameState = ["", "", "", "", "", "", "", "", ""];

//   const winning = [
//     [0,1,2],[3,4,5],[6,7,8],
//     [0,3,6],[1,4,7],[2,5,8],
//     [0,4,8],[2,4,6]
//   ];

//   function checkWin() {
//     for (const [a,b,c] of winning) {
//       if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
//         status.textContent = `${current} Wins!`;
//         gameActive = false;

//         // Highlight winning cells
//         [a, b, c].forEach(index => cells[index].classList.add("win-highlight"));

//         return true;
//       }
//     }
//     if (!gameState.includes("")) {
//       status.textContent = "It's a Draw!";
//       gameActive = false;
//     }
//     return false;
//   }

//   cells.forEach(cell => {
//     cell.addEventListener("click", () => {
//       const i = cell.dataset.index;
//       if (gameState[i] || !gameActive) return;
//       gameState[i] = current;
//       cell.textContent = current;
//       if (!checkWin()) current = current === "X" ? "O" : "X";
//     });
//   });

//   // ✅ Updated Reset Button Handler
//   resetBtn.addEventListener("click", () => {
//     gameState.fill("");
//     cells.forEach(c => {
//       c.textContent = "";
//       c.classList.remove("win-highlight"); // remove highlight
//     });
//     current = "X";
//     gameActive = true;
//     status.textContent = "";
//   });
// });


// document.addEventListener("DOMContentLoaded", () => {
//   const board = document.getElementById("ticTacToeBoard");
//   if (!board) return;

//   const cells = document.querySelectorAll(".cell");
//   const status = document.getElementById("gameStatus");
//   const resetBtn = document.getElementById("resetGame");
//   let current = "X";
//   let gameActive = true;
//   let gameState = ["", "", "", "", "", "", "", "", ""];

//   const winning = [
//     [0,1,2],[3,4,5],[6,7,8],
//     [0,3,6],[1,4,7],[2,5,8],
//     [0,4,8],[2,4,6]
//   ];

//   // -------------------- Game Mode --------------------
//   let gameMode = "single"; // default
//   document.querySelectorAll("input[name='mode']").forEach(radio => {
//     radio.addEventListener("change", () => {
//       gameMode = radio.value;
//       resetGame();
//     });
//   });

//   // -------------------- Check Win --------------------
//   function checkWin() {
//     for (const [a,b,c] of winning) {
//       if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
//         status.textContent = `${current} Wins!`;
//         gameActive = false;

//         // Highlight winning cells
//         [a, b, c].forEach(index => cells[index].classList.add("win-highlight"));
//         return true;
//       }
//     }
//     if (!gameState.includes("")) {
//       status.textContent = "It's a Draw!";
//       gameActive = false;
//     }
//     return false;
//   }

//   // -------------------- Bot Move --------------------
//   function botMove() {
//     const emptyCells = [];
//     gameState.forEach((val, idx) => {
//       if (!val) emptyCells.push(idx);
//     });
//     if (emptyCells.length === 0) return;
//     const move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
//     gameState[move] = "O";
//     cells[move].textContent = "O";
//     checkWin();
//   }

//   // -------------------- Cell Click --------------------
//   cells.forEach(cell => {
//     cell.addEventListener("click", () => {
//       const i = cell.dataset.index;
//       if (gameState[i] || !gameActive) return;

//       gameState[i] = current;
//       cell.textContent = current;

//       if (!checkWin()) {
//         if (gameMode === "single" && current === "X") {
//           // Bot turn
//           current = "O";
//           setTimeout(botMove, 500); // small delay for realism
//           current = "X";
//         } else {
//           current = current === "X" ? "O" : "X";
//         }
//       }
//     });
//   });

//   // -------------------- Reset Game --------------------
//   function resetGame() {
//     gameState.fill("");
//     cells.forEach(c => {
//       c.textContent = "";
//       c.classList.remove("win-highlight");
//     });
//     current = "X";
//     gameActive = true;
//     status.textContent = "";
//   }

//   resetBtn.addEventListener("click", resetGame);
// });


document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("ticTacToeBoard");
  if (!board) return;

  const cells = document.querySelectorAll(".cell");
  const status = document.getElementById("gameStatus");
  const resetBtn = document.getElementById("resetGame");
  let current = "X";
  let gameActive = true;
  let gameState = ["", "", "", "", "", "", "", "", ""];

  const winning = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  // -------------------- Game Mode --------------------
  let gameMode = "single"; // default
  document.querySelectorAll("input[name='mode']").forEach(radio => {
    radio.addEventListener("change", () => {
      gameMode = radio.value;
      resetGame();
    });
  });

  // -------------------- Check Win --------------------
  function checkWin(boardState = gameState) {
    for (const [a,b,c] of winning) {
      if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
        return boardState[a]; // return winner
      }
    }
    if (!boardState.includes("")) return "draw";
    return null;
  }

  function updateWinStatus() {
    const winner = checkWin();
    if (winner) {
      gameActive = false;
      if (winner === "draw") {
        status.textContent = "It's a Draw!";
      } else {
        status.textContent = `${winner} Wins!`;
        // Highlight winning cells
        for (const [a,b,c] of winning) {
          if (gameState[a] === winner && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
            [a,b,c].forEach(index => cells[index].classList.add("win-highlight"));
            break;
          }
        }
      }
    }
    return winner;
  }

  // -------------------- Minimax Bot --------------------
  function minimax(boardState, depth, isMaximizing) {
    const result = checkWin(boardState);
    if (result === "O") return 10 - depth;
    if (result === "X") return depth - 10;
    if (result === "draw") return 0;

    if (isMaximizing) {
      let bestScore = -Infinity;
      boardState.forEach((cell, i) => {
        if (!cell) {
          boardState[i] = "O";
          const score = minimax(boardState, depth + 1, false);
          boardState[i] = "";
          bestScore = Math.max(score, bestScore);
        }
      });
      return bestScore;
    } else {
      let bestScore = Infinity;
      boardState.forEach((cell, i) => {
        if (!cell) {
          boardState[i] = "X";
          const score = minimax(boardState, depth + 1, true);
          boardState[i] = "";
          bestScore = Math.min(score, bestScore);
        }
      });
      return bestScore;
    }
  }

  function botMove() {
    let bestScore = -Infinity;
    let move;
    gameState.forEach((cell, i) => {
      if (!cell) {
        gameState[i] = "O";
        const score = minimax(gameState, 0, false);
        gameState[i] = "";
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    });
    if (move !== undefined) {
      gameState[move] = "O";
      cells[move].textContent = "O";
      updateWinStatus();
    }
  }

  // -------------------- Cell Click --------------------
//   cells.forEach(cell => {
//   cell.addEventListener("click", () => {
//     const i = cell.dataset.index;
//     if (gameState[i] || !gameActive) return;

//     // Player move is always X
//     gameState[i] = "X";
//     cell.textContent = "X";

//     const winner = updateWinStatus();
//     if (!winner && gameMode === "single") {
//       // Bot move
//       setTimeout(() => {
//         botMove();
//         updateWinStatus();
//       }, 300);
//     }
//   });
// });
cells.forEach(cell => {
  cell.addEventListener("click", () => {
    const i = cell.dataset.index;
    if (gameState[i] || !gameActive) return;

    if (gameMode === "single") {
      // Single-player: Player is always X
      gameState[i] = "X";
      cell.textContent = "X";

      const winner = updateWinStatus();
      if (!winner) {
        setTimeout(() => {
          botMove();
          updateWinStatus();
        }, 300);
      }

    } else {
      // Two-player mode: alternate X and O
      gameState[i] = current;
      cell.textContent = current;

      updateWinStatus();

      // Switch turn
      current = current === "X" ? "O" : "X";
    }
  });
});


  // -------------------- Reset Game --------------------
  function resetGame() {
    gameState.fill("");
    cells.forEach(c => {
      c.textContent = "";
      c.classList.remove("win-highlight");
    });
    current = "X";
    gameActive = true;
    status.textContent = "";
  }

  resetBtn.addEventListener("click", resetGame);
});



// ================================
// SCOPED HEADER SCROLL BEHAVIOR
// ================================

document.addEventListener("DOMContentLoaded", () => {

    const header = document.getElementById("jtHeader");
    const navbar = document.getElementById("navbar");
    const hamburger = document.getElementById("hamburger");

    let lastScroll = 0;

    window.addEventListener("scroll", () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > lastScroll) {
            // Scrolling DOWN → hide
            header.classList.add("header-hidden");
        } else {
            // Scrolling UP → show
            header.classList.remove("header-hidden");

            if (currentScroll > 60) {
                header.classList.add("header-small");
            } else {
                header.classList.remove("header-small");
            }
        }

        lastScroll = currentScroll <= 0 ? 0 : currentScroll;
    });

    // MOBILE MENU TOGGLE
    hamburger.addEventListener("click", () => {
        navbar.classList.toggle("show");
    });
});


const API_BASE = "https://86isfklr9k.execute-api.ap-south-1.amazonaws.com";

const FORM_IDS = [
  "contactForm",
  "civilContactForm",
  "corporateContactForm",
  "criminalContactForm",
  "familyContactForm",
  "legalContactForm"
];

function attachFormHandler(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      form_id: form.elements["form_id"]?.value || formId,
      name: form.elements["name"]?.value || "",
      email: form.elements["email"]?.value || "",
      phone: form.elements["phone"]?.value || "",
      message: form.elements["message"]?.value || "",
      country_code: form.elements["country-code"]?.value || ""
    };

    const res = await fetch(`${API_BASE}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert("Form submitted successfully!");
      form.reset();
    } else {
      alert("Error submitting form.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  FORM_IDS.forEach(attachFormHandler);
});
