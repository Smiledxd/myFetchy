import { supabase } from "./supabase.js";

// Traductor unificado de errores de base de datos a español
function parseErrorMessage(error, defaultMsg = "Ocurrió un error. Revisa tu internet.") {
  if (!error) return defaultMsg;
  console.error("Detalle técnico Supabase:", error);

  if (error.code === "23505") {
    return "Ya existe un elemento con ese nombre.";
  }

  const msg = (error.message || "").toLowerCase();
  if (msg.includes("jwt") || msg.includes("token") || msg.includes("auth")) {
    return "Tu sesión ha expirado. Ingresa nuevamente.";
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("connection")) {
    return "No hay conexión con el servidor. Revisa tu internet.";
  }
  if (error.status === 429 || msg.includes("rate limit")) {
    return "Muchos intentos seguidos. Espera unos minutos y vuelve a intentar.";
  }

  return defaultMsg;
}

// Cargar todos los datos del usuario (items activos y archivados, tags, relaciones y colecciones)
export async function loadAll() {
  try {
    const [itemsRes, tagsRes, itemTagsRes, collectionsRes] = await Promise.all([
      supabase.from("items").select("*").order("created_at", { ascending: false }),
      supabase.from("tags").select("*").order("name", { ascending: true }),
      supabase.from("item_tags").select("item_id, tag_id"),
      supabase.from("collections").select("*").order("name", { ascending: true }),
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (tagsRes.error) throw tagsRes.error;
    if (itemTagsRes.error) throw itemTagsRes.error;
    if (collectionsRes.error) throw collectionsRes.error;

    const tagsMap = new Map();
    for (const tag of tagsRes.data || []) {
      tagsMap.set(tag.id, tag);
    }

    const itemTagsMap = new Map();
    for (const rel of itemTagsRes.data || []) {
      const tag = tagsMap.get(rel.tag_id);
      if (tag) {
        if (!itemTagsMap.has(rel.item_id)) {
          itemTagsMap.set(rel.item_id, []);
        }
        itemTagsMap.get(rel.item_id).push(tag);
      }
    }

    const items = (itemsRes.data || []).map((item) => ({
      ...item,
      tags: itemTagsMap.get(item.id) || [],
    }));

    return {
      ok: true,
      data: {
        items,
        tags: tagsRes.data || [],
        collections: collectionsRes.data || [],
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudieron cargar los datos. Revisa tu internet."),
    };
  }
}

// Guardar o actualizar un item utilizando el RPC set_item_tags
export async function saveItem(itemInput, tagNames = []) {
  try {
    // Normalizar etiquetas preservando mayúsculas originales pero sin duplicar
    const seenLower = new Set();
    const cleanTagNames = [];
    for (const raw of tagNames) {
      const trimmed = (raw || "").trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seenLower.has(lower)) {
        seenLower.add(lower);
        cleanTagNames.push(trimmed);
      }
    }

    // Nota siempre vacía '' por defecto, nunca null
    const payload = {
      title: itemInput.title.trim(),
      url: itemInput.url ? itemInput.url.trim() : null,
      note: itemInput.note ? itemInput.note.trim() : "",
      type: itemInput.type,
      collection_id: itemInput.collection_id || null,
      pinned: Boolean(itemInput.pinned),
      updated_at: new Date().toISOString(),
    };

    let savedItem;
    if (itemInput.id) {
      const { data, error } = await supabase
        .from("items")
        .update(payload)
        .eq("id", itemInput.id)
        .select()
        .single();
      if (error) throw error;
      savedItem = data;
    } else {
      // Sin user_id manual desde el cliente
      const { data, error } = await supabase.from("items").insert(payload).select().single();
      if (error) throw error;
      savedItem = data;
    }

    // Guardar etiquetas en un solo paso mediante RPC
    const { error: rpcErr } = await supabase.rpc("set_item_tags", {
      p_item_id: savedItem.id,
      p_tag_names: cleanTagNames,
    });

    if (rpcErr) {
      console.error("Error al sincronizar etiquetas con set_item_tags:", rpcErr);
      throw rpcErr;
    }

    // Cargar etiquetas resueltas para devolver el item completo
    const { data: itemTagsRel, error: relErr } = await supabase
      .from("item_tags")
      .select("tags (id, name, color)")
      .eq("item_id", savedItem.id);

    if (relErr) throw relErr;

    const resolvedTags = (itemTagsRel || []).map((r) => r.tags).filter(Boolean);

    return {
      ok: true,
      data: {
        ...savedItem,
        tags: resolvedTags,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo guardar. Revisa tu internet."),
    };
  }
}

// Eliminar item
export async function deleteItem(itemId) {
  try {
    const { error } = await supabase.from("items").delete().eq("id", itemId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo borrar el elemento. Revisa tu internet."),
    };
  }
}

// Alternar fijado
export async function togglePin(itemId, currentPinned) {
  try {
    const nextPinned = !currentPinned;
    const { data, error } = await supabase
      .from("items")
      .update({ pinned: nextPinned, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo actualizar el estado fijado."),
    };
  }
}

// Alternar archivado
export async function toggleArchive(itemId, currentArchived) {
  try {
    const nextArchived = !currentArchived;
    const { data, error } = await supabase
      .from("items")
      .update({ archived: nextArchived, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo cambiar el estado de archivado."),
    };
  }
}

// Registrar apertura de link
export async function markOpened(itemId) {
  try {
    await supabase
      .from("items")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", itemId);
    return { ok: true };
  } catch (err) {
    console.warn("No se pudo registrar apertura:", err);
    return { ok: false };
  }
}

// ================= GESTIÓN DE ETIQUETAS =================

// Renombrar etiqueta (maneja error 23505)
export async function renameTag(tagId, newName) {
  try {
    const trimmed = (newName || "").trim();
    if (!trimmed) {
      return { ok: false, message: "El nombre de la etiqueta no puede estar vacío." };
    }

    const { data, error } = await supabase
      .from("tags")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", tagId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          isDuplicate: true,
          message: `Ya existe la etiqueta «${trimmed}».`,
        };
      }
      throw error;
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo renombrar la etiqueta."),
    };
  }
}

// Cambiar color de etiqueta
export async function updateTagColor(tagId, color) {
  try {
    const { data, error } = await supabase
      .from("tags")
      .update({ color, updated_at: new Date().toISOString() })
      .eq("id", tagId)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo actualizar el color."),
    };
  }
}

// Unir etiqueta origen con destino mediante RPC merge_tags
export async function mergeTags(sourceName, targetName) {
  try {
    const { error } = await supabase.rpc("merge_tags", {
      source: sourceName,
      target: targetName,
    });

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudieron unir las etiquetas."),
    };
  }
}

