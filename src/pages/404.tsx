import Head from "next/head";

/* Plain 404 in the look of the new site; no extra components or fonts so it stays light. */
const links: [string, string][] = [["/", "Startseite"], ["/preise", "Preise"], ["/webdesign", "Webdesign"], ["/app-entwicklung", "App-Entwicklung"], ["/en", "English"]];

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Seite nicht gefunden | VincialMedia</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main style={{ minHeight: "100vh", background: "#000", color: "#f5f5f7", font: "17px/1.5 Inter,system-ui,-apple-system,sans-serif", display: "grid", placeItems: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 640 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#f5f5f7", textDecoration: "none", fontWeight: 600, marginBottom: 40 }}>
            <img src="/icon-192.png" width={32} height={32} alt="" style={{ borderRadius: 8 }} />VincialMedia
          </a>
          <h1 style={{ fontSize: "clamp(36px,6vw,56px)", letterSpacing: "-.035em", lineHeight: 1.05, margin: "0 0 16px" }}>Diese Seite gibt es nicht.</h1>
          <p style={{ color: "#a1a1a6", margin: "0 0 28px" }}>Vielleicht hat sich die Adresse geändert. Hier geht es weiter:</p>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {links.map(([href, label]) => (
              <a key={href} href={href} style={{ color: "#f5f5f7", border: "1px solid #3a3a3c", borderRadius: 999, padding: "10px 18px", textDecoration: "none" }}>{label}</a>
            ))}
          </nav>
        </div>
      </main>
    </>
  );
}
