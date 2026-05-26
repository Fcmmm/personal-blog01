import { IMAGE_BUCKET, isCloudConfigured, supabase } from "./cloud.js";

const DB_NAME = "quiet-diary-blog";
const STORE_NAME = "entries";
const DB_VERSION = 1;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $("#entryForm");
const composeSection = $("#compose");
const adminStatus = $("#adminStatus");
const titleInput = $("#titleInput");
const moodInput = $("#moodInput");
const contentInput = $("#contentInput");
const publicInput = $("#publicInput");
const imageInput = $("#imageInput");
const imagePreview = $("#imagePreview");
const submitEntryButton = $("#submitEntryButton");
const cancelEditButton = $("#cancelEditButton");
const entriesGrid = $("#entriesGrid");
const entryTemplate = $("#entryTemplate");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const sortInput = $("#sortInput");
const toast = $("#toast");
const themeToggle = $("#themeToggle");
const authButton = $("#authButton");
const authModal = $("#authModal");
const authBackdrop = $("#authBackdrop");
const closeAuthButton = $("#closeAuthButton");
const passwordAuthForm = $("#passwordAuthForm");
const passwordSignupButton = $("#passwordSignupButton");
const loginEmailInput = $("#loginEmailInput");
const loginPasswordInput = $("#loginPasswordInput");
const phoneAuthForm = $("#phoneAuthForm");
const phoneInput = $("#phoneInput");
const phoneCodeInput = $("#phoneCodeInput");
const sendPhoneCodeButton = $("#sendPhoneCodeButton");
const cloudStatus = $("#cloudStatus");
const exportButton = $("#exportButton");
const importInput = $("#importInput");
const resetButton = $("#resetButton");
const entryCount = $("#entryCount");
const photoCount = $("#photoCount");
const lastUpdated = $("#lastUpdated");
const writeNavLink = $("#writeNavLink");
const heroWriteLink = $("#heroWriteLink");

let selectedImage = "";
let selectedFile = null;
let entries = [];
let currentUser = null;
let isAdmin = false;
let editingId = null;

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
    updatedAt: entry.updated_at,
  };
}

async function loadCloudEntries() {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, owner_id, title, mood, content, image_url, image_path, is_public, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(normalizeCloudEntry);
}

