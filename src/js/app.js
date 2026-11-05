import { checkInitialSession, sendMagicLink, signOut } from "./auth.js";
import { loadAll, saveItem, deleteItem, togglePin, markOpened } from "./data.js";
import { renderItems, renderTagChips, filterItems } from "./ui/items.js";
import { ItemModal } from "./ui/modal.js";

// Estado local reactivo
let allItems = [];
let allTags = [];
let activeTag = null;
let searchQuery = "";
let itemModal = null;

// Elementos de la interfaz
const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginBtn = document.getElementById("btn-login");
const loginMsg = document.getElementById("login-msg");

const btnLogout = document.getElementById("btn-logout");
const btnNewItem = document.getElementById("btn-new-item");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const tagChipsWrap = document.getElementById("tag-chips-wrap");

const pinnedSection = document.getElementById("pinned-section");
const pinnedList = document.getElementById("pinned-list");
const recentSectionTitle = document.getElementById("recent-section-title");
const recentList = document.getElementById("recent-list");
const toastContainer = document.getElementById("toast-container");

// Sistema de Notificaciones Toast
export function showToast(message, type = "info") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Calcular contador de etiquetas basado en los items activos
function getTagsWithCount(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item.tags || []).forEach((t) => {
      const lower = t.name.toLowerCase();
      counts.set(lower, (counts.get(lower) || 0) + 1);
    });
  });

  const list = [];
  counts.forEach((count, name) => {
    list.push({ name, count });
  });

  return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Actualizar renderizado en pantalla
function updateUI() {
  const filtered = filterItems(allItems, searchQuery, activeTag);
  const isFiltering = Boolean(searchQuery.trim() || activeTag);

  // Render de chips de etiquetas
  const tagsWithCount = getTagsWithCount(allItems);
  renderTagChips(tagsWithCount, activeTag, tagChipsWrap, (selectedTag) => {
    activeTag = selectedTag;
    updateUI();
  });

  const handlers = {
    onOpenLink: (id) => markOpened(id),
    onTogglePin: async (id, currentPinned) => {
      const res = await togglePin(id, currentPinned);
      if (res.ok) {
        const item = allItems.find((i) => i.id === id);
        if (item) item.pinned = !currentPinned;
        updateUI();
      } else {
        showToast(res.message, "error");
      }
    },
    onEditItem: (item) => {
      itemModal.open(item, allTags);
    },
    onCopyUrl: async (url) => {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Enlace copiado al portapapeles");
      } catch {
        showToast("No se pudo copiar el enlace", "error");
      }
    },
  };

  if (isFiltering) {
    // Vista con filtro activo
    pinnedSection.style.display = "none";
    recentSectionTitle.textContent = `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`;
    renderItems(filtered, recentList, handlers);
  } else {
    // Vista normal: Fijados + Lo último que guardaste
    const pinnedItems = allItems.filter((i) => i.pinned);
    const unpinnedItems = allItems.filter((i) => !i.pinned);

    if (pinnedItems.length > 0) {
      pinnedSection.style.display = "block";
      renderItems(pinnedItems, pinnedList, handlers);
    } else {
      pinnedSection.style.display = "none";
    }

    recentSectionTitle.textContent = "Lo último que guardaste";
    renderItems(unpinnedItems, recentList, handlers);
  }
}

// Carga inicial de datos
async function fetchAppData() {
  const res = await loadAll();
  if (res.ok) {
    allItems = res.data.items || [];
    allTags = res.data.tags || [];
    updateUI();
  } else {
    showToast(res.message, "error");
  }
}

// Inicialización de la aplicación
async function init() {
  // Modal de agregar/editar
  const modalOverlay = document.getElementById("item-modal-overlay");
  itemModal = new ItemModal(modalOverlay, {
    showToast,
    onSave: async (payload, tagNames) => {
      const res = await saveItem(payload, tagNames);
      if (res.ok) {
        showToast("Guardado correctamente");
        // Actualizar lista local
        const idx = allItems.findIndex((i) => i.id === res.data.id);
        if (idx >= 0) {
          allItems[idx] = res.data;
        } else {
          allItems.unshift(res.data);
        }

        // Actualizar catálogo de etiquetas
        (res.data.tags || []).forEach((t) => {
          if (!allTags.some((at) => at.name.toLowerCase() === t.name.toLowerCase())) {
            allTags.push(t);
          }
        });

        updateUI();
        return true;
      } else {
        showToast(res.message, "error");
        return false;
      }
    },
    onDelete: async (itemId) => {
      const res = await deleteItem(itemId);
      if (res.ok) {
        showToast("Elemento eliminado");
        allItems = allItems.filter((i) => i.id !== itemId);
        updateUI();
      } else {
        showToast(res.message, "error");
      }
    },
  });

  // Botón guardar nuevo
  btnNewItem.addEventListener("click", () => {
    itemModal.open(null, allTags);
  });

  // Buscador interactivo
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    searchClearBtn.classList.toggle("visible", searchQuery.length > 0);
    updateUI();
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClearBtn.classList.remove("visible");
    searchInput.focus();
    updateUI();
  });

  // Atajos de teclado en PC (/ para buscar, Esc para limpiar o cerrar)
  window.addEventListener("keydown", (e) => {
    const isInputActive = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (e.key === "/" && !isInputActive) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === "Escape") {
      if (modalOverlay.classList.contains("open")) {
        itemModal.close();
      } else if (searchInput.value) {
        searchInput.value = "";
        searchQuery = "";
        searchClearBtn.classList.remove("visible");
        searchInput.blur();
        updateUI();
      }
    }
  });

  // Formulario de login
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginEmailInput.value;
    loginBtn.disabled = true;
    loginBtn.textContent = "Enviando...";
    loginMsg.textContent = "";

    const res = await sendMagicLink(email);
    loginBtn.disabled = false;
    loginBtn.textContent = "Enviarme el link";

    if (res.ok) {
      loginMsg.style.color = "var(--primary-blue)";
      loginMsg.textContent = res.message;
    } else {
      loginMsg.style.color = "var(--danger-color)";
      loginMsg.textContent = res.message;
    }
  });

  // Botón salir
  btnLogout.addEventListener("click", async () => {
    await signOut();
  });

  // Verificación de sesión con Supabase
  const { error: sessionError } = await checkInitialSession((user) => {
    if (user) {
      authView.style.display = "none";
      appView.style.display = "block";
      fetchAppData();
    } else {
      appView.style.display = "none";
      authView.style.display = "flex";
      allItems = [];
      allTags = [];
      activeTag = null;
      searchQuery = "";
    }
  });

  if (sessionError) {
    loginMsg.style.color = "var(--danger-color)";
    loginMsg.textContent = sessionError;
  }
}

// Arrancar al cargar el DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
