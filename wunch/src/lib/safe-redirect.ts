/**
 * Only allow same-site relative paths as redirect targets. Browsers strip
 * tabs/newlines and treat "\" like "/", so "/\t/evil.example" would otherwise
 * become "//evil.example": reject control characters and backslashes, then
 * resolve and require the same origin.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://wunch.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
