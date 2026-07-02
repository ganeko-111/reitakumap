const REITAKU_CENTER = [35.8337, 139.9552];
const STORAGE_KEY = "reitaku-mapping-notes";

const map = L.map("map", {
  zoomControl: true,
}).setView(REITAKU_CENTER, 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const noteCount = document.querySelector("#noteCount");
const noteFormTemplate = document.querySelector("#noteFormTemplate");
let notes = loadNotes();
let markers = new Map();

renderNotes();

// 地図をクリックした場所に、新しい付箋を追加するフォームを開きます。
map.on("click", (event) => {
  openNoteForm(event.latlng);
});

// localStorageから保存済みの付箋を読み込みます。
function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((note) => {
      return (
        typeof note.id === "string" &&
        Number.isFinite(note.lat) &&
        Number.isFinite(note.lng) &&
        typeof note.text === "string"
      );
    });
  } catch {
    return [];
  }
}

// 付箋データを保存し、画面上の枚数表示も更新します。
function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // The app still works during the current session if browser storage is unavailable.
  }

  noteCount.textContent = String(notes.length);
}

// 現在のnotes配列をもとに、地図上の付箋を描き直します。
function renderNotes() {
  markers.forEach((marker) => marker.remove());
  markers = new Map();

  notes.forEach((note) => {
    const marker = L.marker([note.lat, note.lng], {
      draggable: true,
      icon: createStickyIcon(note.text),
      title: note.text,
    }).addTo(map);

    marker.on("click", () => {
      openNotePopup(note.id);
    });

    marker.on("dragstart", () => {
      marker.closePopup();
    });

    marker.on("dragend", () => {
      moveNote(note.id, marker.getLatLng());
    });

    markers.set(note.id, marker);
  });

  saveNotes();
}

// 付箋らしい黄色いカードをLeafletのカスタムアイコンとして作ります。
function createStickyIcon(text) {
  return L.divIcon({
    className: "",
    html: `<div class="sticky-note-marker">${escapeHtml(shorten(text, 46))}</div>`,
    iconSize: [94, 76],
    iconAnchor: [46, 64],
    popupAnchor: [0, -58],
  });
}

function openNoteForm(latlng) {
  const { form, textarea, cancelButton } = createStickyForm({
    text: "",
    submitLabel: "保存",
  });
  const popup = L.popup({
    closeButton: true,
    autoPan: true,
    className: "sticky-popup",
  })
    .setLatLng(latlng)
    .setContent(form)
    .openOn(map);

  window.setTimeout(() => textarea.focus(), 80);

  cancelButton.addEventListener("click", () => {
    map.closePopup(popup);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textarea.value.trim();

    if (!text) {
      showEmptyNoteFeedback(form, textarea);
      return;
    }

    notes.push({
      id: createNoteId(),
      lat: latlng.lat,
      lng: latlng.lng,
      text,
      createdAt: new Date().toISOString(),
    });

    map.closePopup(popup);
    renderNotes();
  });
}

function openNotePopup(noteId) {
  const note = findNote(noteId);
  const marker = markers.get(noteId);

  if (!note || !marker) {
    return;
  }

  const card = document.createElement("div");
  card.className = "sticky-popup-card";

  const body = document.createElement("p");
  body.textContent = note.text;

  const actions = document.createElement("div");
  actions.className = "popup-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "primary-button";
  editButton.textContent = "編集";
  editButton.title = "この付箋を編集";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "削除";
  deleteButton.title = "この付箋を削除";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ghost-button";
  closeButton.textContent = "閉じる";
  closeButton.title = "付箋を閉じる";

  actions.append(editButton, deleteButton, closeButton);
  card.append(body, actions);

  marker.bindPopup(card, {
    closeButton: true,
    autoPan: true,
    className: "sticky-popup",
  }).openPopup();

  editButton.addEventListener("click", () => {
    openEditForm(note.id);
  });

  deleteButton.addEventListener("click", () => {
    deleteNote(note.id);
  });

  closeButton.addEventListener("click", () => {
    marker.closePopup();
  });
}

function openEditForm(noteId) {
  const note = findNote(noteId);
  const marker = markers.get(noteId);

  if (!note || !marker) {
    return;
  }

  const { form, textarea, cancelButton } = createStickyForm({
    text: note.text,
    submitLabel: "保存",
  });

  marker.bindPopup(form, {
    closeButton: true,
    autoPan: true,
    className: "sticky-popup",
  }).openPopup();

  window.setTimeout(() => textarea.focus(), 80);

  cancelButton.addEventListener("click", () => {
    marker.closePopup();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textarea.value.trim();

    if (!text) {
      showEmptyNoteFeedback(form, textarea);
      return;
    }

    // notes配列の内容を更新すると、localStorageにも同じ内容を保存できます。
    note.text = text;
    note.updatedAt = new Date().toISOString();

    marker.options.title = note.text;
    marker.setIcon(createStickyIcon(note.text));
    saveNotes();
    openNotePopup(note.id);
  });
}

function moveNote(noteId, latlng) {
  const note = findNote(noteId);

  if (!note) {
    return;
  }

  // ドラッグ後の座標を保存すると、再読み込み後も移動先に残ります。
  note.lat = latlng.lat;
  note.lng = latlng.lng;
  note.updatedAt = new Date().toISOString();
  saveNotes();
}

function deleteNote(noteId) {
  notes = notes.filter((note) => note.id !== noteId);
  renderNotes();
}

function createStickyForm({ text, submitLabel }) {
  const form = noteFormTemplate.content.firstElementChild.cloneNode(true);
  const textarea = form.querySelector("textarea");
  const cancelButton = form.querySelector('[data-action="cancel"]');
  const submitButton = form.querySelector('button[type="submit"]');

  textarea.value = text;
  submitButton.textContent = submitLabel;

  return { form, textarea, cancelButton };
}

function showEmptyNoteFeedback(form, textarea) {
  form.classList.remove("empty-note");
  void form.offsetWidth;
  form.classList.add("empty-note");
  textarea.focus();
}

function findNote(noteId) {
  return notes.find((note) => note.id === noteId);
}

function shorten(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

// 古いブラウザでも付箋IDを作れるように、randomUUIDがない場合の代替を用意します。
function createNoteId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 付箋の本文をHTMLとして解釈しないよう、表示前に安全な文字へ変換します。
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
