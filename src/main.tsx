import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Safari hardening for Sandpack: drop invalid sandbox token "allow-presentation"
(() => {
  const ua = navigator.userAgent;
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|EdgiOS|FxiOS/i.test(ua);

  if (!isSafari) return;

  // 1) Block DOMTokenList.add("allow-presentation") to prevent Safari console error
  const origAdd = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function (...tokens: string[]) {
    const filtered = tokens.filter((t) => t !== "allow-presentation");
    if (filtered.length === 0) return;
    return origAdd.apply(this, filtered as any);
  };

  // 2) Also sanitize direct setAttribute("sandbox", "...allow-presentation...")
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (
      this.tagName === "IFRAME" &&
      name.toLowerCase() === "sandbox" &&
      typeof value === "string" &&
      value.includes("allow-presentation")
    ) {
      value = value
        .split(/\s+/)
        .filter((t) => t && t !== "allow-presentation")
        .join(" ");
    }
    return origSetAttr.call(this, name, value);
  };
})();

createRoot(document.getElementById("root")!).render(<App />);
