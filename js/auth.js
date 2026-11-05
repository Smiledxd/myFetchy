import { supabase } from "./supabase.js";

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

export function getCleanAppUrl() {
  return window.location.origin + window.location.pathname;
}

export async function sendMagicLink(email) {
  const trimmed = (email || "").trim();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, message: "Ingresa un correo electrónico válido." };
  }

  const cleanUrl = getCleanAppUrl();

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: cleanUrl,
    },
  });

  if (error) {
    console.error("Error al solicitar enlace de acceso:", error);
    const msg = error.message ? error.message.toLowerCase() : "";

    // Usuario no registrado o signups bloqueados
    if (
      msg.includes("signups not allowed") ||
      msg.includes("user not found") ||
      msg.includes("signup disabled") ||
      msg.includes("otp disabled") ||
      error.status === 400
    ) {
      return { ok: false, message: "Este correo no tiene acceso." };
    }

    if (
      error.status === 429 ||
      msg.includes("rate limit") ||
      msg.includes("over_email_send_rate_limit")
    ) {
      return {
        ok: false,
        message: "Muchos intentos seguidos. Espera unos minutos y vuelve a intentar.",
      };
    }

    if (msg.includes("fetch") || msg.includes("network")) {
      return { ok: false, message: "No hay conexión con el servidor. Revisa tu internet." };
    }

    return {
      ok: false,
      message: "No se pudo enviar el link. Revisa tu correo e intenta de nuevo.",
    };
  }

  return { ok: true, message: "Revisa tu correo y toca el link para entrar." };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error al salir:", error);
  }
}

export async function checkInitialSession(onSessionChange) {
  // Revisar si la URL trajo parámetros de error de Supabase
  const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  const errorDesc = hashParams.get("error_description") || queryParams.get("error_description");
  if (errorDesc) {
    cleanUrlTokens();
    return { session: null, error: "El link no es válido o ya venció. Vuelve a pedir otro." };
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    console.error("Error obteniendo sesión inicial:", error);
    return { session: null, error: "No se pudo validar la sesión. Intenta de nuevo." };
  }

  if (session?.user) {
    currentUser = session.user;
    cleanUrlTokens();
    onSessionChange(currentUser);
  } else {
    currentUser = null;
    onSessionChange(null);
  }

  // Escuchar cambios de autenticación ignorando renovaciones periódicas de token
  supabase.auth.onAuthStateChange((event, newSession) => {
    if (event === "TOKEN_REFRESHED") {
      if (newSession?.user) currentUser = newSession.user;
      return;
    }

    const newUser = newSession?.user || null;
    const prevUserId = currentUser?.id || null;
    const nextUserId = newUser?.id || null;

    if (prevUserId !== nextUserId) {
      currentUser = newUser;
      cleanUrlTokens();
      onSessionChange(currentUser);
    }
  });

  return { session, error: null };
}

function cleanUrlTokens() {
  if (window.location.hash || window.location.search) {
    window.history.replaceState(
      {},
      document.title,
      window.location.origin + window.location.pathname,
    );
  }
}
