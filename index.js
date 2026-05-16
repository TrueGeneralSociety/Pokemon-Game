/*  ============================================================
    Pokémon Memory Game – index.js
    COMP 2537 Web Development 2 – Assignment 3
    ============================================================ */

// Difficulty settings: pairs and time limits
const DIFFICULTIES = {
  easy: { pairs: 3, time: 60 },
  medium: { pairs: 6, time: 90 },
  hard: { pairs: 10, time: 120 },
};

// Game state variables
let difficulty = "easy";
let gameStarted = false;
let gameOver = false;

let firstCard = null;
let secondCard = null;
let lockBoard = false;

let clicks = 0;
let matchedPairs = 0;
let totalPairs = 0;
let timeLeft = 0;
let timerInterval = null;
let powerupsLeft = 3;

// jQuery selectors
const $grid = $("#game_grid");
const $timerDisplay = $("#timer-display");
const $clicksDisplay = $("#clicks-display");
const $matchedDisplay = $("#matched-display");
const $leftDisplay = $("#left-display");
const $totalDisplay = $("#total-display");
const $powerupDisplay = $("#powerup-display");
const $loadingOverlay = $("#loading-overlay");
const $messageOverlay = $("#message-overlay");

// PokéAPI base URL
const POKE_API_BASE = "https://pokeapi.co/api/v2/pokemon";

/**
 * Fetches the complete list of Pokémon from the PokéAPI.
 * @returns {Promise<Array<{name: string, url: string}>>}
 * An array of Pokémon with their names and detail URLs.
 */
async function fetchAllPokemonList() {
  const res = await fetch(`${POKE_API_BASE}?limit=1025`);
  const data = await res.json();
  return data.results; // [{name, url}, ...]
}

/**
 * Fetches the detail information for a specific Pokémon.
 * @param {string} url - The URL of the Pokémon's detail endpoint.
 * @returns {Promise<{name: string, image: string}>}
 * A promise resolving to the Pokémon's name and image URL.
 */
async function fetchPokemonDetail(url) {
  const res = await fetch(url);
  const data = await res.json();
  const image =
    data.sprites?.other?.["official-artwork"]?.front_default ||
    data.sprites?.front_default ||
    null;
  return { name: data.name, image };
}

/**
 * Shuffles an array randomly.
 * @param {Array} array - The array to shuffle.
 * @returns {Array} The shuffled array.
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Loads the game cards for the specified number of pairs.
 * @param {number} numPairs - The number of pairs to load.
 * @returns {Promise<Array<{name: string, image: string}>>}
 * A promise resolving to the array of Pokémon data for the game cards.
 */
async function loadGameCards(numPairs) {
  showLoading(true);

  const allPokemon = await fetchAllPokemonList();
  const shuffledList = shuffle(allPokemon);
  const selected = shuffledList.slice(0, numPairs);

  const pokemonData = await Promise.all(
    selected.map((p) => fetchPokemonDetail(p.url)),
  );

  // Filter out any without images
  const valid = pokemonData.filter((p) => p.image);

  // Duplicate each for pairs, then shuffle
  const cards = shuffle([...valid, ...valid]);

  showLoading(false);
  return cards;
}

/**
 * Builds a game card element for a Pokémon.
 * @param {Object} pokemon - The Pokémon data.
 * @param {number} index - The index of the card.
 * @returns {jQuery} The jQuery object representing the card.
 */
function buildCard(pokemon, index) {
  const $card = $(`
    <div class="card" data-index="${index}" data-name="${pokemon.name}">
      <div class="front_face">
        <img src="${pokemon.image}" alt="${pokemon.name}">
        <span class="pokemon-name">${pokemon.name}</span>
      </div>
      <div class="back_face">
        <img src="back.webp" alt="card back">
      </div>
    </div>
  `);

  $card.on("click", function () {
    handleCardClick($(this));
  });

  return $card;
}

/**
 * Renders the game cards on the grid.
 * @param {Array<{name: string, image: string}>} cards -
 * The array of Pokémon data for the game cards.
 */
function renderCards(cards) {
  $grid.empty();
  cards.forEach((pokemon, i) => {
    $grid.append(buildCard(pokemon, i));
  });
}

/**
 * Handles the click event for a game card.
 * @param {jQuery} $card - The jQuery object representing the clicked card.
 * @returns {void}
 */
function handleCardClick($card) {
  if (!gameStarted || gameOver) return;
  if (lockBoard) return; // two cards already flipping
  if ($card.hasClass("flip")) return; // same card clicked again
  if ($card.hasClass("matched")) return; // already matched

  // Count click
  clicks++;
  updateStatus();

  $card.addClass("flip");

  if (!firstCard) {
    firstCard = $card;
    return;
  }

  secondCard = $card;
  lockBoard = true; // prevent more flips while checking

  checkForMatch();
}

/**
 * Checks if the two flipped cards match and handles the result.
 * @returns {void}
 */
function checkForMatch() {
  const isMatch = firstCard.data("name") === secondCard.data("name");

  if (isMatch) {
    disableMatchedCards();
  } else {
    unflipCards();
  }
}

/**
 * Disables the matched cards and updates the game state accordingly.
 * @returns {void}
 */
function disableMatchedCards() {
  firstCard.addClass("matched");
  secondCard.addClass("matched");

  matchedPairs++;
  updateStatus();
  resetTurn();

  if (matchedPairs === totalPairs) {
    setTimeout(() => endGame(true), 500);
  }
}

/**
 * Unflips the cards if they don't match.
 * @returns {void}
 */
