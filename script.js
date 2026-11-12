const cards = [...document.querySelectorAll("#وردك .recitation-card")];
const progressCount = document.querySelector("#progress-count");
const progressFill = document.querySelector("#progress-fill");
const audioPanel = document.querySelector("#audio-panel");
const audioPlayer = document.querySelector("#audio-player");
const audioTitle = document.querySelector("#audio-title");
const audioStatus = document.querySelector("#audio-status");
const today = new Date().toLocaleDateString("en-CA");
const storageKey = `wird-progress-${today}`;
const audioSegments = {
  fatiha: [{ type: "surah", id: 1 }],
  baqarah: [{ type: "surah", id: 2 }],
  kursi: [{ type: "ayah", id: "2:255" }],
  "end-baqarah": [
    { type: "ayah", id: "2:285" },
    { type: "ayah", id: "2:286" },
  ],
  muawwidhat: [
    { type: "surah", id: 112 },
    { type: "surah", id: 113 },
    { type: "surah", id: 114 },
  ],
  "rizq-nuh": [
    { type: "ayah", id: "71:10" },
    { type: "ayah", id: "71:11" },
    { type: "ayah", id: "71:12" },
  ],
  "rizq-talaq": [
    { type: "ayah", id: "65:2" },
    { type: "ayah", id: "65:3" },
  ],
  "rizq-jumuah": [{ type: "ayah", id: "62:10" }],
};

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    console.warn("تعذّر استعادة تقدّم القراءة من التخزين المحلي.", error);
    return new Set();
  }
}

const completed = readProgress();
let playbackSequence = 0;
let playlist = [];
let trackIndex = 0;
let activeListenButton = null;
let expectedAudioSrc = "";

function setActiveListenButton(button) {
  for (const listenButton of document.querySelectorAll(".listen-button")) {
    const isActive = listenButton === button;
    listenButton.setAttribute("aria-pressed", String(isActive));
    listenButton.querySelector(".play-icon").textContent = isActive ? "■" : "▶";
    listenButton.querySelector(".listen-label").textContent = isActive ? "إيقاف" : "استمع";
  }
}

function stopPlayback(message = "تم إيقاف الاستماع.") {
  playbackSequence += 1;
  expectedAudioSrc = "";
  activeListenButton = null;
  setActiveListenButton(null);
  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  playlist = [];
  audioStatus.textContent = message;
}

async function fetchAudioUrls(segment) {
  const endpoint = segment.type === "surah"
    ? `surah/${segment.id}/ar.alafasy`
    : `ayah/${segment.id}/ar.alafasy`;
  const response = await fetch(`https://api.alquran.cloud/v1/${endpoint}`);

  if (!response.ok) {
    throw new Error(`تعذّر تحميل التلاوة (${response.status}).`);
  }

  const result = await response.json();
  if (result.code !== 200 || !result.data) {
    throw new Error("لم تتوفر بيانات التلاوة.");
  }

  const urls = segment.type === "surah"
    ? result.data.ayahs.map((ayah) => ayah.audio)
    : [result.data.audio];
  const validUrls = urls.filter((url) => {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });

  if (validUrls.length !== urls.length || validUrls.length === 0) {
    throw new Error("رابط التلاوة غير صالح.");
  }

  return validUrls;
}

async function playTrack(requestId) {
  if (requestId !== playbackSequence) {
    return;
  }

  if (trackIndex >= playlist.length) {
    audioStatus.textContent = "انتهت التلاوة.";
    activeListenButton = null;
    setActiveListenButton(null);
    return;
  }

  expectedAudioSrc = playlist[trackIndex];
  audioPlayer.src = expectedAudioSrc;
  audioPlayer.load();

  try {
    await audioPlayer.play();
    if (requestId === playbackSequence) {
      const current = new Intl.NumberFormat("ar").format(trackIndex + 1);
      const total = new Intl.NumberFormat("ar").format(playlist.length);
      audioStatus.textContent = `المقطع ${current} من ${total}`;
    }
  } catch (error) {
    if (requestId === playbackSequence) {
      audioStatus.textContent = "اضغط زر التشغيل في المشغّل لبدء التلاوة.";
    }
  }
}

audioPlayer.addEventListener("ended", () => {
  trackIndex += 1;
  void playTrack(playbackSequence);
});

audioPlayer.addEventListener("error", () => {
  if (activeListenButton && expectedAudioSrc) {
    audioStatus.textContent = "تعذّر تشغيل المقطع. تحقق من اتصالك بالإنترنت.";
    expectedAudioSrc = "";
    activeListenButton = null;
    setActiveListenButton(null);
  }
});

for (const button of document.querySelectorAll(".listen-button")) {
  button.addEventListener("click", async () => {
    if (button === activeListenButton) {
      stopPlayback();
      return;
    }

    const requestId = ++playbackSequence;
    expectedAudioSrc = "";
    activeListenButton = null;
    setActiveListenButton(null);
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    activeListenButton = button;
    playlist = [];
    trackIndex = 0;
    setActiveListenButton(button);
    audioPanel.hidden = false;
    audioTitle.textContent = button.closest(".recitation-card").querySelector("h3").textContent;
    audioStatus.textContent = "جارٍ تجهيز التلاوة بصوت مشاري العفاسي...";

    try {
      const segments = audioSegments[button.dataset.audio];
      playlist = (await Promise.all(segments.map(fetchAudioUrls))).flat();
      if (requestId !== playbackSequence) {
        return;
      }

      audioStatus.textContent = "بدأت التلاوة.";
      await playTrack(requestId);
    } catch (error) {
      if (requestId === playbackSequence) {
        audioStatus.textContent = "تعذّر تحميل التلاوة. تحقق من اتصالك ثم حاول مجددًا.";
        activeListenButton = null;
        setActiveListenButton(null);
        console.error("تعذّر تحميل التلاوة:", error);
      }
    }
  });
}

function renderProgress() {
  const count = cards.filter((card) => completed.has(card.dataset.id)).length;
  const digits = new Intl.NumberFormat("ar").format(count);
  const total = new Intl.NumberFormat("ar").format(cards.length);

  progressCount.textContent = `${digits} من ${total}`;
  progressFill.style.width = `${(count / cards.length) * 100}%`;

  for (const card of cards) {
    const button = card.querySelector(".done-button");
    const isDone = completed.has(card.dataset.id);
    button.setAttribute("aria-pressed", String(isDone));
    card.classList.toggle("is-done", isDone);
  }
}

for (const card of cards) {
  card.querySelector(".done-button").addEventListener("click", () => {
    const id = card.dataset.id;
    if (completed.has(id)) {
      completed.delete(id);
    } else {
      completed.add(id);
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify([...completed]));
    } catch (error) {
      console.warn("تعذّر حفظ تقدّم القراءة على هذا الجهاز.", error);
    }

    renderProgress();
  });
}

renderProgress();