// Borrar etiqueta (desvincula de items, los items no se borran)
export async function deleteTag(tagId) {
  try {
    const { error } = await supabase.from("tags").delete().eq("id", tagId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo borrar la etiqueta."),
    };
  }
}

// ================= GESTIÓN DE COLECCIONES =================

// Crear colección
export async function createCollection(name, color = "#2A4A8D") {
  try {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      return { ok: false, message: "Ingresa un nombre para la colección." };
    }

    const { data, error } = await supabase
      .from("collections")
      .insert({ name: trimmed, color })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: `Ya existe una colección llamada «${trimmed}».` };
      }
      throw error;
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo crear la colección."),
    };
  }
}

// Renombrar colección
export async function renameCollection(id, newName) {
  try {
    const trimmed = (newName || "").trim();
    if (!trimmed) {
      return { ok: false, message: "El nombre no puede estar vacío." };
    }

    const { data, error } = await supabase
      .from("collections")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: `Ya existe una colección llamada «${trimmed}».` };
      }
      throw error;
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo renombrar la colección."),
    };
  }
}

// Cambiar color de colección
export async function updateCollectionColor(id, color) {
  try {
    const { data, error } = await supabase
      .from("collections")
      .update({ color, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo cambiar el color de la colección."),
    };
  }
}

// Borrar colección (los items pasan automáticamente a sin colección)
export async function deleteCollection(id) {
  try {
    const { error } = await supabase.from("collections").delete().eq("id", id);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: parseErrorMessage(err, "No se pudo borrar la colección."),
    };
  }
}
