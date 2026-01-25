const imageFiles = [
  "image/a.avif",
  "image/a1.avif",
  "image/a2.avif",
  "image/c1.avif",
  "image/c2.avif",
  "image/c3.avif",
  "image/d1.avif",
  "image/d2.avif",
  "image/e1.avif",
  "image/e2.avif",
  "image/f1.avif",
  "image/f2.avif",
  "image/g.avif",
  "image/g1.avif",
  "image/g2.avif",
  "image/h.avif",
  "image/h1.avif",
  "image/h2.avif"
];

const images = imageFiles.map((src) => {
  const file = src.split("/").pop() ?? "";
  const stem = file.split(".")[0] ?? "";
  const answer = stem.replace(/\d+$/u, "").toLowerCase();
  return { src, answer };
});

const guessImage = document.getElementById("guess-image");
const imageFrame = document.querySelector(".image-frame");
const progress = document.getElementById("progress");
const scoreEl = document.getElementById("score");
const mistakesEl = document.getElementById("mistakes");
const timerEl = document.getElementById("timer");
const messageEl = document.getElementById("message");
const restartBtn = document.getElementById("restart");

let order = [];
let currentIndex = 0;
let score = 0;
let mistakes = 0;
let attemptsForImage = 0;
let locked = false;
let startTime = 0;
let timerStarted = false;

const shuffle = (list) => {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const setMessage = (text, tone = "neutral") => {
  messageEl.textContent = text;
  messageEl.style.color =
    tone === "good" ? "#8bffb0" : tone === "bad" ? "#ff9a9a" : "#f5f7ff";
};

const triggerFeedback = (type) => {
  if (!imageFrame) return;
  imageFrame.classList.remove("anim-correct", "anim-wrong");
  void imageFrame.offsetWidth;
  imageFrame.classList.add(type === "correct" ? "anim-correct" : "anim-wrong");
};

if (imageFrame) {
  imageFrame.addEventListener("animationend", () => {
    imageFrame.classList.remove("anim-correct", "anim-wrong");
  });
}

const formatTime = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const updateTimer = () => {
  if (!timerEl) return;
  const elapsed = timerStarted ? Date.now() - startTime : 0;
  timerEl.textContent = formatTime(elapsed);
};

const startTimer = () => {
  if (timerStarted) return;
  timerStarted = true;
  startTime = Date.now();
};

const updateStatus = () => {
  progress.textContent = `${Math.min(currentIndex + 1, order.length)} / ${order.length}`;
  scoreEl.textContent = String(score);
  mistakesEl.textContent = String(mistakes);
};

const showImage = () => {
  const item = order[currentIndex];
  if (!item) return;
  guessImage.src = item.src;
  guessImage.alt = "Arvaa nuotti";
  updateStatus();
};

const finishGame = () => {
  setMessage(`Valmis! Lopputulos: ${score}/${order.length}.`, "good");
  guessImage.src = order[order.length - 1]?.src ?? "";
  locked = true;
  updateTimer();
  timerStarted = false;
};

const handleGuess = (key) => {
  if (locked) return;
  const item = order[currentIndex];
  if (!item) return;
  startTimer();
  const isCorrect = key === item.answer || (item.answer === "h" && key === "b");
  if (isCorrect) {
    score += 1;
    setMessage("Oikein!", "good");
    triggerFeedback("correct");
    currentIndex += 1;
    attemptsForImage = 0;
    if (currentIndex >= order.length) {
      finishGame();
      updateStatus();
      return;
    }
    showImage();
    return;
  }
  mistakes += 1;
  attemptsForImage += 1;
  triggerFeedback("wrong");
  if (attemptsForImage >= 3) {
    setMessage(`Vastaus: ${item.answer.toUpperCase()}.`, "bad");
    updateStatus();
    return;
  }
  setMessage("Ei oikein, yritä uudestaan.", "bad");
  updateStatus();
};

const startGame = () => {
  const round = shuffle(images);
  order = [...round, ...round];
  currentIndex = 0;
  score = 0;
  mistakes = 0;
  attemptsForImage = 0;
  locked = false;
  timerStarted = false;
  startTime = 0;
  if (timerEl) {
    timerEl.textContent = "--:--";
  }
  setMessage("Kirjoita nuotin nimi aloittaaksesi.");
  showImage();
};

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!/^[a-z]$/.test(key)) return;
  handleGuess(key);
});

restartBtn.addEventListener("click", startGame);

startGame();
