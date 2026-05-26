import { IMAGE_BUCKET, isCloudConfigured, supabase } from "./cloud.js";

const DB_NAME = "quiet-diary-blog";
const STORE_NAME = "entries";
const DB_VERSION = 1;

const $ = (selector) => document.querySelector(selector);

const form = $("#entryForm");
const titleInput = $("#titleInput");
const moodInput = $("#moodInput");
const contentInput = $("#contentInput");
const imageInput = $("#imageInput");
const imagePreview = $("#imagePreview");
const entriesGrid = $("#entriesGrid");
const entryTemplate = $("#entryTemplate");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const sortInput = $("#sortInput");
const toast = $("#toast");
const themeToggle = $("#themeToggle");
const authButton = $("#authButton");
const authPanel = $("#authPanel");
const authForm = $("#authForm");
const emailInput = $("#emailInput");
const logoutButton = $("#logoutButton");
const cloudStatus = $("#cloudStatus");
const exportButton = $("#exportButton");
const importInput = $("#importInput");
const resetButton = $("#resetButton");
const entryCount = $("#entryCount");
const photoCount = $("#photoCount");
const lastUpdated = $("#lastUpdated");
const publicInput = $("#publicInput");

let selectedImage = "";
let selectedFile = null;
let entries = [];
let currentUser = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = callback(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function loadLocalEntries() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

function saveLocalEntry(entry) {
  return withStore("readwrite", (store) => store.put(entry));
}

function deleteLocalEntry(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

function clearLocalEntries() {
  return withStore("readwrite", (store) => store.clear());
}

function normalizeCloudEntry(entry) {
  return {
    id: entry.id,
    title: entry.title,
    mood: entry.mood,
    content: entry.content,
    image: entry.image_url || "",
    imagePath: entry.image_path || "",
    isPublic: entry.is_public,
    ownerId: entry.owner_id,
    createdAt: entry.created_at,
  };
}

async function loadCloudEntries() {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, owner_id, title, mood, content, image_url, image_path, is_public, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(normalizeCloudEntry);
}

async function uploadCloudImage(file) {
  if (!file) return { imageUrl: "", imagePath: "" };

  const extension = file.name.split(".").pop() || "jpg";
  const imagePath = `${currentUser.id}/${crypto.randomUUID()}.${extension.toLowerCase()}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(imagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(imagePath);
  return { imageUrl: data.publicUrl, imagePath };
}

async function saveCloudEntry(entry) {
  const { data, error } = await supabase
    .from("diary_entries")
    .insert({
      owner_id: currentUser.id,
      title: entry.title,
      mood: entry.mood,
      content: entry.content,
      image_url: entry.image,
      image_path: entry.imagePath,
      is_public: entry.isPublic,
    })
    .select("id, owner_id, title, mood, content, image_url, image_path, is_public, created_at")
    .single();

  if (error) throw error;
  return normalizeCloudEntry(data);
}

async function deleteCloudEntry(entry) {
  const { error } = await supabase.from("diary_entries").delete().eq("id", entry.id);
  if (error) throw error;

  if (entry.imagePath) {
    await supabase.storage.from(IMAGE_BUCKET).remove([entry.imagePath]);
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2400);
}

function escapeText(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function getFilteredEntries() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.content} ${entry.mood}`.toLowerCase();
    return haystack.includes(query);
  });

  return filtered.sort((a, b) => {
    if (sortInput.value === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortInput.value === "title") return a.title.localeCompare(b.title, "zh-CN");
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function canWrite() {
  return !isCloudConfigured || Boolean(currentUser);
}

function updateAuthUi() {
  const cloudEnabled = isCloudConfigured;
  authButton.textContent = cloudEnabled && currentUser ? "云端已登录" : "登录";
  authForm.hidden = !cloudEnabled || Boolean(currentUser);
  logoutButton.hidden = !cloudEnabled || !currentUser;
  cloudStatus.textContent = cloudEnabled
    ? currentUser
      ? `已登录：${currentUser.email}。文章和图片会保存到 Supabase 云端。`
      : "当前已启用 Supabase 云端模式。登录后可发布、上传图片和删除自己的文章。"
    : "当前使用本地模式。配置 Supabase 后，可登录并把日记与图片保存到云端。";

  form.classList.toggle("locked", !canWrite());
  form.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = !canWrite();
  });
}

function updateStats() {
  entryCount.textContent = entries.length;
  photoCount.textContent = entries.filter((entry) => entry.image).length;
  if (!entries.length) {
    lastUpdated.textContent = "今天";
    return;
  }
  const latest = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  lastUpdated.textContent = formatDate(latest.createdAt);
}

function renderEntries() {
  const visibleEntries = getFilteredEntries();
  entriesGrid.innerHTML = "";
  emptyState.hidden = visibleEntries.length > 0;

  visibleEntries.forEach((entry, index) => {
    const card = entryTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector(".entry-image");
    const title = card.querySelector("h3");
    const content = card.querySelector("p");
    const date = card.querySelector(".entry-date");
    const mood = card.querySelector(".entry-mood");
    const deleteButton = card.querySelector(".delete-entry");

    card.style.animationDelay = `${Math.min(index * 70, 420)}ms`;
    if (entry.image) {
      image.style.backgroundImage = `url("${entry.image}")`;
      image.classList.add("has-image");
    } else {
      image.innerHTML = "<span>Diary</span>";
    }

    title.textContent = entry.title;
    content.innerHTML = escapeText(entry.content).replace(/\n/g, "<br />");
    date.textContent = formatDate(entry.createdAt);
    mood.textContent = entry.mood;
    deleteButton.hidden = !canWrite();
    deleteButton.addEventListener("click", async () => {
      if (isCloudConfigured) {
        await deleteCloudEntry(entry);
      } else {
        await deleteLocalEntry(entry.id);
      }
      entries = entries.filter((item) => item.id !== entry.id);
      updateStats();
      renderEntries();
      showToast("已删除这篇日记");
    });

    entriesGrid.appendChild(card);
  });
}

function resetForm() {
  form.reset();
  selectedImage = "";
  selectedFile = null;
  imagePreview.innerHTML = "<span>未选择图片</span>";
  imagePreview.classList.remove("filled");
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!canWrite()) {
    showToast("请先登录后再发布");
    authPanel.hidden = false;
    return;
  }

  const imageData = isCloudConfigured
    ? await uploadCloudImage(selectedFile)
    : { imageUrl: selectedImage, imagePath: "" };

  const draft = {
    id: crypto.randomUUID(),
    title: titleInput.value.trim(),
    mood: moodInput.value,
    content: contentInput.value.trim(),
    image: imageData.imageUrl,
    imagePath: imageData.imagePath,
    isPublic: publicInput.checked,
    createdAt: new Date().toISOString(),
  };

  const entry = isCloudConfigured ? await saveCloudEntry(draft) : draft;
  if (!isCloudConfigured) await saveLocalEntry(entry);

  entries = [entry, ...entries];
  resetForm();
  updateStats();
  renderEntries();
  showToast("日记已发布");
}

