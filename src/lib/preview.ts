export function normalizeFiles(files: Record<string, string> | null | undefined) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(files || {})) {
    const key = k.replace(/^\/+/, ""); // "/index.html" -> "index.html"
    out[key] = String(v ?? "");
    out["/" + key] = String(v ?? "");
  }
  return out;
}

export function buildPreviewSrcDoc(rawFiles: Record<string, string> | null | undefined) {
  const f = normalizeFiles(rawFiles);

  const html = (f["index.html"] || f["/index.html"] || "").trim();
  const css = f["styles.css"] || f["/styles.css"] || "";
  const js = f["app.js"] || f["/app.js"] || "";

  if (!html) {
    return `<!doctype html><html><body><pre style="padding:16px;color:#b00">
index.html not found in artifact.files
Keys: ${(rawFiles ? Object.keys(rawFiles) : []).join(", ")}
</pre></body></html>`;
  }

  let out = html;

  // 1) base (чтобы якоря/ссылки не ломались)
  if (!/<base\b/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="/" />`);
  }

  // 2) CSS: заменить <link ...styles.css> на <style>...</style> (или вставить в </head>)
  if (/<link[^>]+href=["']\/?styles\.css["'][^>]*>/i.test(out)) {
    out = out.replace(
      /<link[^>]+href=["']\/?styles\.css["'][^>]*>\s*/i,
      `<style>\n${css}\n</style>\n`
    );
  } else {
    out = out.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
  }

  // 3) JS: инлайн + try/catch, чтобы вместо белого экрана вы видели stacktrace
  const safeJs = `try {\n${js}\n} catch (e) {\n  console.error(e);\n  document.body.innerHTML = '<pre style="padding:16px;color:#b00;white-space:pre-wrap">' + (e && e.stack ? e.stack : String(e)) + '</pre>';\n}\n`;

  if (/<script[^>]+src=["']\/?app\.js["'][^>]*>\s*<\/script>/i.test(out)) {
    out = out.replace(
      /<script[^>]+src=["']\/?app\.js["'][^>]*>\s*<\/script>/i,
      `<script>\n${safeJs}\n</script>`
    );
  } else {
    out = out.replace(/<\/body>/i, `<script>\n${safeJs}\n</script>\n</body>`);
  }

  return out;
}