function unflipCards() {
  const $f = firstCard;
  const $s = secondCard;
  setTimeout(() => {
    $f.removeClass("flip");
    $s.removeClass("flip");
    resetTurn();
  }, 1000);
}

/**
 * Resets the turn state.
 * @returns {void}
 */
function resetTurn() {
  firstCard = null;
  secondCard = null;
  lockBoard = false;
}

/**
 * Starts the game timer and updates the display every second.
 * Ends the game if time runs out.
 * @returns {void}
 */
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateStatus();

    if (timeLeft <= 10) {
      $timerDisplay.addClass("warning");
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      endGame(false);
    }
  }, 1000);
}

/**
 * Stops the game timer.
 * @returns {void}
 */
function stopTimer() {
  clearInterval(timerInterval);
}

/**
 * Updates the game status display.
 * @returns {void}
 */
function updateStatus() {
  $timerDisplay.text(timeLeft > 0 ? timeLeft + "s" : "0s");
  $clicksDisplay.text(clicks);
  $matchedDisplay.text(matchedPairs);
  $leftDisplay.text(totalPairs - matchedPairs);
  $totalDisplay.text(totalPairs);
  $powerupDisplay.text(powerupsLeft);
}

/**
 * Stops the game timer.
 * @returns {void}
 */
function stopTimer() {
  clearInterval(timerInterval);
}

/**
 * Starts a new game by resetting the state, loading new cards, and starting the timer.
 * @returns {Promise<void>}
 */
async function startGame() {
  stopTimer();
  resetState();

  const { pairs, time } = DIFFICULTIES[difficulty];
  totalPairs = pairs;
  timeLeft = time;

  updateStatus();

  const cards = await loadGameCards(pairs);
  renderCards(cards);

  gameStarted = true;
  $timerDisplay.removeClass("warning");
  startTimer();
}

/**
 * Resets the game state and UI to the initial conditions for a new game.
 * @returns {void}
 */
function resetGame() {
  stopTimer();
  resetState();

  const { pairs, time } = DIFFICULTIES[difficulty];
  totalPairs = pairs;
  timeLeft = time;

  updateStatus();
  $grid.empty();
  $timerDisplay.removeClass("warning");
  $timerDisplay.text("--");
  gameStarted = false;
}

/**
 * Resets the game state variables and UI elements to their initial conditions.
 * @returns {void}
 */
function resetState() {
  gameStarted = false;
  gameOver = false;
  clicks = 0;
  matchedPairs = 0;
  totalPairs = 0;
  timeLeft = 0;
  powerupsLeft = 3;
  firstCard = null;
  secondCard = null;
  lockBoard = false;
  $messageOverlay.hide();
  $timerDisplay.removeClass("warning");
  $("#powerup-btn").prop("disabled", false);
}

/**
 * Ends the game and displays the appropriate message.
 * @param {boolean} won - Indicates whether the player won the game.
 */
function endGame(won) {
  stopTimer();
  gameOver = true;
  gameStarted = false;
  lockBoard = true;

  if (won) {
    showMessage(
      "🏆",
      "You Won!",
      `Amazing! You matched all ${totalPairs} pairs in ${clicks} clicks!`,
    );
  } else {
    showMessage(
      "💀",
      "Game Over!",
      `Time's up! You matched ${matchedPairs} out of ${totalPairs} pairs.`,
    );
  }
}

/**
 * Triggers the peek power-up, allowing the player to briefly see all unmatched cards.
 * @returns {void}
 */
function triggerPeek() {
  if (!gameStarted || gameOver || powerupsLeft <= 0) return;

  powerupsLeft--;
  updateStatus();

  if (powerupsLeft === 0) {
    $("#powerup-btn").prop("disabled", true);
  }

  // Flip all unmatched, unflipped cards
  const $unmatched = $(".card:not(.matched):not(.flip)");
  $unmatched.addClass("peeking");
  lockBoard = true;

  setTimeout(() => {
    $unmatched.removeClass("peeking");
    lockBoard = false;
  }, 2000);
}

/**
 * Displays a message overlay with the specified icon, title, and body.
 * @param {*} icon - The icon to display.
 * @param {*} title - The title of the message.
 * @param {*} body - The body text of the message.
 */
function showMessage(icon, title, body) {
  $("#message-icon").text(icon);
  $("#message-title").text(title);
  $("#message-body").text(body);
  $messageOverlay.show();
}

/**
 * Shows or hides the loading overlay.
 * @param {boolean} show - Indicates whether to show the loading overlay.
 */
function showLoading(show) {
  $loadingOverlay.toggle(show);
  $grid.toggle(!show);
}

/**
 * Initializes the game when the document is ready.
 */
$(document).ready(function () {
  // Difficulty buttons
  $(".diff-btn").on("click", function () {
    $(".diff-btn").removeClass("active");
    $(this).addClass("active");
    difficulty = $(this).data("diff");
    if (!gameStarted) resetGame();
  });

  // Start
  $("#start-btn").on("click", function () {
    startGame();
  });

  // Reset
  $("#reset-btn").on("click", function () {
    resetGame();
  });

  // Power-up
  $("#powerup-btn").on("click", function () {
    triggerPeek();
  });

  // Theme toggle
  $("#theme-checkbox").on("change", function () {
    const isDark = $(this).is(":checked");
    $("html").attr("data-theme", isDark ? "dark" : "light");
  });

  // Message overlay close / play again
  $("#message-close-btn").on("click", function () {
    startGame();
  });

  // Init display
  updateStatus();
  $timerDisplay.text("--");
});
