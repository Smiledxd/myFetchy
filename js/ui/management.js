import { escapeHTML } from "./items.js";

// Paleta institucional de 8 colores seleccionables
export const PALETTE_COLORS = [
  "#2A4A8D", // Azul David / Principal
  "#FFC50A", // Amarillo David / Acento
  "#0D9488", // Verde azulado / Teal
  "#D97706", // Ámbar / Naranja
  "#7C3AED", // Púrpura
  "#DC2626", // Rojo
  "#DB2777", // Rosa intenso
  "#0284C7", // Celeste
];

export class ManagementModal {
  constructor(overlayEl, options = {}) {
    this.overlay = overlayEl;
    this.options = options;
    this.currentView = null; // 'tags' | 'collections' | 'archived'

    this.allTags = [];
    this.allCollections = [];
    this.allItems = [];
    this.activeInlineEditId = null;
    this.activeInlineMergeId = null;

    this.initDOM();
  }

  initDOM() {
    this.modalTitle = this.overlay.querySelector("#mgmt-title");
    this.modalBody = this.overlay.querySelector("#mgmt-body");
    this.closeBtn = this.overlay.querySelector("#btn-close-mgmt");

    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }
  }

  open(view, { tags = [], collections = [], items = [] } = {}) {
    this.currentView = view;
    this.allTags = tags;
    this.allCollections = collections;
    this.allItems = items;
    this.activeInlineEditId = null;
    this.activeInlineMergeId = null;

    this.render();
    this.overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  close() {
    this.overlay.classList.remove("open");
    document.body.style.overflow = "";
    this.currentView = null;
    this.activeInlineEditId = null;
    this.activeInlineMergeId = null;
  }

  render() {
    if (this.currentView === "tags") {
      this.renderTagsView();
    } else if (this.currentView === "collections") {
      this.renderCollectionsView();
    } else if (this.currentView === "archived") {
      this.renderArchivedView();
    }
  }

  // ================= 1. PANTALLA DE ETIQUETAS =================
  renderTagsView() {
    this.modalTitle.textContent = "Gestión de Etiquetas";

    const counts = new Map();
    this.allItems.forEach((item) => {
      (item.tags || []).forEach((t) => {
        const id = t.id || t.name.toLowerCase();
        counts.set(id, (counts.get(id) || 0) + 1);
      });
    });

    if (this.allTags.length === 0) {
      this.modalBody.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">Sin etiquetas aún</p>
          <p>Al guardar un elemento con #etiqueta aparecerán aquí.</p>
        </div>
      `;
      return;
    }

    const html = `
      <div class="mgmt-list">
        ${this.allTags
          .map((t) => {
            const count = counts.get(t.id) || counts.get(t.name.toLowerCase()) || 0;
            const currentColor = t.color || "#2A4A8D";
            const isEditing = this.activeInlineEditId === t.id;
            const isMerging = this.activeInlineMergeId === t.id;
            const otherTags = this.allTags.filter((ot) => ot.id !== t.id);

            return `
            <div class="mgmt-row" data-tag-id="${t.id}" data-tag-name="${escapeHTML(t.name)}">
              <!-- Vista normal o edición de nombre inline -->
              ${
                isEditing
                  ? `
                <div class="inline-edit-box">
                  <input type="text" class="form-control inline-rename-input" value="${escapeHTML(t.name)}" autocomplete="off">
                  <div class="inline-edit-actions">
                    <button type="button" class="btn-sm btn-primary" data-action="save-inline-rename">Guardar</button>
                    <button type="button" class="btn-sm btn-secondary" data-action="cancel-inline">Cancelar</button>
                  </div>
                </div>
                <div class="inline-collision-box" style="display: none;"></div>
              `
                  : `
                <div class="mgmt-row-main">
                  <span class="mgmt-color-dot" style="background-color: ${escapeHTML(currentColor)};"></span>
                  <span class="mgmt-row-name">#${escapeHTML(t.name)}</span>
                  <span class="chip-count">${count}</span>
                </div>

                <!-- Paleta de 8 colores compacta -->
                <div class="palette-bar">
                  ${PALETTE_COLORS.map(
                    (c) => `
                    <button type="button" class="palette-swatch ${c === currentColor ? "selected" : ""}" style="background-color: ${c};" data-action="pick-color" data-color="${c}" title="Cambiar color"></button>
                  `,
                  ).join("")}
                </div>

                <div class="mgmt-row-actions">
                  <button type="button" class="btn-sm btn-secondary" data-action="start-rename-tag">
                    Renombrar
                  </button>
                  <button type="button" class="btn-sm btn-secondary" data-action="start-merge-tag">
                    Unir
                  </button>
                  <button type="button" class="btn-sm btn-delete" data-action="delete-tag" data-count="${count}">
                    Borrar
                  </button>
                </div>
              `
              }

              <!-- Vista de unión inline -->
              ${
                isMerging
                  ? `
                <div class="inline-merge-box">
                  <p style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    Unir «#${escapeHTML(t.name)}» en:
                  </p>
                  <select class="form-control inline-target-select" style="margin-bottom: 8px;">
                    ${otherTags
                      .map(
                        (ot) => `
                      <option value="${ot.id}">#${escapeHTML(ot.name)} (${counts.get(ot.id) || 0} items)</option>
                    `,
                      )
                      .join("")}
                  </select>
                  <div class="inline-edit-actions">
                    <button type="button" class="btn-sm btn-primary" data-action="confirm-merge-tag">Unir en esta</button>
                    <button type="button" class="btn-sm btn-secondary" data-action="cancel-inline">Cancelar</button>
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          `;
          })
          .join("")}
      </div>
    `;

    this.modalBody.innerHTML = html;

    // Foco automático en el input de renombrar si está activo
    if (this.activeInlineEditId) {
      const activeInput = this.modalBody.querySelector(".inline-rename-input");
      if (activeInput) {
        activeInput.focus();
        activeInput.select();
      }
    }

    this.modalBody.onclick = async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const row = btn.closest(".mgmt-row");
      const tagId = row.dataset.tagId;
      const tagName = row.dataset.tagName;
      const action = btn.dataset.action;

      if (action === "cancel-inline") {
        this.activeInlineEditId = null;
        this.activeInlineMergeId = null;
        this.renderTagsView();
      } else if (action === "start-rename-tag") {
        this.activeInlineEditId = tagId;
        this.activeInlineMergeId = null;
        this.renderTagsView();
      } else if (action === "start-merge-tag") {
        const otherTags = this.allTags.filter((ot) => ot.id !== tagId);
        if (otherTags.length === 0) {
          if (this.options.showToast) {
            this.options.showToast("No hay otras etiquetas para unir.");
          }
          return;
        }
        this.activeInlineMergeId = tagId;
        this.activeInlineEditId = null;
        this.renderTagsView();
      } else if (action === "save-inline-rename") {
        const input = row.querySelector(".inline-rename-input");
        const newName = input.value.trim();
        if (!newName || newName === tagName) {
          this.activeInlineEditId = null;
          this.renderTagsView();
          return;
        }

        if (this.options.onRenameTag) {
          btn.disabled = true;
          const res = await this.options.onRenameTag(tagId, newName);
          btn.disabled = false;

          if (res.ok) {
            this.activeInlineEditId = null;
            const found = this.allTags.find((t) => t.id === tagId);
            if (found) found.name = newName;
            this.renderTagsView();
          } else if (res.isDuplicate) {
            // Mostrar diálogo inline de unión sin confirm() nativo
            const collisionBox = row.querySelector(".inline-collision-box");
            if (collisionBox) {
              const targetTag = this.allTags.find(
                (t) => t.name.toLowerCase() === newName.toLowerCase(),
              );
              collisionBox.style.display = "block";
              collisionBox.innerHTML = `
                <div class="duplicate-alert" style="margin-top: 8px;">
                  <p>Ya tienes «${escapeHTML(newName)}». ¿Deseas unirlas?</p>
                  <div class="duplicate-actions">
                    <button type="button" class="btn-sm btn-primary" id="btn-inline-collision-merge">Unir etiquetas</button>
                    <button type="button" class="btn-sm btn-secondary" id="btn-inline-collision-cancel">Cancelar</button>
                  </div>
                </div>
              `;

              collisionBox.querySelector("#btn-inline-collision-cancel").onclick = () => {
                this.activeInlineEditId = null;
                this.renderTagsView();
              };

              collisionBox.querySelector("#btn-inline-collision-merge").onclick = async () => {
                if (targetTag && this.options.onMergeTags) {
                  // Pasar los UUIDs a mergeTags
                  const mergeRes = await this.options.onMergeTags(tagId, targetTag.id);
                  if (mergeRes.ok) {
                    this.options.reloadAll?.();
                    this.close();
                  }
                }
              };
            }
          }
        }
      } else if (action === "confirm-merge-tag") {
        const select = row.querySelector(".inline-target-select");
        const targetId = select.value;
        const targetTag = this.allTags.find((t) => t.id === targetId);

        if (targetId && targetTag && this.options.onMergeTags) {
          if (btn.classList.contains("confirming")) {
            btn.disabled = true;
            // Pasar los UUIDs
            const res = await this.options.onMergeTags(tagId, targetId);
            if (res.ok) {
              this.options.reloadAll?.();
              this.close();
            } else {
              btn.disabled = false;
              btn.classList.remove("confirming");
              btn.textContent = "Unir en esta";
            }
          } else {
            btn.classList.add("confirming");
            btn.textContent = `¿Confirmar unión en #${targetTag.name}?`;
            setTimeout(() => {
              btn.classList.remove("confirming");
              btn.textContent = "Unir en esta";
            }, 4000);
          }
        }
      } else if (action === "pick-color") {
        const color = btn.dataset.color;
        if (this.options.onUpdateTagColor) {
          const res = await this.options.onUpdateTagColor(tagId, color);
          if (res.ok) {
            const found = this.allTags.find((t) => t.id === tagId);
            if (found) found.color = color;
            this.renderTagsView();
          }
        }
      } else if (action === "delete-tag") {
        const count = btn.dataset.count;
        if (btn.classList.contains("confirming")) {
          if (this.options.onDeleteTag) {
            const res = await this.options.onDeleteTag(tagId);
            if (res.ok) {
              this.allTags = this.allTags.filter((t) => t.id !== tagId);
              this.renderTagsView();
            }
          }
        } else {
          btn.classList.add("confirming");
          btn.textContent = `Se quitará de ${count} item${count === "1" ? "" : "s"}. ¿Confirmar?`;
          setTimeout(() => {
            btn.classList.remove("confirming");
            btn.textContent = "Borrar";
          }, 4000);
        }
      }
    };
  }

  // ================= 2. PANTALLA DE COLECCIONES =================
  renderCollectionsView() {
    this.modalTitle.textContent = "Gestión de Colecciones";

    const counts = new Map();
    this.allItems.forEach((item) => {
      if (item.collection_id) {
        counts.set(item.collection_id, (counts.get(item.collection_id) || 0) + 1);
      }
    });

    const html = `
      <!-- Formulario para crear nueva colección -->
      <div class="mgmt-create-box">
        <label class="form-label">Nueva Colección</label>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="new-collection-name" class="form-control" placeholder="Nombre (ej. UTP, Trabajo...)" autocomplete="off">
          <button type="button" id="btn-create-collection" class="btn-primary" style="flex-shrink: 0;">
            Crear
          </button>
        </div>
      </div>

      <div class="mgmt-list" style="margin-top: 16px;">
        ${
          this.allCollections.length === 0
            ? '<p style="color: var(--text-muted); text-align: center; padding: 24px;">No tienes colecciones creadas.</p>'
            : this.allCollections
                .map((c) => {
                  const count = counts.get(c.id) || 0;
                  const currentColor = c.color || "#2A4A8D";
                  const isEditing = this.activeInlineEditId === c.id;

                  return `
              <div class="mgmt-row" data-collection-id="${c.id}" data-collection-name="${escapeHTML(c.name)}">
                ${
                  isEditing
                    ? `
                  <div class="inline-edit-box">
                    <input type="text" class="form-control inline-col-rename-input" value="${escapeHTML(c.name)}" autocomplete="off">
                    <div class="inline-edit-actions">
                      <button type="button" class="btn-sm btn-primary" data-action="save-col-rename">Guardar</button>
                      <button type="button" class="btn-sm btn-secondary" data-action="cancel-col-inline">Cancelar</button>
                    </div>
                  </div>
                `
                    : `
                  <div class="mgmt-row-main">
                    <span class="mgmt-color-dot" style="background-color: ${escapeHTML(currentColor)};"></span>
                    <span class="mgmt-row-name">📁 ${escapeHTML(c.name)}</span>
                    <span class="chip-count">${count} items</span>
                  </div>

                  <div class="palette-bar">
                    ${PALETTE_COLORS.map(
                      (col) => `
                      <button type="button" class="palette-swatch ${col === currentColor ? "selected" : ""}" style="background-color: ${col};" data-action="pick-collection-color" data-color="${col}" title="Cambiar color"></button>
                    `,
                    ).join("")}
                  </div>

                  <div class="mgmt-row-actions">
                    <button type="button" class="btn-sm btn-secondary" data-action="start-col-rename">
                      Renombrar
                    </button>
                    <button type="button" class="btn-sm btn-delete" data-action="delete-collection">
                      Borrar
                    </button>
                  </div>
                `
                }
              </div>
            `;
                })
                .join("")
        }
      </div>
    `;

    this.modalBody.innerHTML = html;

    if (this.activeInlineEditId) {
      const activeInput = this.modalBody.querySelector(".inline-col-rename-input");
      if (activeInput) {
        activeInput.focus();
        activeInput.select();
      }
    }

    const btnCreate = this.modalBody.querySelector("#btn-create-collection");
    const nameInput = this.modalBody.querySelector("#new-collection-name");

    btnCreate.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      if (this.options.onCreateCollection) {
        btnCreate.disabled = true;
        const res = await this.options.onCreateCollection(name);
        btnCreate.disabled = false;
        if (res.ok && res.data) {
          this.allCollections.push(res.data);
          this.renderCollectionsView();
        }
      }
    };

    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnCreate.click();
      }
    };

    this.modalBody.onclick = async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const row = btn.closest(".mgmt-row");
      const colId = row.dataset.collectionId;
      const colName = row.dataset.collectionName;
      const action = btn.dataset.action;

      if (action === "cancel-col-inline") {
        this.activeInlineEditId = null;
        this.renderCollectionsView();
      } else if (action === "start-col-rename") {
        this.activeInlineEditId = colId;
        this.renderCollectionsView();
      } else if (action === "save-col-rename") {
        const input = row.querySelector(".inline-col-rename-input");
        const newName = input.value.trim();
        if (!newName || newName === colName) {
          this.activeInlineEditId = null;
          this.renderCollectionsView();
          return;
        }

        if (this.options.onRenameCollection) {
          btn.disabled = true;
          const res = await this.options.onRenameCollection(colId, newName);
          btn.disabled = false;
          if (res.ok) {
            this.activeInlineEditId = null;
            const found = this.allCollections.find((c) => c.id === colId);
            if (found) found.name = newName;
            this.renderCollectionsView();
          }
        }
      } else if (action === "pick-collection-color") {
        const color = btn.dataset.color;
        if (this.options.onUpdateCollectionColor) {
          const res = await this.options.onUpdateCollectionColor(colId, color);
          if (res.ok) {
            const found = this.allCollections.find((c) => c.id === colId);
            if (found) found.color = color;
            this.renderCollectionsView();
          }
        }
      } else if (action === "delete-collection") {
        if (btn.classList.contains("confirming")) {
          if (this.options.onDeleteCollection) {
            const res = await this.options.onDeleteCollection(colId);
            if (res.ok) {
              this.allCollections = this.allCollections.filter((c) => c.id !== colId);
              this.allItems.forEach((i) => {
                if (i.collection_id === colId) i.collection_id = null;
              });
              this.renderCollectionsView();
            }
          }
        } else {
          btn.classList.add("confirming");
          btn.textContent = "Los items pasarán a 'Sin colección'. ¿Confirmar?";
          setTimeout(() => {
            btn.classList.remove("confirming");
            btn.textContent = "Borrar";
          }, 4000);
        }
      }
    };
  }

  // ================= 3. PANTALLA DE ARCHIVADOS =================
  renderArchivedView() {
    this.modalTitle.textContent = "Elementos Archivados";

    const archivedItems = this.allItems.filter((i) => Boolean(i.archived));

    const html = `
      <div style="margin-bottom: 14px;">
        <input type="text" id="archived-search" class="form-control" placeholder="Buscar en archivados..." autocomplete="off">
      </div>
      <div id="archived-list-container"></div>
    `;

    this.modalBody.innerHTML = html;

    const searchInput = this.modalBody.querySelector("#archived-search");
    const listContainer = this.modalBody.querySelector("#archived-list-container");

    const renderList = (query = "") => {
      let filtered = archivedItems;
      const q = query.trim().toLowerCase();
      if (q) {
        filtered = filtered.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            (i.note && i.note.toLowerCase().includes(q)) ||
            (i.url && i.url.toLowerCase().includes(q)),
        );
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state">
            <p class="empty-title">Sin elementos archivados</p>
            <p>Los elementos que archives desde la vista principal se guardan aquí.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = `
        <div class="mgmt-list">
          ${filtered
            .map(
              (i) => `
            <div class="mgmt-row" data-id="${i.id}">
              <div class="mgmt-row-main" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                <span class="mgmt-row-name" style="font-weight: 600;">${escapeHTML(i.title)}</span>
                ${i.url ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(i.url)}</span>` : ""}
              </div>
              <div class="mgmt-row-actions">
                <button type="button" class="btn-sm btn-secondary" data-action="unarchive-item">
                  Sacar del archivo
                </button>
                <button type="button" class="btn-sm btn-delete" data-action="delete-archived">
                  Borrar
                </button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      `;

      listContainer.onclick = async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const row = btn.closest(".mgmt-row");
        const itemId = row.dataset.id;
        const action = btn.dataset.action;

        if (action === "unarchive-item") {
          if (this.options.onToggleArchive) {
            const res = await this.options.onToggleArchive(itemId, true);
            if (res.ok) {
              const found = this.allItems.find((i) => i.id === itemId);
              if (found) found.archived = false;
              this.renderArchivedView();
            }
          }
        } else if (action === "delete-archived") {
          if (btn.classList.contains("confirming")) {
            if (this.options.onDelete) {
              const res = await this.options.onDelete(itemId);
              if (res.ok) {
                this.allItems = this.allItems.filter((i) => i.id !== itemId);
                this.renderArchivedView();
              }
            }
          } else {
            btn.classList.add("confirming");
            btn.textContent = "¿Borrar definitivamente?";
            setTimeout(() => {
              btn.classList.remove("confirming");
              btn.textContent = "Borrar";
            }, 3500);
          }
        }
      };
    };

    renderList();

    searchInput.oninput = () => {
      renderList(searchInput.value);
    };
  }
}