async function handleImageChange() {
  const [file] = imageInput.files;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }

  selectedFile = file;
  selectedImage = await readImage(file);
  imagePreview.innerHTML = `<img src="${selectedImage}" alt="上传图片预览" />`;
  imagePreview.classList.add("filled");
}

function exportEntries() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `quiet-diary-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("备份文件已生成");
}

async function importEntries(event) {
  if (isCloudConfigured) {
    showToast("云端模式请使用 Supabase 数据库备份");
    importInput.value = "";
    return;
  }

  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid backup");

    await clearLocalEntries();
    await Promise.all(imported.map((entry) => saveLocalEntry(entry)));
    entries = imported;
    updateStats();
    renderEntries();
    showToast("备份已导入");
  } catch {
    showToast("导入失败，请检查备份文件");
  } finally {
    importInput.value = "";
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("quiet-diary-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("quiet-diary-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(saved || (prefersDark ? "dark" : "light"));
}

async function initAuth() {
  if (!isCloudConfigured) {
    updateAuthUi();
    return;
  }

  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUi();
  });
  updateAuthUi();
}

async function sendLoginLink(event) {
  event.preventDefault();
  if (!isCloudConfigured) return;

  const email = emailInput.value.trim();
  if (!email) {
    showToast("请输入邮箱");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    showToast("登录链接发送失败");
    return;
  }

  emailInput.value = "";
  showToast("登录链接已发送，请查看邮箱");
}

async function logout() {
  if (!isCloudConfigured) return;
  await supabase.auth.signOut();
  currentUser = null;
  updateAuthUi();
  showToast("已退出登录");
}

async function init() {
  initTheme();
  await initAuth();
  entries = isCloudConfigured ? await loadCloudEntries() : await loadLocalEntries();
  updateStats();
  renderEntries();

  form.addEventListener("submit", handleSubmit);
  authButton.addEventListener("click", () => {
    authPanel.hidden = !authPanel.hidden;
  });
  authForm.addEventListener("submit", sendLoginLink);
  logoutButton.addEventListener("click", logout);
  imageInput.addEventListener("change", handleImageChange);
  searchInput.addEventListener("input", renderEntries);
  sortInput.addEventListener("change", renderEntries);
  resetButton.addEventListener("click", resetForm);
  exportButton.addEventListener("click", exportEntries);
  importInput.addEventListener("change", importEntries);
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "light" : "dark");
  });
}

init().catch((error) => {
  console.error(error);
  showToast("应用启动失败，请检查云服务配置");
});
