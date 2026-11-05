import { escapeHTML } from "./items.js";

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

// Generador de título sugerido a partir de la URL
export function suggestTitleFromUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
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
    this.deleteConfirmStep = 0;
    this.deleteTimer = null;

    this.initDOMElements();
    this.bindEvents();
  }

  initDOMElements() {
    this.titleEl = this.overlay.querySelector("#modal-title");
    this.urlInput = this.overlay.querySelector("#item-url");
    this.titleInput = this.overlay.querySelector("#item-title");
    this.noteInput = this.overlay.querySelector("#item-note");
    this.typeButtons = this.overlay.querySelectorAll(".type-btn");
    this.tagInput = this.overlay.querySelector("#item-tag-input");
    this.selectedTagsWrap = this.overlay.querySelector("#selected-tags-wrap");
    this.suggestedTagsWrap = this.overlay.querySelector("#suggested-tags-wrap");
    this.saveBtn = this.overlay.querySelector("#btn-save-item");
    this.deleteBtn = this.overlay.querySelector("#btn-delete-item");
    this.closeBtn = this.overlay.querySelector("#btn-close-modal");

    this.currentType = "link";
  }

  bindEvents() {
    // Cerrar al tocar fuera o presionar escape
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }

    // Cambio de tipo manual
    this.typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setType(btn.dataset.type);
      });
    });

    // Auto-detección al escribir o pegar URL
    this.urlInput.addEventListener("input", () => {
      const url = this.urlInput.value.trim();
      const detected = detectTypeFromUrl(url);
      this.setType(detected);

      // Sugerir título si está vacío
      if (!this.titleInput.value.trim()) {
        const suggested = suggestTitleFromUrl(url);
        if (suggested) {
          this.titleInput.value = suggested;
        }
      }
    });

    // Entrada de etiquetas con Enter o Coma
    this.tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        this.addTagFromInput();
      } else if (e.key === "Backspace" && !this.tagInput.value && this.selectedTags.size > 0) {
        // Quitar la última etiqueta
        const tagsArr = Array.from(this.selectedTags);
        const lastTag = tagsArr[tagsArr.length - 1];
        this.removeTag(lastTag);
      }
    });

    // Guardar
    this.saveBtn.addEventListener("click", () => this.handleSave());

    // Borrar con confirmación de dos toques
    this.deleteBtn.addEventListener("click", () => this.handleDeleteClick());
  }

  setType(type) {
    this.currentType = type;
    this.typeButtons.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.type === type);
    });
  }

  addTag(tagName) {
    const clean = (tagName || "").replace(/^#/, "").trim().toLowerCase();
    if (clean && !this.selectedTags.has(clean)) {
      this.selectedTags.add(clean);
      this.renderTags();
    }
  }

  removeTag(tagName) {
    this.selectedTags.delete(tagName);
    this.renderTags();
  }

  addTagFromInput() {
    const val = this.tagInput.value.trim();
    if (val) {
      // Soportar valores separados por coma
      val.split(",").forEach((t) => this.addTag(t));
      this.tagInput.value = "";
    }
  }

  renderTags() {
    // Renderizar tags seleccionados
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

    // Renderizar tags sugeridos no seleccionados
    const availableUnselected = (this.availableTags || [])
      .filter((t) => !this.selectedTags.has(t.name.toLowerCase()))
      .slice(0, 10);

    if (availableUnselected.length > 0) {
      this.suggestedTagsWrap.innerHTML = `
        <span style="font-size: 0.75rem; color: var(--text-muted); width: 100%; display: block; margin-top: 4px;">Sugerencias:</span>
        ${availableUnselected
          .map(
            (t) => `
          <button type="button" class="chip" style="font-size: 0.75rem; padding: 2px 8px;" data-suggest="${escapeHTML(t.name)}">
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

  open(item = null, availableTags = []) {
    this.currentItem = item;
    this.availableTags = availableTags;
    this.selectedTags.clear();
    this.resetDeleteState();

    if (item) {
      this.titleEl.textContent = "Editar elemento";
      this.urlInput.value = item.url || "";
      this.titleInput.value = item.title || "";
      this.noteInput.value = item.note || "";
      this.setType(item.type || "link");

      (item.tags || []).forEach((t) => this.addTag(t.name));
      this.deleteBtn.style.display = "inline-flex";
    } else {
      this.titleEl.textContent = "Guardar nuevo";
      this.urlInput.value = "";
      this.titleInput.value = "";
      this.noteInput.value = "";
      this.setType("link");
      this.deleteBtn.style.display = "none";
    }

    this.renderTags();
    this.overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    // Foco inicial
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

      // Volver a estado normal tras 4 segundos
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

  async handleSave() {
    // Asegurar tags pendientes en input
    this.addTagFromInput();

    const url = this.urlInput.value.trim();
    let title = this.titleInput.value.trim();
    const note = this.noteInput.value.trim();

    if (!title && url) {
      title = suggestTitleFromUrl(url);
    }

    if (!title && !note) {
      this.titleInput.focus();
      if (this.options.showToast) {
        this.options.showToast("Ingresa un título, nota o enlace para guardar.", "error");
      }
      return;
    }

    const payload = {
      id: this.currentItem ? this.currentItem.id : null,
      title: title || "Sin título",
      url: url || null,
      note: note || null,
      type: this.currentType,
      pinned: this.currentItem ? this.currentItem.pinned : false,
      collection_id: this.currentItem ? this.currentItem.collection_id : null,
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
