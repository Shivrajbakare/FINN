export function resolveApiBase(value, production = false) {
  if (!value && production) {
    throw new Error("NEXT_PUBLIC_API_URL is required for production builds (https://your-backend/api).");
  }
  let url;
  try {
    url = new URL(value || "http://localhost:8000/api");
  } catch {
    throw new Error("NEXT_PUBLIC_API_URL must be an absolute HTTP(S) URL ending in /api.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!["http:", "https:"].includes(url.protocol) || !path.endsWith("/api") ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_URL must be an HTTP(S) URL ending in /api, without credentials, query, or fragment.");
  }
  const host = url.hostname.replace(/\.$/, "");
  const localHost = host === "localhost" || host.endsWith(".localhost") ||
    /^127\./.test(host) || ["0.0.0.0", "[::1]", "[::]"].includes(host);
  if (production && (url.protocol !== "https:" || localHost)) {
    throw new Error("Production NEXT_PUBLIC_API_URL must use HTTPS and a non-loopback host.");
  }
  return `${url.origin}${path}`;
}
