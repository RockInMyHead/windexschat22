import { useState, useEffect, useMemo, useCallback } from "react";

// Hook для исправления fullscreen в Sandpack Preview (включая Shadow DOM)
export function useFixSandpackFullscreen() {
  useEffect(() => {
    const apply = () => {
      const seen = new Set<Node>();
      const walk = (node: Node) => {
        if (!node || seen.has(node)) return;
        seen.add(node);

        if ((node as Element).tagName === "IFRAME") {
          const title = node.getAttribute("title") || "";
          const src = node.getAttribute("src") || "";
          if (title.includes("Sandpack Preview") || src.includes("sandpack-static-server")) {
            node.setAttribute("allow", "fullscreen");
            node.allowFullscreen = true;
          }
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        node.childNodes?.forEach?.(walk);
      };
      walk(document.documentElement);
    };

    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    return () => obs.disconnect();
  }, []);
}
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, Download, AlertTriangle, Play } from "lucide-react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview
} from "@codesandbox/sandpack-react";
import type { Artifact } from "@/lib/api";
import { buildPreviewSrcDoc } from "@/lib/preview";

// Функция преобразования файлов артефакта в формат Sandpack
function toSandpackFiles(artifactFiles: Record<string, string>, isVanillaSite: boolean) {
  const files: Record<string, { code: string }> = {};

  const hasReactVite =
    Boolean(artifactFiles["main.tsx"] || artifactFiles["App.tsx"] || artifactFiles["/src/main.tsx"] || artifactFiles["src/main.tsx"]);

  const put = (path: string, code: string) => {
    const p = path.startsWith("/") ? path : `/${path}`;
    files[p] = { code };
  };

  // 1) Нормализация файлов
  for (const [path, code] of Object.entries(artifactFiles)) {
    const normalized = path.replace(/^\/+/, ""); // убираем ведущие /

    // Для vanilla сайтов - простая нормализация без перестройки
    if (isVanillaSite) {
      put(`/${normalized}`, code);
      continue;
    }

    // Для React/Vite проектов - существующая логика
    // package.json / конфиги оставляем в корне как есть
    if (
      normalized === "package.json" ||
      normalized === "vite.config.ts" ||
      normalized === "tsconfig.json" ||
      normalized === "src/vite-env.d.ts" ||
      normalized === "vite-env.d.ts"
    ) {
      put(`/${normalized}`, code);
      continue;
    }

    // index.html всегда в корне
    if (normalized === "index.html") {
      put("/index.html", code);
      continue;
    }

    // Для React/Vite: корневые исходники перекидываем в /src/*
    if (hasReactVite && !normalized.includes("/")) {
      const isSource =
        normalized.endsWith(".ts") ||
        normalized.endsWith(".tsx") ||
        normalized.endsWith(".css") ||
        normalized.endsWith(".js") ||
        normalized.endsWith(".jsx");

      if (isSource) {
        put(`/src/${normalized}`, code);
        continue;
      }
    }

    // Остальное — как есть
    put(`/${normalized}`, code);
  }

  // 2) package.json: для vanilla сайтов не нужен, для React - добавляем deps
  const ensurePackageJson = (raw?: string) => {
    let pkg: any;
    try {
      pkg = raw ? JSON.parse(raw) : {};
    } catch {
      pkg = {};
    }

    pkg.name ||= "artifact-preview";
    pkg.private = true;

    if (!isVanillaSite) {
    pkg.scripts ||= { dev: "vite", build: "vite build", preview: "vite preview" };

    pkg.dependencies ||= {};
    pkg.dependencies["react"] ||= "^18.2.0";
    pkg.dependencies["react-dom"] ||= "^18.2.0";
    // КЛЮЧЕВОЕ: Vite в nodebox требует установленный esbuild-wasm
    pkg.dependencies["esbuild-wasm"] ||= "^0.21.5";

    pkg.devDependencies ||= {};
    pkg.devDependencies["vite"] ||= "^5.4.9";
    pkg.devDependencies["@vitejs/plugin-react"] ||= "^4.0.0";
    pkg.devDependencies["typescript"] ||= "^5.0.0";
    }

    return JSON.stringify(pkg, null, 2);
  };

  if (!isVanillaSite) {
  put("/package.json", ensurePackageJson(files["/package.json"]?.code));
  }

  // 3) Tailwind: отключаем в превью (иначе нужен postcss/tailwind config)
  const cssKeys = ["/src/index.css", "/index.css"];
  for (const cssKey of cssKeys) {
    if (files[cssKey]?.code?.includes("@tailwind")) {
      files[cssKey] = { code: "/* preview mode: tailwind disabled */\n" };
    }
  }

  // 4) Минимальные конфиги под Vite/TS (только для React проектов)
  if (!isVanillaSite) {
  if (!files["/vite.config.ts"]) {
    put(
      "/vite.config.ts",
      `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()] });`
    );
  }

  if (!files["/tsconfig.json"]) {
    put(
      "/tsconfig.json",
      `{
  "compilerOptions": {
    "jsx": "react-jsx",
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": false,
    "types": ["vite/client"]
  }
}`
    );
  }

  if (!files["/src/vite-env.d.ts"]) {
    put("/src/vite-env.d.ts", `/// <reference types="vite/client" />`);
    }
  }

  // 5) Страховка: если React/Vite артефакт, но нет /src/main.tsx — попробуем перекинуть
  if (hasReactVite && !isVanillaSite) {
    if (!files["/src/main.tsx"] && files["/main.tsx"]) {
    files["/src/main.tsx"] = files["/main.tsx"];
    delete files["/main.tsx"];
  }
    if (!files["/src/App.tsx"] && files["/App.tsx"]) {
    files["/src/App.tsx"] = files["/App.tsx"];
    delete files["/App.tsx"];
  }
    if (!files["/src/index.css"] && files["/index.css"]) {
    files["/src/index.css"] = files["/index.css"];
    delete files["/index.css"];
    }
  }

  return files;
}