async function refreshAdminFlag() {
  if (!isCloudConfigured || !currentUser) {
    isAdmin = !isCloudConfigured;
    return;
  }

  const { data, error } = await supabase.from("app_admins").select("user_id").eq("user_id", currentUser.id).maybeSingle();
  isAdmin = Boolean(data && !error);
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
    .select("id, owner_id, title, mood, content, image_url, image_path, is_public, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeCloudEntry(data);
}

async function updateCloudEntry(entry, previousEntry) {
  let nextImage = previousEntry.image;
  let nextImagePath = previousEntry.imagePath;

  if (selectedFile) {
    const uploaded = await uploadCloudImage(selectedFile);
    nextImage = uploaded.imageUrl;
    nextImagePath = uploaded.imagePath;
  }

  const { data, error } = await supabase
    .from("diary_entries")
    .update({
      title: entry.title,
      mood: entry.mood,
      content: entry.content,
      image_url: nextImage,
      image_path: nextImagePath,
      is_public: entry.isPublic,
    })
    .eq("id", previousEntry.id)
    .select("id, owner_id, title, mood, content, image_url, image_path, is_public, created_at, updated_at")
    .single();

  if (error) throw error;

  if (selectedFile && previousEntry.imagePath) {
    await supabase.storage.from(IMAGE_BUCKET).remove([previousEntry.imagePath]);
  }

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

function openAuthModal() {
  authModal.hidden = false;
  loginEmailInput.focus();
}

function closeAuthModal() {
  authModal.hidden = true;
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

function canManage() {
  return !isCloudConfigured || isAdmin;
}

function getFilteredEntries() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const visibleToVisitor = canManage() || entry.isPublic !== false;
    const haystack = `${entry.title} ${entry.content} ${entry.mood}`.toLowerCase();
    return visibleToVisitor && haystack.includes(query);
  });

  return filtered.sort((a, b) => {
    if (sortInput.value === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortInput.value === "title") return a.title.localeCompare(b.title, "zh-CN");
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function updateAuthUi() {
  const cloudEnabled = isCloudConfigured;
  const manager = canManage();

  authButton.hidden = !cloudEnabled;
  authButton.textContent = currentUser ? "退出登录" : "登录";
  composeSection.hidden = !manager;
  adminStatus.hidden = !cloudEnabled || !currentUser;
  writeNavLink.hidden = !manager;
  heroWriteLink.hidden = !manager;
  exportButton.hidden = cloudEnabled;
  importInput.closest("label").hidden = cloudEnabled;

  if (!cloudEnabled) {
    cloudStatus.textContent = "当前是本地模式。配置 Supabase 后会启用线上登录与权限。";
    return;
  }

  if (!currentUser) {
    cloudStatus.textContent = "访客模式：只能阅读公开日记。登录管理员账号后会显示编辑页面。";
    return;
  }

  cloudStatus.textContent = isAdmin
    ? `已登录管理员：${currentUser.email || currentUser.phone || currentUser.id}`
    : "已登录，但当前账号不是管理员。请把该用户加入 Supabase 的 app_admins 表。";
}

function updateStats() {
  const visibleEntries = entries.filter((entry) => canManage() || entry.isPublic !== false);
  entryCount.textContent = visibleEntries.length;
  photoCount.textContent = visibleEntries.filter((entry) => entry.image).length;
  if (!visibleEntries.length) {
    lastUpdated.textContent = "今天";
    return;
  }
  const latest = [...visibleEntries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
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
    const visibility = card.querySelector(".entry-visibility");
    const editButton = card.querySelector(".edit-entry");
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
    visibility.textContent = entry.isPublic === false ? "私密" : "公开";
    visibility.hidden = !canManage();

    editButton.hidden = !canManage();
    deleteButton.hidden = !canManage();
    editButton.addEventListener("click", () => startEdit(entry));
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("确定删除这篇日记吗？")) return;
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
  editingId = null;
  form.reset();
  selectedImage = "";
  selectedFile = null;
  imagePreview.innerHTML = "<span>未选择图片</span>";
  imagePreview.classList.remove("filled");
  submitEntryButton.textContent = "发布日记";
  cancelEditButton.hidden = true;
}

function startEdit(entry) {
  editingId = entry.id;
  titleInput.value = entry.title;
  moodInput.value = entry.mood;
  contentInput.value = entry.content;
  publicInput.checked = entry.isPublic !== false;
  selectedImage = entry.image || "";
  selectedFile = null;
  imageInput.value = "";
  submitEntryButton.textContent = "保存修改";
  cancelEditButton.hidden = false;

  if (entry.image) {
    imagePreview.innerHTML = `<img src="${entry.image}" alt="当前封面图片" />`;
    imagePreview.classList.add("filled");
  } else {
    imagePreview.innerHTML = "<span>未选择图片</span>";
    imagePreview.classList.remove("filled");
  }

  composeSection.hidden = false;
  composeSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!canManage()) {
    showToast("请先登录管理员账号");
    openAuthModal();
    return;
  }

  const previousEntry = editingId ? entries.find((entry) => entry.id === editingId) : null;
  const imageData = !editingId
    ? isCloudConfigured
      ? await uploadCloudImage(selectedFile)
      : { imageUrl: selectedImage, imagePath: "" }
    : { imageUrl: previousEntry?.image || selectedImage, imagePath: previousEntry?.imagePath || "" };

  const draft = {
    id: editingId || crypto.randomUUID(),
    title: titleInput.value.trim(),
    mood: moodInput.value,
    content: contentInput.value.trim(),
    image: imageData.imageUrl,
    imagePath: imageData.imagePath,
    isPublic: publicInput.checked,
    createdAt: previousEntry?.createdAt || new Date().toISOString(),
  };

  const savedEntry = editingId
    ? isCloudConfigured
      ? await updateCloudEntry(draft, previousEntry)
      : draft
    : isCloudConfigured
      ? await saveCloudEntry(draft)
      : draft;
  const wasEditing = Boolean(editingId);

  if (isCloudConfigured) {
    entries = editingId
      ? entries.map((entry) => (entry.id === savedEntry.id ? savedEntry : entry))
      : [savedEntry, ...entries];
  } else {
    await saveLocalEntry(savedEntry);
    entries = editingId
      ? entries.map((entry) => (entry.id === savedEntry.id ? savedEntry : entry))
      : [savedEntry, ...entries];
  }

  resetForm();
  updateStats();
  renderEntries();
  showToast(wasEditing ? "日记已保存" : "日记已发布");
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

async function refreshEntries() {
  entries = isCloudConfigured ? await loadCloudEntries() : await loadLocalEntries();
  updateStats();
  renderEntries();
}

async function initAuth() {
  if (!isCloudConfigured) {
    isAdmin = true;
    updateAuthUi();
    return;
  }

  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  await refreshAdminFlag();
  updateAuthUi();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await refreshAdminFlag();
    updateAuthUi();
    await refreshEntries();
  });
}

async function loginWithPassword(event) {
  event.preventDefault();

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  if (!email || !password) {
    showToast("请输入邮箱和密码");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast("登录失败，请检查账号密码");
    return;
  }

  closeAuthModal();
  showToast("登录成功");
}

async function signupWithPassword() {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  if (!email || !password) {
    showToast("请输入邮箱和密码");
    return;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    showToast("注册失败，请检查 Supabase 邮箱配置");
    return;
  }

  showToast("注册成功。如需验证邮件，请先完成邮箱验证");
}

async function sendPhoneCode() {
  const phone = phoneInput.value.trim();
  if (!phone.startsWith("+")) {
    showToast("手机号请使用国际格式，例如 +8613812345678");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    showToast("验证码发送失败，请检查 Supabase 手机短信配置");
    return;
  }

  showToast("验证码已发送");
}

async function verifyPhoneCode(event) {
  event.preventDefault();

  const phone = phoneInput.value.trim();
  const token = phoneCodeInput.value.trim();
  if (!phone || !token) {
    showToast("请输入手机号和验证码");
    return;
  }

  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) {
    showToast("验证码错误或已过期");
    return;
  }

  closeAuthModal();
  showToast("登录成功");
}

