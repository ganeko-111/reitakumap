const REITAKU_CENTER = [35.8337, 139.9552];
const STORAGE_KEY = "reitaku-mapping-notes";
const PANEL_STORAGE_KEY = "reitaku-mapping-panel-hidden";
const TEXT_NOTE_ZOOM = 16;
const COMPACT_NOTE_ZOOM = 14;
const IMAGE_MAX_SIZE = 800;
const IMAGE_JPEG_QUALITY = 0.82;
const DEFAULT_NOTE_TYPE = "発見";
const NOTE_TYPES = {
  発見: {
    className: "sticky-note-marker--type-discovery",
    label: "発見",
  },
  おすすめ: {
    className: "sticky-note-marker--type-recommendation",
    label: "おすすめ",
  },
  注意: {
    className: "sticky-note-marker--type-warning",
    label: "注意",
  },
  休憩: {
    className: "sticky-note-marker--type-rest",
    label: "休憩",
  },
};
const NOTE_TYPE_ALIASES = {
  discovery: "発見",
  recommendation: "おすすめ",
  recommend: "おすすめ",
  warning: "注意",
  rest: "休憩",
};

const map = L.map("map", {
  zoomControl: true,
}).setView(REITAKU_CENTER, 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const noteCount = document.querySelector("#noteCount");
const noteFormTemplate = document.querySelector("#noteFormTemplate");
const resetButton = document.querySelector("#resetNotes");
const appInfoPanel = document.querySelector("#appInfoPanel");
const hideInfoPanelButton = document.querySelector("#hideInfoPanel");
const showInfoPanelButton = document.querySelector("#showInfoPanel");
let notes = loadNotes();
let markers = new Map();

renderNotes();
setInfoPanelHidden(loadInfoPanelHidden());

// 地図をクリックした場所に、新しい付箋を追加するフォームを開きます。
map.on("click", (event) => {
  openNoteForm(event.latlng);
});

// ズームが変わったら、保存済みの付箋データはそのままに見た目だけ更新します。
map.on("zoomend", () => {
  refreshMarkerIcons();
});

resetButton.addEventListener("click", resetNotes);

hideInfoPanelButton.addEventListener("click", () => {
  setInfoPanelHidden(true);
});

showInfoPanelButton.addEventListener("click", () => {
  setInfoPanelHidden(false);
});

function loadInfoPanelHidden() {
  try {
    return localStorage.getItem(PANEL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveInfoPanelHidden(isHidden) {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, String(isHidden));
  } catch {
    // 保存できない環境でも、現在の画面では切り替えられるようにします。
  }
}

function setInfoPanelHidden(isHidden) {
  appInfoPanel.hidden = isHidden;
  showInfoPanelButton.hidden = !isHidden;
  hideInfoPanelButton.setAttribute("aria-expanded", String(!isHidden));
  showInfoPanelButton.setAttribute("aria-expanded", String(!isHidden));
  document.body.classList.toggle("panel-collapsed", isHidden);
  saveInfoPanelHidden(isHidden);
}

// localStorageから保存済みの付箋を読み込みます。
function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((note) => {
        return (
          typeof note.id === "string" &&
          Number.isFinite(note.lat) &&
          Number.isFinite(note.lng) &&
          typeof note.text === "string"
        );
      })
      .map((note) => {
        return {
          ...note,
          type: normalizeNoteType(note.type),
          image: normalizeNoteImage(note.image),
        };
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

  updateNoteCount();
}

function updateNoteCount() {
  noteCount.textContent = String(notes.length);
}

// 現在のnotes配列をもとに、地図上の付箋を描き直します。
function renderNotes() {
  markers.forEach((marker) => marker.remove());
  markers = new Map();

  notes.forEach((note) => {
    const marker = L.marker([note.lat, note.lng], {
      bubblingMouseEvents: false,
      draggable: true,
      icon: createStickyIcon(note.text, map.getZoom(), note.type),
      title: note.text,
    }).addTo(map);

    attachNoteMarkerEvents(marker, note);

    markers.set(note.id, marker);
  });

  saveNotes();
}

function attachNoteMarkerEvents(marker, note) {
  marker.off("click");
  marker.off("dragstart");
  marker.off("dragend");

  marker.on("click", (event) => {
    if (event.originalEvent) {
      L.DomEvent.stopPropagation(event.originalEvent);
    }

    openNotePopup(note, marker);
  });

  marker.on("dragstart", () => {
    marker.closePopup();
  });

  marker.on("dragend", () => {
    moveNote(note.id, marker.getLatLng());
  });
}

// 付箋らしい黄色いカードをLeafletのカスタムアイコンとして作ります。
function createStickyIcon(text, zoom = map.getZoom(), type = DEFAULT_NOTE_TYPE) {
  const mode = getStickyIconMode(zoom);
  const noteType = normalizeNoteType(type);
  const typeConfig = getNoteTypeConfig(noteType);
  const markerClass = `sticky-note-marker ${typeConfig.className}`;
  const ariaLabel = `${typeConfig.label}の付箋: ${shorten(text, 24)}`;

  if (mode === "compact") {
    return L.divIcon({
      className: "",
      html: `<div class="${markerClass} sticky-note-marker--compact" aria-label="${escapeHtml(ariaLabel)}"></div>`,
      iconSize: [42, 38],
      iconAnchor: [21, 32],
      popupAnchor: [0, -28],
    });
  }

  if (mode === "dot") {
    return L.divIcon({
      className: "",
      html: `<div class="${markerClass} sticky-note-marker--dot" aria-label="${escapeHtml(ariaLabel)}"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  return L.divIcon({
    className: "",
    html: `<div class="${markerClass}">${escapeHtml(shorten(text, 46))}</div>`,
    iconSize: [94, 76],
    iconAnchor: [46, 64],
    popupAnchor: [0, -58],
  });
}

function getStickyIconMode(zoom) {
  if (zoom >= TEXT_NOTE_ZOOM) {
    return "full";
  }

  if (zoom >= COMPACT_NOTE_ZOOM) {
    return "compact";
  }

  return "dot";
}

function refreshMarkerIcons() {
  const zoom = map.getZoom();

  notes.forEach((note) => {
    const marker = markers.get(note.id);

    if (!marker) {
      return;
    }

    marker.options.title = note.text;
    marker.setIcon(createStickyIcon(note.text, zoom, note.type));
    attachNoteMarkerEvents(marker, note);
  });
}

function openNoteForm(latlng) {
  const { form, textarea, typeSelect, cancelButton, getImageData } = createStickyForm({
    text: "",
    type: DEFAULT_NOTE_TYPE,
    image: null,
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

  form.addEventListener("submit", async (event) => {
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
      type: normalizeNoteType(typeSelect.value),
      image: await getImageData(),
      createdAt: new Date().toISOString(),
    });

    map.closePopup(popup);
    renderNotes();
  });
}

function openNotePopup(noteOrId, markerFromClick) {
  const note = typeof noteOrId === "string" ? findNote(noteOrId) : noteOrId;
  const marker = markerFromClick || markers.get(note?.id);

  if (!note || !marker) {
    return;
  }

  const card = document.createElement("div");
  card.className = `sticky-popup-card ${getNoteTypeConfig(note.type).className}`;

  const typeBadge = document.createElement("span");
  typeBadge.className = "note-type-pill";
  typeBadge.textContent = getNoteTypeConfig(note.type).label;

  const body = document.createElement("p");
  body.textContent = note.text;

  const image = createNoteImage(note.image);

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
  card.append(typeBadge, body);

  if (image) {
    card.append(image);
  }

  card.append(actions);

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

  const { form, textarea, typeSelect, cancelButton, getImageData } = createStickyForm({
    text: note.text,
    type: note.type,
    image: note.image,
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();

    if (!text) {
      showEmptyNoteFeedback(form, textarea);
      return;
    }

    // notes配列の内容を更新すると、localStorageにも同じ内容を保存できます。
    note.text = text;
    note.type = normalizeNoteType(typeSelect.value);
    note.image = await getImageData();
    note.updatedAt = new Date().toISOString();

    marker.options.title = note.text;
    marker.setIcon(createStickyIcon(note.text, map.getZoom(), note.type));
    attachNoteMarkerEvents(marker, note);
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

function resetNotes() {
  const shouldReset = window.confirm("すべての付箋を削除しますか？");

  if (!shouldReset) {
    return;
  }

  notes = [];
  markers.forEach((marker) => marker.remove());
  markers = new Map();
  map.closePopup();

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存領域が使えない場合でも、画面上の付箋は消せるようにします。
  }

  updateNoteCount();
}

function createStickyForm({ text, type, image, submitLabel }) {
  const form = noteFormTemplate.content.firstElementChild.cloneNode(true);
  const textarea = form.querySelector("textarea");
  const typeSelect = form.querySelector("select");
  const imageInput = form.querySelector('input[type="file"]');
  const imagePreview = form.querySelector("[data-image-preview]");
  const imagePreviewImg = imagePreview.querySelector("img");
  const removeImageButton = form.querySelector('[data-action="remove-image"]');
  const cancelButton = form.querySelector('[data-action="cancel"]');
  const submitButton = form.querySelector('button[type="submit"]');
  const currentType = normalizeNoteType(type);
  let imageData = normalizeNoteImage(image);

  textarea.value = text;
  typeSelect.value = currentType;
  submitButton.textContent = submitLabel;
  updateFormTypeClass(form, currentType);
  updateImagePreview();

  typeSelect.addEventListener("change", () => {
    updateFormTypeClass(form, typeSelect.value);
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      window.alert("画像ファイルを選択してください。");
      imageInput.value = "";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "処理中...";

    try {
      // localStorageに入れやすいよう、選択時に800px以内のJPEGへ圧縮します。
      imageData = await resizeImageFile(file);
      updateImagePreview();
    } catch {
      window.alert("写真を読み込めませんでした。別の画像を選んでください。");
      imageInput.value = "";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
    }
  });

  removeImageButton.addEventListener("click", () => {
    imageData = null;
    imageInput.value = "";
    updateImagePreview();
  });

  function updateImagePreview() {
    if (!imageData) {
      imagePreview.hidden = true;
      removeImageButton.hidden = true;
      imagePreviewImg.removeAttribute("src");
      return;
    }

    imagePreview.hidden = false;
    removeImageButton.hidden = false;
    imagePreviewImg.src = imageData;
  }

  return {
    form,
    textarea,
    typeSelect,
    cancelButton,
    getImageData: () => imageData,
  };
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

function createNoteImage(imageData) {
  const safeImage = normalizeNoteImage(imageData);

  if (!safeImage) {
    return null;
  }

  const image = document.createElement("img");
  image.className = "note-photo";
  image.src = safeImage;
  image.alt = "付箋に添付された写真";
  return image;
}

function normalizeNoteImage(imageData) {
  if (typeof imageData === "string" && imageData.startsWith("data:image/")) {
    return imageData;
  }

  return null;
}

function normalizeNoteType(type) {
  if (typeof type !== "string") {
    return DEFAULT_NOTE_TYPE;
  }

  if (NOTE_TYPES[type]) {
    return type;
  }

  return NOTE_TYPE_ALIASES[type] || DEFAULT_NOTE_TYPE;
}

function getNoteTypeConfig(type) {
  return NOTE_TYPES[normalizeNoteType(type)];
}

function updateFormTypeClass(form, type) {
  const typeClasses = Object.values(NOTE_TYPES).map((noteType) => noteType.className);

  form.classList.remove(...typeClasses);
  form.classList.add(getNoteTypeConfig(type).className);
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", reject);
    reader.addEventListener("load", () => {
      const image = new Image();

      image.addEventListener("error", reject);
      image.addEventListener("load", () => {
        const { width, height } = getResizedDimensions(image.width, image.height);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
      });

      image.src = reader.result;
    });

    reader.readAsDataURL(file);
  });
}

function getResizedDimensions(width, height) {
  const largestSide = Math.max(width, height);

  if (largestSide <= IMAGE_MAX_SIZE) {
    return { width, height };
  }

  const scale = IMAGE_MAX_SIZE / largestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
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
