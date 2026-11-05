import { supabase } from "./supabase.js";

function getErrorMessage(error, defaultMsg = "Ocurrió un error. Revisa tu internet.") {
  if (!error) return defaultMsg;
  console.error("Supabase error:", error);
  if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
    return "No hay conexión con el servidor. Revisa tu internet.";
  }
  return error.message || defaultMsg;
}

export async function loadAll() {
  try {
    const [itemsRes, tagsRes, itemTagsRes, collectionsRes] = await Promise.all([
      supabase
        .from("items")
        .select("*")
        .eq("archived", false)
        .order("created_at", { ascending: false }),
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
      message: getErrorMessage(err, "No se pudieron cargar los datos. Revisa tu internet."),
    };
  }
}

export async function saveItem(itemInput, tagNames = []) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: "Tu sesión no está activa. Inicia sesión de nuevo." };
    }

    // Normalizar nombres de etiquetas (limpios y únicos)
    const uniqueTagNames = Array.from(
      new Set(tagNames.map((t) => (t || "").trim()).filter((t) => t.length > 0)),
    );

    let resolvedTags = [];
    if (uniqueTagNames.length > 0) {
      const tagRows = uniqueTagNames.map((name) => ({
        name,
        user_id: user.id,
      }));

      // Upsert de etiquetas
      const { error: upsertErr } = await supabase
        .from("tags")
        .upsert(tagRows, { onConflict: "user_id,name" });

      if (upsertErr) throw upsertErr;

      // Obtener los IDs completos de las etiquetas
      const { data: fetchedTags, error: fetchTagsErr } = await supabase
        .from("tags")
        .select("id, name, color")
        .in("name", uniqueTagNames);

      if (fetchTagsErr) throw fetchTagsErr;
      resolvedTags = fetchedTags || [];
    }

    const payload = {
      title: itemInput.title.trim(),
      url: itemInput.url ? itemInput.url.trim() : null,
      note: itemInput.note ? itemInput.note.trim() : null,
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
      payload.user_id = user.id;
      const { data, error } = await supabase.from("items").insert(payload).select().single();
      if (error) throw error;
      savedItem = data;
    }

    // Sincronizar item_tags: borrar anteriores y reinsertar
    const { error: delTagsErr } = await supabase
      .from("item_tags")
      .delete()
      .eq("item_id", savedItem.id);

    if (delTagsErr) throw delTagsErr;

    if (resolvedTags.length > 0) {
      const relRows = resolvedTags.map((t) => ({
        item_id: savedItem.id,
        tag_id: t.id,
        user_id: user.id,
      }));
      const { error: insTagsErr } = await supabase.from("item_tags").insert(relRows);

      if (insTagsErr) throw insTagsErr;
    }

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
      message: getErrorMessage(err, "No se pudo guardar el item. Revisa tu internet."),
    };
  }
}

export async function deleteItem(itemId) {
  try {
    const { error } = await supabase.from("items").delete().eq("id", itemId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: getErrorMessage(err, "No se pudo borrar el item. Revisa tu internet."),
    };
  }
}

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
      message: getErrorMessage(err, "No se pudo actualizar el estado fijado."),
    };
  }
}

export async function markOpened(itemId) {
  try {
    await supabase
      .from("items")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", itemId);
    return { ok: true };
  } catch (err) {
    // Registro silencioso para no interrumpir la navegación
    console.warn("No se pudo registrar apertura:", err);
    return { ok: false };
  }
}
