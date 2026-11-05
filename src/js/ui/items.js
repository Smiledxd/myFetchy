// Utilidad estricta para escapar HTML y prevenir XSS
export function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Normalización para búsqueda sin tildes ni mayúsculas
export function normalizeText(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Validación de links seguros (solo http y https)
export function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Extraer dominio limpio
export function extractDomain(url) {
  if (!isSafeUrl(url)) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Formato de fecha relativo o corto
export function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

// Renderizar la lista de items
export function renderItems(items, containerEl, handlers = {}, collections = []) {
  if (!containerEl) return;

  if (!items || items.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">No hay elementos para mostrar</p>
        <p>Prueba ajustando los filtros o guarda un nuevo elemento.</p>
      </div>
    `;
    return;
  }

  const collectionsMap = new Map();
  for (const c of collections) {
    collectionsMap.set(c.id, c);
  }

  const html = items
    .map((item) => {
      const domain = extractDomain(item.url);
      // Corrección: Usar la URL tal cual sin encodeURI para no romper enlaces con %20
      const safeLink = isSafeUrl(item.url) ? item.url : null;
      const typeLabel = escapeHTML(item.type || "link");
      const titleEscaped = escapeHTML(item.title);
      const noteEscaped = escapeHTML(item.note || "");
      const dateFormatted = formatDate(item.created_at);

      // Colección
      const collection = item.collection_id ? collectionsMap.get(item.collection_id) : null;
      const collectionBadge = collection
        ? `<span class="badge-collection" style="border-color: ${escapeHTML(collection.color || "var(--border-color)")}; color: ${escapeHTML(collection.color || "var(--primary-blue)")};">📁 ${escapeHTML(collection.name)}</span>`
        : "";

      // Etiquetas con color personalizado
      const tagsHtml = (item.tags || [])
        .map((t) => {
          const col = t.color || "var(--primary-blue)";
          return `<span class="tag-pill" style="border-color: ${escapeHTML(col)}; color: ${escapeHTML(col)};">#${escapeHTML(t.name)}</span>`;
        })
        .join("");

      const titleMarkup = safeLink
        ? `<a href="${escapeHTML(safeLink)}" target="_blank" rel="noopener noreferrer" class="card-title-link" data-id="${item.id}" data-action="open">
          ${titleEscaped}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>`
        : `<span class="card-title-link" style="cursor: pointer;" data-id="${item.id}" data-action="edit">${titleEscaped}</span>`;

      return `
      <article class="item-card" data-id="${item.id}" data-type="${typeLabel}">
        <div class="card-header">
          ${titleMarkup}
          ${
            !item.archived
              ? `<button class="card-btn ${item.pinned ? "pinned" : ""}" data-id="${item.id}" data-action="pin" title="${item.pinned ? "Desfijar" : "Fijar arriba"}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${item.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
          </button>`
              : ""
          }
        </div>

        <div class="card-badges">
          <span class="badge-type">${typeLabel}</span>
          ${collectionBadge}
          ${domain ? `<span class="badge-domain">${escapeHTML(domain)}</span>` : ""}
        </div>

        ${noteEscaped ? `<div class="card-note" data-action="toggle-note">${noteEscaped}</div>` : ""}

        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}

        <div class="card-footer">
          <span class="card-date">${dateFormatted}</span>
          <div class="card-actions">
            ${
              safeLink
                ? `
              <button class="card-btn" data-url="${escapeHTML(safeLink)}" data-action="copy" title="Copiar enlace">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            `
                : ""
            }
            ${
              item.archived
                ? `
              <button class="card-btn" data-id="${item.id}" data-action="unarchive" title="Sacar del archivo">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
                Restaurar
              </button>
            `
                : `
              <button class="card-btn" data-id="${item.id}" data-action="edit" title="Editar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            `
            }
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  containerEl.innerHTML = html;

  // Manejador unificado de eventos delegados
  containerEl.onclick = (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const itemId = btn.dataset.id || btn.closest(".item-card")?.dataset.id;
    const currentItem = items.find((i) => i.id === itemId);

    if (action === "open") {
      if (handlers.onOpenLink && itemId) handlers.onOpenLink(itemId);
    } else if (action === "pin") {
      e.preventDefault();
      if (handlers.onTogglePin && currentItem) {
        handlers.onTogglePin(itemId, currentItem.pinned);
      }
    } else if (action === "edit") {
      e.preventDefault();
      if (handlers.onEditItem && currentItem) {
        handlers.onEditItem(currentItem);
      }
    } else if (action === "unarchive") {
      e.preventDefault();
      if (handlers.onToggleArchive && currentItem) {
        handlers.onToggleArchive(itemId, currentItem.archived);
      }
    } else if (action === "copy") {
      e.preventDefault();
      const url = btn.dataset.url;
      if (handlers.onCopyUrl && url) {
        handlers.onCopyUrl(url);
      }
    } else if (action === "toggle-note") {
      btn.classList.toggle("expanded");
    }
  };
}