interface WebsiteArtifactCardProps {
  artifact: Artifact;
  onUpdate?: (artifactId: number, title: string, files: Record<string, string>, deps?: Record<string, string>) => Promise<void>;
}

export function WebsiteArtifactCard({ artifact, onUpdate }: WebsiteArtifactCardProps) {
  const [sandpackError, setSandpackError] = useState<string>("");
  const [previewError, setPreviewError] = useState<string>("");
  const [previewKey, setPreviewKey] = useState<number>(0); // Для перезагрузки превью
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Исправление fullscreen в Sandpack Preview
  useFixSandpackFullscreen();

  // Определяем тип артефакта для корректного превью
  const isVanillaSite = useMemo(() =>
    Boolean(artifact.files["/index.html"] && artifact.files["/styles.css"] && artifact.files["/app.js"]),
    [artifact.files]
  );

  // Мемоизируем преобразование файлов для Sandpack (оптимизация производительности)
  const sandpackFiles = useMemo(() =>
    toSandpackFiles(artifact.files, isVanillaSite),
    [artifact.files, isVanillaSite]
  );

  // Обработка ошибок Sandpack и превью
  useEffect(() => {
    // Небольшая задержка перед началом загрузки для предотвращения зависаний UI
    const startTimeoutId = setTimeout(() => {
      setIsPreviewLoading(true);
      setSandpackError("");
      setPreviewError("");

      const handleSandpackError = (event: ErrorEvent) => {
        if (event.message.includes('sandbox') || event.message.includes('presentation')) {
          setSandpackError('Sandpack временно недоступен из-за ограничений браузера. Попробуйте перезагрузить страницу.');
          setIsPreviewLoading(false);
        }
      };

      const handlePreviewError = (event: MessageEvent) => {
        // Обрабатываем сообщения об ошибках из iframe превью
        if (event.data?.type === 'error' || event.data?.type === 'unhandledrejection') {
          setPreviewError('Ошибка выполнения JavaScript в превью сайта. Код сайта может содержать несогласованные элементы.');
          setIsPreviewLoading(false);
        }
      };

      // Дополнительная страховка: патчим iframe после монтирования
      const patchIframe = () => {
        setTimeout(() => {
          const iframes = document.querySelectorAll('iframe[title*="Sandpack"]');
          iframes.forEach((iframe) => {
            iframe.setAttribute(
              "sandbox",
              "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
            );
            iframe.setAttribute("allow", "fullscreen");
            (iframe as any).allowFullscreen = true;
          });
        }, 500);
      };

      window.addEventListener('error', handleSandpackError);
      window.addEventListener('message', handlePreviewError);
      patchIframe();

      // Таймер для успешной загрузки превью (оптимистичный подход)
      const successTimeoutId = setTimeout(() => {
        if (isPreviewLoading && !sandpackError && !previewError) {
          setIsPreviewLoading(false);
        }
      }, 3000); // 3 секунды - считаем успешной загрузкой

      // Timeout для обнаружения зависаний превью
      const errorTimeoutId = setTimeout(() => {
        if (isPreviewLoading) {
          setPreviewError('Превью сайта не загрузилось вовремя. Возможно, JavaScript код содержит ошибки.');
          setIsPreviewLoading(false);
        }
      }, 10000); // Уменьшили до 10 секунд для более быстрого обнаружения проблем

      // Cleanup function для внутренних таймеров
      return () => {
        window.removeEventListener('error', handleSandpackError);
        window.removeEventListener('message', handlePreviewError);
        clearTimeout(successTimeoutId);
        clearTimeout(errorTimeoutId);
      };
    }, 100); // Небольшая задержка 100ms перед началом загрузки

    return () => {
      clearTimeout(startTimeoutId);
    };
  }, [artifact.id]);

  const handleDownload = () => {
    // Создаем архив всех файлов
    const filesContent = Object.entries(artifact.files)
      .map(([path, content]) => `=== ${path} ===\n${content}`)
      .join("\n\n");

    const blob = new Blob([filesContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_project.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReloadPreview = useCallback(() => {
    setPreviewError("");
    setSandpackError("");
    setIsPreviewLoading(true);
    setPreviewKey(prev => prev + 1); // Перезагружаем превью
  }, []);

  return (
    <div className="mt-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-background to-secondary/10 p-4 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-md">
            <Code className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{artifact.title}</h3>
            <p className="text-xs text-muted-foreground">
              Веб-сайт • {Object.keys(artifact.files).length} файлов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadPreview}
            className="h-8"
            title="Перезагрузить превью"
          >
            <Play className="h-4 w-4 mr-1" />
            Обновить превью
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-8"
            title="Скачать все файлы"
          >
            <Download className="h-4 w-4 mr-1" />
            Скачать проект
          </Button>
        </div>
      </div>

      {/* Preview Viewer */}
        <div className="relative rounded-lg overflow-hidden border border-border shadow-inner" style={{ isolation: 'isolate' }}>
          {isPreviewLoading && !sandpackError && !previewError && (
            <div className="absolute top-2 right-2 z-10">
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs">
                <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full"></div>
                <span>Загрузка превью...</span>
                <button
                  onClick={() => {
                    setPreviewError('Превью остановлено пользователем');
                    setIsPreviewLoading(false);
                  }}
                  className="text-red-500 hover:text-red-700 ml-1"
                  title="Остановить загрузку"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {sandpackError || previewError ? (
            <div className="p-4 text-center text-red-500 dark:text-red-400">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">{sandpackError || previewError}</p>
            </div>
          ) : isVanillaSite ? (
            // Простой iframe превью для vanilla сайтов
            <div className="h-[420px] bg-white">
              <iframe
                key={previewKey} // Для перезагрузки превью
                title="website-preview"
                srcDoc={buildPreviewSrcDoc(artifact.files)}
                sandbox="allow-scripts"
                style={{ width: "100%", height: "100%", border: 0 }}
                onLoad={() => {
                  setIsPreviewLoading(false);
                  setPreviewError(""); // Очищаем ошибки при успешной загрузке
                }}
                onError={() => {
                  setPreviewError('Ошибка загрузки простого превью');
                  setIsPreviewLoading(false);
                }}
              />
            </div>
          ) : isVanillaSite ? (
            // Серверное превью для vanilla сайтов (HTML/CSS/JS)
            <div className="h-[420px] bg-white">
              <iframe
                key={previewKey}
                title="server-preview"
                src={`/api/artifacts/${artifact.id}/preview`}
                sandbox="allow-scripts"
                style={{ width: "100%", height: "100%", border: 0 }}
                onLoad={() => {
                  setIsPreviewLoading(false);
                  setPreviewError(""); // Очищаем ошибки при успешной загрузке
                }}
                onError={() => {
                  setPreviewError('Ошибка загрузки серверного превью');
                  setIsPreviewLoading(false);
                }}
              />
            </div>
          ) : (
            // Sandpack для React/Vite проектов
            <SandpackProvider
              key={previewKey}
              template="vite-react-ts"
              files={sandpackFiles}
              customSetup={{
                dependencies: {
                  "esbuild-wasm": "^0.21.5",
                },
              }}
              theme="dark"
            >
              <SandpackLayout>
                <SandpackCodeEditor
                  showTabs={true}
                  showLineNumbers={true}
                  showRunButton={false}
                  style={{ height: 420 }}
                />
                <SandpackPreview
                  showOpenInCodeSandbox={false}
                  showOpenNewtab={false}
                  style={{ height: 420 }}
                />
              </SandpackLayout>
            </SandpackProvider>
          )}
        </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>🌐 Превью сайта</span>
          {artifact.deps && Object.keys(artifact.deps).length > 0 && (
            <span>📦 {Object.keys(artifact.deps).length} зависимостей</span>
          )}
        </div>
        <span>Создано: {new Date(artifact.createdAt).toLocaleString("ru-RU")}</span>
      </div>
    </div>
  );
}
