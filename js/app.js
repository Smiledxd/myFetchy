import { checkInitialSession, sendMagicLink, signOut } from "./auth.js";
import {
  loadAll,
  saveItem,
  deleteItem,
  togglePin,
  toggleArchive,
  markOpened,
  renameTag,
  updateTagColor,
  mergeTags,
  deleteTag,
  createCollection,
  renameCollection,
  updateCollectionColor,
  deleteCollection,
} from "./data.js";
import { renderItems, renderTagChips, filterAndSortItems, escapeHTML } from "./ui/items.js";
import { ItemModal, detectTypeFromUrl } from "./ui/modal.js";
import { ManagementModal } from "./ui/management.js";

// Estado local reactivo
let allItems = [];
let allTags = [];
let allCollections = [];
let activeTag = null;
let searchQuery = "";
let collectionFilter = "todas";
let typeFilter = "todos";
let sortOrder = getSavedSortOrder();
let isOffline = !navigator.onLine;

let itemModal = null;
let mgmtModal = null;
let deferredInstallPrompt = null;

// Elementos de la interfaz
const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginBtn = document.getElementById("btn-login");
const loginMsg = document.getElementById("login-msg");

const btnMenu = document.getElementById("btn-menu");
const menuDropdown = document.getElementById("header-menu-dropdown");
const menuItemInstall = document.getElementById("menu-item-install");
const btnLogout = document.getElementById("btn-logout");
const btnNewItem = document.getElementById("btn-new-item");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const tagChipsWrap = document.getElementById("tag-chips-wrap");
const offlineBanner = document.getElementById("offline-banner");

const filterCollectionSelect = document.getElementById("filter-collection");
const filterTypeSelect = document.getElementById("filter-type");
const filterSortSelect = document.getElementById("filter-sort");

const pinnedSection = document.getElementById("pinned-section");
const pinnedList = document.getElementById("pinned-list");
const recentSectionTitle = document.getElementById("recent-section-title");
const recentList = document.getElementById("recent-list");
const toastContainer = document.getElementById("toast-container");

// Manejo seguro de memoria en localStorage para el orden
function getSavedSortOrder() {
  try {
    return localStorage.getItem("myfetchy_sort_order") || "recientes";
  } catch {
    return "recientes";
  }
}

function saveSortOrder(order) {
  try {
    localStorage.setItem("myfetchy_sort_order", order);
  } catch (err) {
    console.warn("No se pudo guardar la preferencia en localStorage:", err);
  }
}

