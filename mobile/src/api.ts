import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { Session } from "../../packages/shared";
export const base = String(
  Constants.expoConfig?.extra?.apiUrl || "http://localhost:5173",
).replace(/\/$/, "");
let refreshing: Promise<Session> | null = null;
export async function saveSession(session: Session) {
  await SecureStore.setItemAsync("teja-session", JSON.stringify(session));
}
export async function clearSession() {
  await SecureStore.deleteItemAsync("teja-session");
}
async function session(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync("teja-session");
  return raw ? JSON.parse(raw) : null;
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const s = await session(),
    form = body instanceof FormData;
  let r: Response;
  try {
    r = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "X-Client": "app",
        ...(s ? { Authorization: "Bearer " + s.accessToken } : {}),
        ...(!form && body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw Error(
      "Internet yo‘q. Qayta urinib ko‘ring / Нет сети. Повторите попытку",
    );
  }
  if (r.status === 401 && s && retry) {
    if (!refreshing)
      refreshing = (async () => {
        const response = await fetch(base + "/api/auth", {
          method: "POST",
          headers: { "X-Client": "app", "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "refresh",
            refreshToken: s.refreshToken,
          }),
        });
        const d = await response.json();
        if (!response.ok) {
          await clearSession();
          throw Error("Qayta kiring / Войдите снова");
        }
        await saveSession(d);
        return d;
      })().finally(() => {
        refreshing = null;
      });
    await refreshing;
    return api<T>(path, body, false);
  }
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Xatolik / Ошибка");
  return d as T;
}
export const imageUrl = (url: string) =>
  url.startsWith("/") ? base + url : url;