async function logout() {
  if (!isCloudConfigured) return;
  await supabase.auth.signOut();
  currentUser = null;
  isAdmin = false;
  resetForm();
  updateAuthUi();
  await refreshEntries();
  showToast("已退出登录");
}

function bindAuthTabs() {
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".auth-tab").forEach((item) => item.classList.remove("active"));
      $$(".auth-form[data-auth-panel]").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      $(`.auth-form[data-auth-panel="${tab.dataset.authTab}"]`).classList.add("active");
    });
  });
}

async function init() {
  initTheme();
  await initAuth();
  await refreshEntries();

  form.addEventListener("submit", handleSubmit);
  authButton.addEventListener("click", () => {
    if (currentUser) {
      logout();
    } else {
      openAuthModal();
    }
  });
  authBackdrop.addEventListener("click", closeAuthModal);
  closeAuthButton.addEventListener("click", closeAuthModal);
  passwordAuthForm.addEventListener("submit", loginWithPassword);
  passwordSignupButton.addEventListener("click", signupWithPassword);
  sendPhoneCodeButton.addEventListener("click", sendPhoneCode);
  phoneAuthForm.addEventListener("submit", verifyPhoneCode);
  bindAuthTabs();
  imageInput.addEventListener("change", handleImageChange);
  searchInput.addEventListener("input", renderEntries);
  sortInput.addEventListener("change", renderEntries);
  resetButton.addEventListener("click", resetForm);
  cancelEditButton.addEventListener("click", resetForm);
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
