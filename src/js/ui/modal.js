import { escapeHTML, isSafeUrl } from "./items.js";

// Auto-detección de tipo según la URL
export function detectTypeFromUrl(url) {
  const trimmed = (url || "").trim().toLowerCase();
  if (!trimmed) return "apunte";
  if (trimmed.includes("claude.ai/artifact") || trimmed.includes("claude.site")) {
    return "pagina";
  }
  if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
    return "archivo";
  }
  return "link";
}

// Normalización canónica para detectar duplicados (ignora www, trailing slash, mayúsculas y utm_*)
export function canonicalizeUrl(url) {
  if (!url) return "";
  let trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";

    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
    ];

    for (const key of Array.from(searchParams.keys())) {
      if (trackingParams.includes(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        searchParams.delete(key);
      }
    }

    const query = searchParams.toString();
    return `${host}${pathname}${query ? "?" + query : ""}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

// Formatear URL para guardar asegurando https:// si falta protocolo
export function formatUrlForSave(url) {
  if (!url) return null;
  let trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }
  return trimmed;
}

// Generador de título sugerido a partir de la URL
export function suggestTitleFromUrl(url) {
  if (!url) return "";
  const formatted = formatUrlForSave(url);
  try {
    const parsed = new URL(formatted);
    const domain = parsed.hostname.replace(/^www\./i, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPart =
      pathParts.length > 0 ? decodeURIComponent(pathParts[pathParts.length - 1]) : "";
    if (lastPart) {
      return `${domain} / ${lastPart}`;
    }
    return domain;
  } catch {
    return "";
  }
}

export class ItemModal {
  constructor(overlayEl, options = {}) {
    this.overlay = overlayEl;
    this.options = options;
    this.currentItem = null;
    this.selectedTags = new Set();
    this.availableTags = [];
    this.availableCollections = [];
    this.existingItems = [];
    this.deleteConfirmStep = 0;
    this.deleteTimer = null;
    this.duplicateWarningItem = null;

    this.initDOMElements();
    this.bindEvents();
  }

  initDOMElements() {
    this.titleEl = this.overlay.querySelector("#modal-title");
    this.urlInput = this.overlay.querySelector("#item-url");
    this.titleInput = this.overlay.querySelector("#item-title");
    this.noteInput = this.overlay.querySelector("#item-note");
    this.collectionSelect = this.overlay.querySelector("#item-collection");
    this.typeButtons = this.overlay.querySelectorAll(".type-btn");
    this.tagInput = this.overlay.querySelector("#item-tag-input");
    this.selectedTagsWrap = this.overlay.querySelector("#selected-tags-wrap");
    this.suggestedTagsWrap = this.overlay.querySelector("#suggested-tags-wrap");
    this.saveBtn = this.overlay.querySelector("#btn-save-item");
    this.deleteBtn = this.overlay.querySelector("#btn-delete-item");
    this.archiveBtn = this.overlay.querySelector("#btn-archive-item");
    this.closeBtn = this.overlay.querySelector("#btn-close-modal");
    this.duplicateNotice = this.overlay.querySelector("#duplicate-notice");
    this.inlineNewColBox = this.overlay.querySelector("#inline-new-col-box");
    this.inlineNewColInput = this.overlay.querySelector("#inline-new-col-input");
    this.btnSaveInlineCol = this.overlay.querySelector("#btn-save-inline-col");
    this.btnCancelInlineCol = this.overlay.querySelector("#btn-cancel-inline-col");

    this.currentType = "link";
  }

  bindEvents() {
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }

    this.typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setType(btn.dataset.type);
      });
    });

    // Auto-detección y sugerencia al escribir URL
    this.urlInput.addEventListener("input", () => {
      const url = this.urlInput.value.trim();
      const detected = detectTypeFromUrl(url);
      this.setType(detected);

      if (!this.titleInput.value.trim()) {
        const suggested = suggestTitleFromUrl(url);
        if (suggested) {
          this.titleInput.value = suggested;
        }
      }

      this.checkForDuplicates();
    });

    // Selector de colección (incluyendo + Nueva colección inline)
    if (this.collectionSelect) {
      this.collectionSelect.addEventListener("change", () => {
        if (this.collectionSelect.value === "__new__") {
          this.showInlineNewCollection();
        } else if (this.inlineNewColBox) {
          this.inlineNewColBox.style.display = "none";
        }
      });
    }

    if (this.btnSaveInlineCol) {
      this.btnSaveInlineCol.addEventListener("click", () => this.handleSaveInlineCollection());
    }

    if (this.btnCancelInlineCol) {
      this.btnCancelInlineCol.addEventListener("click", () => this.hideInlineNewCollection());
    }

    if (this.inlineNewColInput) {
      this.inlineNewColInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleSaveInlineCollection();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.hideInlineNewCollection();
        }
      });
    }

    this.tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        this.addTagFromInput();
      } else if (e.key === "Backspace" && !this.tagInput.value && this.selectedTags.size > 0) {
        const tagsArr = Array.from(this.selectedTags);
        const lastTag = tagsArr[tagsArr.length - 1];
        this.removeTag(lastTag);
      }
    });

    this.saveBtn.addEventListener("click", () => this.handleSave());
    this.deleteBtn.addEventListener("click", () => this.handleDeleteClick());

    if (this.archiveBtn) {
      this.archiveBtn.addEventListener("click", () => this.handleArchiveClick());
    }
  }

  checkForDuplicates() {
    if (!this.duplicateNotice) return;
    const rawUrl = this.urlInput.value.trim();
    if (!rawUrl) {
      this.duplicateNotice.style.display = "none";
      this.duplicateWarningItem = null;
      return;
    }

    const canon = canonicalizeUrl(rawUrl);
    const found = (this.existingItems || []).find((i) => {
      if (this.currentItem && i.id === this.currentItem.id) return false;
      return i.url && canonicalizeUrl(i.url) === canon;
    });

    if (found) {
      this.duplicateWarningItem = found;
      this.duplicateNotice.style.display = "block";
      this.duplicateNotice.innerHTML = `
        <div class="duplicate-alert">
          <p>Ya guardaste este link como <strong>«${escapeHTML(found.title)}»</strong></p>
          <div class="duplicate-actions">
            <button type="button" class="btn-sm btn-secondary" id="btn-view-duplicate">Ver el que tengo</button>
            <button type="button" class="btn-sm btn-primary" id="btn-dismiss-duplicate">Guardar igual</button>
          </div>
        </div>
      `;

      this.duplicateNotice.querySelector("#btn-view-duplicate").onclick = () => {
        this.close();
        if (this.options.onViewItem) {
          this.options.onViewItem(found);
        }
      };

      this.duplicateNotice.querySelector("#btn-dismiss-duplicate").onclick = () => {
        this.duplicateNotice.style.display = "none";
        this.duplicateWarningItem = null;
      };
    } else {
      this.duplicateNotice.style.display = "none";
      this.duplicateWarningItem = null;
    }
  }

  setType(type) {
    this.currentType = type;
    this.typeButtons.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.type === type);
    });
  }

  addTag(tagName) {
    const clean = (tagName || "").replace(/^#/, "").trim();
    if (clean) {
      // Verificar si ya existe en selectedTags de forma insensible a mayúsculas
      let exists = false;
      for (const t of this.selectedTags) {
        if (t.toLowerCase() === clean.toLowerCase()) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        this.selectedTags.add(clean);
        this.renderTags();
      }
    }
  }

  removeTag(tagName) {
    for (const t of this.selectedTags) {
      if (t.toLowerCase() === tagName.toLowerCase()) {
        this.selectedTags.delete(t);
        break;
      }
    }
    this.renderTags();
  }

  addTagFromInput() {
    const val = this.tagInput.value.trim();
    if (val) {
      val.split(",").forEach((t) => this.addTag(t));
      this.tagInput.value = "";
    }
  }

  renderTags() {
    const selectedHtml = Array.from(this.selectedTags)
      .map(
        (tag) => `
      <span class="selected-tag-item">
        #${escapeHTML(tag)}
        <button type="button" data-tag="${escapeHTML(tag)}">&times;</button>
      </span>
    `,
      )
      .join("");

    this.selectedTagsWrap.innerHTML = selectedHtml;

    this.selectedTagsWrap.querySelectorAll("button").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        this.removeTag(b.dataset.tag);
      };
    });

    const selectedLower = new Set(Array.from(this.selectedTags).map((t) => t.toLowerCase()));
    const availableUnselected = (this.availableTags || [])
      .filter((t) => !selectedLower.has(t.name.toLowerCase()))
      .slice(0, 10);

    if (availableUnselected.length > 0) {
      this.suggestedTagsWrap.innerHTML = `
        <span style="font-size: 0.75rem; color: var(--text-muted); width: 100%; display: block; margin-top: 4px;">Sugerencias:</span>
        ${availableUnselected
          .map(
            (t) => `
          <button type="button" class="chip" style="font-size: 0.75rem; padding: 2px 8px; border-color: ${escapeHTML(t.color || "var(--border-color)")};" data-suggest="${escapeHTML(t.name)}">
            + #${escapeHTML(t.name)}
          </button>
        `,
          )
          .join("")}
      `;

      this.suggestedTagsWrap.querySelectorAll("[data-suggest]").forEach((b) => {
        b.onclick = () => {
          this.addTag(b.dataset.suggest);
        };
      });
    } else {
      this.suggestedTagsWrap.innerHTML = "";
    }
  }

  renderCollections(selectedId = null) {
    if (!this.collectionSelect) return;
    const options = [
      '<option value="">Sin colección</option>',
      ...this.availableCollections.map(
        (c) =>
          `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>📁 ${escapeHTML(c.name)}</option>`,
      ),
      '<option value="__new__">+ Nueva colección...</option>',
    ];
    this.collectionSelect.innerHTML = options.join("");
  }

  showInlineNewCollection() {
    if (!this.inlineNewColBox) return;
    this.inlineNewColBox.style.display = "block";
    if (this.inlineNewColInput) {
      this.inlineNewColInput.value = "";
      this.inlineNewColInput.focus();
    }
  }

  hideInlineNewCollection() {
    if (this.inlineNewColBox) {
      this.inlineNewColBox.style.display = "none";
    }
    if (this.collectionSelect) {
      this.collectionSelect.value = "";
    }
  }

  async handleSaveInlineCollection() {
    if (!this.inlineNewColInput) return;
    const name = this.inlineNewColInput.value.trim();
    if (!name) {
      this.inlineNewColInput.focus();
      return;
    }

    if (this.options.onCreateCollection) {
      if (this.btnSaveInlineCol) this.btnSaveInlineCol.disabled = true;
      const res = await this.options.onCreateCollection(name);
      if (this.btnSaveInlineCol) this.btnSaveInlineCol.disabled = false;

      if (res.ok && res.data) {
        this.availableCollections.push(res.data);
        this.renderCollections(res.data.id);
        if (this.inlineNewColBox) this.inlineNewColBox.style.display = "none";
      }
    }
  }

  open(item = null, availableTags = [], availableCollections = [], existingItems = []) {
    this.currentItem = item;
    this.availableTags = availableTags;
    this.availableCollections = availableCollections;
    this.existingItems = existingItems;
    this.selectedTags.clear();
    this.resetDeleteState();
    if (this.duplicateNotice) this.duplicateNotice.style.display = "none";
    if (this.inlineNewColBox) this.inlineNewColBox.style.display = "none";

    this.renderCollections(item ? item.collection_id : null);

    if (item) {
      this.titleEl.textContent = "Editar elemento";
      this.urlInput.value = item.url || "";
      this.titleInput.value = item.title || "";
      this.noteInput.value = item.note || "";
      this.setType(item.type || "link");

      (item.tags || []).forEach((t) => this.addTag(t.name));
      this.deleteBtn.style.display = "inline-flex";

      if (this.archiveBtn) {
        this.archiveBtn.style.display = "inline-flex";
        this.archiveBtn.textContent = item.archived ? "Sacar del archivo" : "Archivar";
      }
    } else {
      this.titleEl.textContent = "Guardar nuevo";
      this.urlInput.value = "";
      this.titleInput.value = "";
      this.noteInput.value = "";
      this.setType("link");
      this.deleteBtn.style.display = "none";
      if (this.archiveBtn) this.archiveBtn.style.display = "none";
    }

    this.renderTags();
    this.overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      if (item) {
        this.titleInput.focus();
      } else {
        this.urlInput.focus();
      }
    }, 100);
  }

  close() {
    this.overlay.classList.remove("open");
    document.body.style.overflow = "";
    this.resetDeleteState();
    this.currentItem = null;
    this.duplicateWarningItem = null;
    if (this.duplicateNotice) this.duplicateNotice.style.display = "none";
    if (this.inlineNewColBox) this.inlineNewColBox.style.display = "none";
  }

  resetDeleteState() {
    this.deleteConfirmStep = 0;
    if (this.deleteTimer) clearTimeout(this.deleteTimer);
    this.deleteBtn.textContent = "Borrar";
    this.deleteBtn.classList.remove("confirming");
  }

  handleDeleteClick() {
    if (this.deleteConfirmStep === 0) {
      this.deleteConfirmStep = 1;
      this.deleteBtn.textContent = "¿Confirmar borrado?";
      this.deleteBtn.classList.add("confirming");

      this.deleteTimer = setTimeout(() => {
        this.resetDeleteState();
      }, 4000);
    } else if (this.deleteConfirmStep === 1) {
      if (this.deleteTimer) clearTimeout(this.deleteTimer);
      if (this.options.onDelete && this.currentItem) {
        this.options.onDelete(this.currentItem.id);
      }
      this.close();
    }
  }

  async handleArchiveClick() {
    if (!this.currentItem) return;
    if (this.options.onToggleArchive) {
      const ok = await this.options.onToggleArchive(this.currentItem.id, this.currentItem.archived);
      if (ok) {
        this.close();
      }
    }
  }

  async handleSave() {
    this.addTagFromInput();

    let rawUrl = this.urlInput.value.trim();
    let formattedUrl = null;

    if (rawUrl) {
      formattedUrl = formatUrlForSave(rawUrl);
      if (!isSafeUrl(formattedUrl)) {
        this.urlInput.focus();
        if (this.options.showToast) {
          this.options.showToast(
            "Ingresa un enlace válido que inicie con https:// o http://",
            "error",
          );
        }
        return;
      }
    }

    let title = this.titleInput.value.trim();
    const note = this.noteInput.value.trim();

    if (!title && formattedUrl) {
      title = suggestTitleFromUrl(formattedUrl);
    }

    if (!title && !note) {
      this.titleInput.focus();
      if (this.options.showToast) {
        this.options.showToast("Ingresa un título, nota o enlace para guardar.", "error");
      }
      return;
    }

    const colVal = this.collectionSelect ? this.collectionSelect.value : null;

    const payload = {
      id: this.currentItem ? this.currentItem.id : null,
      title: title || "Sin título",
      url: formattedUrl,
      note: note, // note se envía siempre limpia
      type: this.currentType,
      pinned: this.currentItem ? this.currentItem.pinned : false,
      collection_id: colVal && colVal !== "__new__" ? colVal : null,
    };

    const tagNames = Array.from(this.selectedTags);

    this.saveBtn.disabled = true;
    this.saveBtn.textContent = "Guardando...";

    if (this.options.onSave) {
      const ok = await this.options.onSave(payload, tagNames);
      if (ok) {
        this.close();
      }
    }

    this.saveBtn.disabled = false;
    this.saveBtn.textContent = "Guardar";
  }
}
