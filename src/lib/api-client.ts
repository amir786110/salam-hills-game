// wrapper برای fetch با چند لایه احراز هویت (برای مقاومت در برابر iframe/پروکسی‌هایی
// که کوکی یا هدر Authorization رو حذف می‌کنن):
//   ۱) کوکی session (credentials: include)
//   ۲) هدر سفارشی x-tribes-token
//   ۳) هدر استاندارد Authorization: Bearer
//   ۴) فیلد "authToken" داخل بدنه JSON (fallback نهایی برای زمانی که همه هدرها حذف بشن)

const TOKEN_KEY = "tribes_token";

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // برخی مرورگرها (حالت خصوصی سفت‌وسخت) ممکنه ذخیره‌سازی رو بلاک کنن
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) {
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("x-tribes-token")) headers.set("x-tribes-token", token);
  }

  // اگر بدنه JSON هست، توکن رو داخل بدنه هم تزریق کن (fallback نهایی)
  let body = init?.body;
  if (token && body && typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed.authToken = token;
        body = JSON.stringify(parsed);
      }
    } catch {
      // بدنه JSON نبود، دست‌نخورده رها کن
    }
  }

  // برای درخواست‌های بدون بدنه (GET/DELETE بدون body)، توکن رو به‌عنوان query param هم اضافه کن
  let url = input;
  if (token && !body) {
    try {
      const urlObj = new URL(typeof input === "string" ? input : input.toString(), window.location.origin);
      if (!urlObj.searchParams.has("authToken")) {
        urlObj.searchParams.set("authToken", token);
      }
      url = urlObj.pathname + urlObj.search;
    } catch {
      // ignore
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body,
    credentials: "include",
    cache: "no-store",
  });

  // اگر سرور گفت احراز هویت نامعتبره، به بقیه اپ اطلاع بده تا صفحه ورود نشون داده بشه
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tribes:unauthorized"));
  }

  return res;
}
