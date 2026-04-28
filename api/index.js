export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

function isBadRequest(url, req) {
  const pathname = url.pathname;

  if (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/.well-known") ||
    pathname.includes("health") ||
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image")
  ) {
    return true;
  }

  const ua = req.headers.get("user-agent") || "";
  if (
    ua.toLowerCase().includes("bot") ||
    ua.toLowerCase().includes("crawler") ||
    ua.toLowerCase().includes("spider")
  ) {
    return true;
  }

  return false;
}

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  const url = new URL(req.url);

  // 🚨 بلاک درخواست‌های اضافی
  if (isBadRequest(url, req)) {
    return new Response("ok", {
      status: 200,
      headers: { "cache-control": "public, max-age=3600" },
    });
  }

  try {
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    let clientIp = null;

    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();

      if (STRIP_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;

      if (key === "x-real-ip") {
        clientIp = v;
        continue;
      }

      if (key === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }

      headers.set(k, v);
    }

    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const res = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
      // 🔥 کاهش هزینه Observability
      cache: "force-cache",
    });

    // 🔥 caching ساده برای کاهش requestهای تکراری
    const newHeaders = new Headers(res.headers);
    newHeaders.set("cache-control", "public, max-age=30");

    return new Response(res.body, {
      status: res.status,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response("Bad Gateway", { status: 502 });
  }
}
