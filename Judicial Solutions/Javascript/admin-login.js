// =======================================
// Login Form Handler + Tic Tac Toe Game
// =======================================

document.addEventListener("DOMContentLoaded", () => {
  // Login Form
  const loginForm = document.getElementById("loginForm");
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (email && password) {
      alert(`Welcome back, ${email}!`);
      loginForm.reset();
    } else {
      alert("Please fill out all fields!");
    }
  });

  // Tic Tac Toe
  const cells = document.querySelectorAll(".cell");
  const statusText = document.getElementById("statusText");
  const restartBtn = document.getElementById("restartBtn");

  const winPatterns = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  let options = ["", "", "", "", "", "", "", "", ""];
  let currentPlayer = "X";
  let running = true;

  cells.forEach(cell => cell.addEventListener("click", cellClicked));
  restartBtn.addEventListener("click", restartGame);

  function cellClicked() {
    const index = this.dataset.index;
    if (options[index] !== "" || !running) return;

    options[index] = currentPlayer;
    this.textContent = currentPlayer;

    checkWinner();
  }

  function checkWinner() {
    let winnerFound = false;
    for (const pattern of winPatterns) {
      const [a,b,c] = pattern;
      if (options[a] && options[a] === options[b] && options[a] === options[c]) {
        winnerFound = true;
        break;
      }
    }

    if (winnerFound) {
      statusText.textContent = `🎉 Player ${currentPlayer} wins!`;
      running = false;
    } else if (!options.includes("")) {
      statusText.textContent = "It's a Draw!";
      running = false;
    } else {
      currentPlayer = currentPlayer === "X" ? "O" : "X";
      statusText.textContent = `Player ${currentPlayer}'s turn`;
    }
  }

  function restartGame() {
    options = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X";
    running = true;
    statusText.textContent = `Player X's turn`;
    cells.forEach(cell => cell.textContent = "");
  }
});