// Sistema de Notificaciones Toast con soporte para botones de acción
export function showToast(message, type = "info", action = null) {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (action && action.text && action.onClick) {
    const actionBtn = document.createElement("button");
    actionBtn.className = "toast-btn";
    actionBtn.textContent = action.text;
    actionBtn.onclick = () => {
      action.onClick();
      toast.remove();
    };
    toast.appendChild(actionBtn);
  }

  toastContainer.appendChild(toast);

  const duration = action ? 8000 : 3500;
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Control del estado visual de Modo Sin Conexión
function setOfflineMode(offline) {
  isOffline = offline;
  if (offlineBanner) {
    offlineBanner.style.display = offline ? "flex" : "none";
  }
  document.body.classList.toggle("offline-mode", offline);
  if (btnNewItem) {
    btnNewItem.disabled = offline;
  }
}

// Calcular conteo y color de etiquetas solo para items no archivados
function getTagsWithCount(items, tags) {
  const counts = new Map();
  items
    .filter((i) => !i.archived)
    .forEach((item) => {
      (item.tags || []).forEach((t) => {
        const lower = t.name.toLowerCase();
        counts.set(lower, (counts.get(lower) || 0) + 1);
      });
    });

  const tagsColorMap = new Map();
  tags.forEach((t) => {
    tagsColorMap.set(t.name.toLowerCase(), { name: t.name, color: t.color });
  });

  const list = [];
  counts.forEach((count, lowerName) => {
    const meta = tagsColorMap.get(lowerName);
    list.push({
      name: meta ? meta.name : lowerName,
      count,
      color: meta ? meta.color : "#2A4A8D",
    });
  });

  return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Actualizar opciones en el selector de colecciones de la barra de filtros
function updateFilterBarCollections() {
  if (!filterCollectionSelect) return;
  const currentVal = filterCollectionSelect.value;
  const options = [
    '<option value="todas">📁 Todas las colecciones</option>',
    '<option value="sin-coleccion">Sin colección</option>',
    ...allCollections.map((c) => `<option value="${c.id}">📁 ${escapeHTML(c.name)}</option>`),
  ];
  filterCollectionSelect.innerHTML = options.join("");
  if (
    allCollections.some((c) => c.id === currentVal) ||
    ["todas", "sin-coleccion"].includes(currentVal)
  ) {
    filterCollectionSelect.value = currentVal;
  } else {
    filterCollectionSelect.value = "todas";
    collectionFilter = "todas";
  }
}

// Renderizado principal
function updateUI() {
  const filtered = filterAndSortItems(allItems, {
    searchQuery,
    activeTag,
    collectionFilter,
    typeFilter,
    sortOrder,
    showArchived: false,
  });

  const isFiltering = Boolean(
    searchQuery.trim() || activeTag || collectionFilter !== "todas" || typeFilter !== "todos",
  );

  // Renderizar chips de etiquetas
  const tagsWithCount = getTagsWithCount(allItems, allTags);
  renderTagChips(tagsWithCount, activeTag, tagChipsWrap, (selectedTag) => {
    activeTag = selectedTag;
    updateUI();
  });

  const handlers = {
    onOpenLink: (id) => markOpened(id),
    onTogglePin: async (id, currentPinned) => {
      if (isOffline) {
        showToast("No disponible sin conexión.", "error");
        return;
      }
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
      if (isOffline) {
        showToast("No se puede editar sin conexión.", "error");
        return;
      }
      itemModal.open(item, allTags, allCollections, allItems);
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
    pinnedSection.style.display = "none";
    recentSectionTitle.textContent = `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`;
    renderItems(filtered, recentList, handlers, allCollections);
  } else {
    const pinnedItems = filtered.filter((i) => i.pinned);
    const unpinnedItems = filtered.filter((i) => !i.pinned);

    if (pinnedItems.length > 0) {
      pinnedSection.style.display = "block";
      renderItems(pinnedItems, pinnedList, handlers, allCollections);
    } else {
      pinnedSection.style.display = "none";
    }

    recentSectionTitle.textContent = "Lo último que guardaste";
    renderItems(unpinnedItems, recentList, handlers, allCollections);
  }
}

// Carga inicial y recarga completa de datos
async function fetchAppData() {
  const res = await loadAll();
  if (res.ok) {
    allItems = res.data.items || [];
    allTags = res.data.tags || [];
    allCollections = res.data.collections || [];

    setOfflineMode(Boolean(res.isOffline));
    updateFilterBarCollections();
    updateUI();
  } else {
    setOfflineMode(true);
    showToast(res.message, "error");
  }
}

// Procesar datos compartidos desde Android vía share_target
function checkAndroidShareTarget() {
  if (!window.location.search) return null;

  const params = new URLSearchParams(window.location.search);
  const rawUrl = params.get("url");
  const rawText = params.get("text");
  const rawTitle = params.get("title");

  if (!rawUrl && !rawText && !rawTitle) return null;

  let targetUrl = rawUrl ? rawUrl.trim() : null;
  let targetTitle = rawTitle ? rawTitle.trim() : "";
  let note = "";

  // Si url vino vacía, buscar el primer http(s):// dentro de text
  if (!targetUrl && rawText) {
    const urlMatch = rawText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      targetUrl = urlMatch[0];
      const remaining = rawText.replace(urlMatch[0], "").trim();
      if (!targetTitle) {
        targetTitle = remaining;
      } else {
        note = remaining;
      }
    } else {
      if (!targetTitle) targetTitle = rawText.slice(0, 40);
      note = rawText;
    }
  }

  // Limpiar URL inmediatamente
  window.history.replaceState(
    {},
    document.title,
    window.location.origin + window.location.pathname,
  );

  return { url: targetUrl, title: targetTitle, note };
}

// Abrir formulario con datos compartidos
function handleSharedData(shareData) {
  if (!shareData) return;
  const detectedType = detectTypeFromUrl(shareData.url);
  itemModal.open(
    {
      url: shareData.url,
      title: shareData.title,
      note: shareData.note,
      type: detectedType,
    },
    allTags,
    allCollections,
    allItems,
  );
}

// Registro del Service Worker y detección de actualizaciones
function setupServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        if (reg.waiting) {
          notifyWorkerUpdate(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                notifyWorkerUpdate(newWorker);
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("Fallo registrando Service Worker:", err);
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

function notifyWorkerUpdate(worker) {
  // Verificar que el usuario no esté en medio de editar o escribir
  const modalOpen = document.querySelector(".modal-overlay.open");
  if (modalOpen) return;

  showToast("Hay una versión nueva de myFetchy.", "info", {
    text: "Actualizar",
    onClick: () => {
      worker.postMessage({ type: "SKIP_WAITING" });
    },
  });
}

// Inicialización de la aplicación
async function init() {
  if (filterSortSelect) {
    filterSortSelect.value = sortOrder;
  }

  // Inicializar Service Worker
  setupServiceWorker();

  // Escucha de conexión Online / Offline
  window.addEventListener("online", () => {
    setOfflineMode(false);
    showToast("Conexión restablecida.");
    fetchAppData();
  });

  window.addEventListener("offline", () => {
    setOfflineMode(true);
    showToast("Sin conexión. Estás en modo lectura.", "error");
  });

  // Capturar evento de instalación de PWA
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (menuItemInstall) menuItemInstall.style.display = "flex";
  });

  if (menuItemInstall) {
    menuItemInstall.addEventListener("click", async () => {
      menuDropdown.classList.remove("open");
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === "accepted") {
          menuItemInstall.style.display = "none";
        }
        deferredInstallPrompt = null;
      }
    });
  }

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (menuItemInstall) menuItemInstall.style.display = "none";
    showToast("myFetchy se instaló correctamente.");
  });

  // Extraer datos compartidos de Android
  const sharedFromAndroid = checkAndroidShareTarget();

  // Inicializar Modal de Gestión (Etiquetas, Colecciones, Archivados)
  const mgmtOverlay = document.getElementById("mgmt-modal-overlay");
  mgmtModal = new ManagementModal(mgmtOverlay, {
    showToast,
    reloadAll: fetchAppData,
    onUpdateTagColor: async (id, color) => {
      const res = await updateTagColor(id, color);
      if (res.ok) {
        showToast("Color actualizado");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onRenameTag: async (id, newName) => {
      const res = await renameTag(id, newName);
      if (res.ok) {
        showToast("Etiqueta renombrada");
        fetchAppData();
      } else if (!res.isDuplicate) {
        showToast(res.message, "error");
      }
      return res;
    },
    onMergeTags: async (sourceId, targetId) => {
      // Pasar UUIDs a data.js
      const res = await mergeTags(sourceId, targetId);
      if (res.ok) {
        showToast("Etiquetas unidas exitosamente");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onDeleteTag: async (id) => {
      const res = await deleteTag(id);
      if (res.ok) {
        showToast("Etiqueta eliminada");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onCreateCollection: async (name) => {
      const res = await createCollection(name);
      if (res.ok) {
        showToast("Colección creada");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onRenameCollection: async (id, newName) => {
      const res = await renameCollection(id, newName);
      if (res.ok) {
        showToast("Colección renombrada");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onUpdateCollectionColor: async (id, color) => {
      const res = await updateCollectionColor(id, color);
      if (res.ok) {
        showToast("Color de colección actualizado");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onDeleteCollection: async (id) => {
      const res = await deleteCollection(id);
      if (res.ok) {
        showToast("Colección eliminada");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onToggleArchive: async (id, currentArchived) => {
      const res = await toggleArchive(id, currentArchived);
      if (res.ok) {
        showToast(currentArchived ? "Elemento restaurado" : "Elemento archivado");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onDelete: async (id) => {
      const res = await deleteItem(id);
      if (res.ok) {
        showToast("Elemento eliminado");
        fetchAppData();
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
  });

  // Inicializar Modal de Guardar / Editar Item
  const modalOverlay = document.getElementById("item-modal-overlay");
  itemModal = new ItemModal(modalOverlay, {
    showToast,
    onCreateCollection: async (name) => {
      const res = await createCollection(name);
      if (res.ok && res.data) {
        allCollections.push(res.data);
        updateFilterBarCollections();
        showToast("Colección creada");
      } else {
        showToast(res.message, "error");
      }
      return res;
    },
    onViewItem: (existingItem) => {
      itemModal.open(existingItem, allTags, allCollections, allItems);
    },
    onToggleArchive: async (id, currentArchived) => {
      const res = await toggleArchive(id, currentArchived);
      if (res.ok) {
        showToast(currentArchived ? "Elemento restaurado" : "Elemento archivado");
        const found = allItems.find((i) => i.id === id);
        if (found) found.archived = !currentArchived;
        updateUI();
        return true;
      } else {
        showToast(res.message, "error");
        return false;
      }
    },
    onSave: async (payload, tagNames) => {
      const res = await saveItem(payload, tagNames);
      if (res.ok) {
        showToast("Guardado correctamente");
        const idx = allItems.findIndex((i) => i.id === res.data.id);
        if (idx >= 0) {
          allItems[idx] = res.data;
        } else {
          allItems.unshift(res.data);
        }
        await fetchAppData();
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

  btnNewItem.addEventListener("click", () => {
    if (isOffline) {
      showToast("No disponible sin conexión.", "error");
      return;
    }
    itemModal.open(null, allTags, allCollections, allItems);
  });

  btnMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!menuDropdown.contains(e.target) && e.target !== btnMenu) {
      menuDropdown.classList.remove("open");
    }
  });

  menuDropdown.querySelectorAll("[data-mgmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.mgmt;
      menuDropdown.classList.remove("open");
      mgmtModal.open(view, {
        tags: allTags,
        collections: allCollections,
        items: allItems,
      });
    });
  });

  filterCollectionSelect.addEventListener("change", () => {
    collectionFilter = filterCollectionSelect.value;
    updateUI();
  });

  filterTypeSelect.addEventListener("change", () => {
    typeFilter = filterTypeSelect.value;
    updateUI();
  });

  filterSortSelect.addEventListener("change", () => {
    sortOrder = filterSortSelect.value;
    saveSortOrder(sortOrder);
    updateUI();
  });

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

  window.addEventListener("keydown", (e) => {
    const isInputActive = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);

    if (e.key === "/" && !isInputActive) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === "Escape") {
      if (menuDropdown.classList.contains("open")) {
        menuDropdown.classList.remove("open");
      } else if (modalOverlay.classList.contains("open")) {
        itemModal.close();
      } else if (mgmtOverlay.classList.contains("open")) {
        mgmtModal.close();
      } else if (searchInput.value) {
        searchInput.value = "";
        searchQuery = "";
        searchClearBtn.classList.remove("visible");
        searchInput.blur();
        updateUI();
      }
    }
  });

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

  btnLogout.addEventListener("click", async () => {
    menuDropdown.classList.remove("open");
    await signOut();
  });

  // Verificación de sesión con Supabase
  const { error: sessionError } = await checkInitialSession((user) => {
    if (user) {
      authView.style.display = "none";
      appView.style.display = "block";
      fetchAppData().then(() => {
        // Si había un share pendiente de Android antes del login
        try {
          const pending = sessionStorage.getItem("myfetchy_pending_share");
          if (pending) {
            sessionStorage.removeItem("myfetchy_pending_share");
            handleSharedData(JSON.parse(pending));
            return;
          }
        } catch (e) {
          console.warn("Error leyendo share pendiente:", e);
        }

        // Si se compartió directo con sesión activa
        if (sharedFromAndroid) {
          handleSharedData(sharedFromAndroid);
        }
      });
    } else {
      appView.style.display = "none";
      authView.style.display = "flex";
      allItems = [];
      allTags = [];
      allCollections = [];
      activeTag = null;
      searchQuery = "";
      collectionFilter = "todas";
      typeFilter = "todos";

      // Si se compartió sin sesión, guardar en sessionStorage
      if (sharedFromAndroid) {
        try {
          sessionStorage.setItem("myfetchy_pending_share", JSON.stringify(sharedFromAndroid));
          showToast("Inicia sesión para guardar el enlace compartido.");
        } catch (e) {
          console.warn("Error guardando share pendiente:", e);
        }
      }
    }
  });

  if (sessionError) {
    loginMsg.style.color = "var(--danger-color)";
    loginMsg.textContent = sessionError;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
