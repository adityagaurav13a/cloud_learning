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

  const header = document.getElementById("jtHeader"); // judiciary only
  const navbar = document.getElementById("navbar");
  const hamburger = document.getElementById("hamburger");

  /* ===============================
     JUDICIARY HEADER SCROLL (SAFE)
     =============================== */
  if (header) {
    let lastScroll = 0;

    window.addEventListener("scroll", () => {
      const currentScroll = window.pageYOffset;

      if (currentScroll > lastScroll) {
        header.classList.add("header-hidden");
      } else {
        header.classList.remove("header-hidden");

        if (currentScroll > 60) {
          header.classList.add("header-small");
        } else {
          header.classList.remove("header-small");
        }
      }

      lastScroll = currentScroll <= 0 ? 0 : currentScroll;
    });
  }

  /* ===============================
     MOBILE MENU UX (GLOBAL)
     =============================== */
  if (navbar && hamburger) {

    // Toggle menu
    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      navbar.classList.toggle("show");
    });

    // Hide menu on ANY scroll
    window.addEventListener("scroll", () => {
      if (navbar.classList.contains("show")) {
        navbar.classList.remove("show");
      }
    });

    // Hide menu on outside click
    document.addEventListener("click", (e) => {
      if (
        navbar.classList.contains("show") &&
        !navbar.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        navbar.classList.remove("show");
      }
    });

    // Hide menu when a link is clicked
    navbar.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navbar.classList.remove("show");
      });
    });
  }

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