// Renderizar chips de etiquetas con contador y color
export function renderTagChips(tagsWithCount, activeTag, containerEl, onSelectTag) {
  if (!containerEl) return;

  if (!tagsWithCount || tagsWithCount.length === 0) {
    containerEl.innerHTML = "";
    return;
  }

  const chipsHtml = tagsWithCount
    .map(({ name, count, color }) => {
      const isActive = activeTag && activeTag.toLowerCase() === name.toLowerCase();
      const dotColor = color || "var(--primary-blue)";
      return `
      <button class="chip ${isActive ? "active" : ""}" data-tag="${escapeHTML(name)}">
        <span class="chip-color-dot" style="background-color: ${escapeHTML(dotColor)};"></span>
        #${escapeHTML(name)}
        <span class="chip-count">${count}</span>
      </button>
    `;
    })
    .join("");

  containerEl.innerHTML = chipsHtml;

  containerEl.onclick = (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const tag = chip.dataset.tag;
    const isCurrentlyActive = activeTag && activeTag.toLowerCase() === tag.toLowerCase();
    onSelectTag(isCurrentlyActive ? null : tag);
  };
}

// Motor unificado de Filtrado y Ordenamiento
export function filterAndSortItems(
  items,
  {
    searchQuery = "",
    activeTag = null,
    collectionFilter = "todas",
    typeFilter = "todos",
    sortOrder = "recientes",
    showArchived = false,
  } = {},
) {
  // 1. Filtrar archivados vs activos
  let result = items.filter((i) => Boolean(i.archived) === Boolean(showArchived));

  // 2. Filtro por tipo
  if (typeFilter && typeFilter !== "todos") {
    result = result.filter((i) => (i.type || "link") === typeFilter);
  }

  // 3. Filtro por colección
  if (collectionFilter === "sin-coleccion") {
    result = result.filter((i) => !i.collection_id);
  } else if (collectionFilter && collectionFilter !== "todas") {
    result = result.filter((i) => i.collection_id === collectionFilter);
  }

  // 4. Filtro por etiqueta (insensible a mayúsculas)
  if (activeTag) {
    const lowerTag = activeTag.toLowerCase();
    result = result.filter((i) => (i.tags || []).some((t) => t.name.toLowerCase() === lowerTag));
  }

  // 5. Filtro de búsqueda textual multi-palabra con AND
  const queryNormalized = normalizeText(searchQuery).trim();
  if (queryNormalized) {
    const words = queryNormalized.split(/\s+/).filter(Boolean);
    result = result.filter((i) => {
      const titleNorm = normalizeText(i.title);
      const noteNorm = normalizeText(i.note);
      const urlNorm = normalizeText(i.url);
      const typeNorm = normalizeText(i.type);
      const tagsNorm = (i.tags || []).map((t) => normalizeText(t.name)).join(" ");

      const fullHaystack = `${titleNorm} ${noteNorm} ${urlNorm} ${typeNorm} ${tagsNorm}`;
      return words.every((w) => fullHaystack.includes(w));
    });
  }

  // 6. Ordenamiento
  result = [...result].sort((a, b) => {
    if (sortOrder === "nombre") {
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    }
    if (sortOrder === "edicion") {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    }
    if (sortOrder === "abierto") {
      if (!a.last_opened_at && !b.last_opened_at) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (!a.last_opened_at) return 1;
      if (!b.last_opened_at) return -1;
      return new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime();
    }
    // 'recientes' (default)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return result;
}
