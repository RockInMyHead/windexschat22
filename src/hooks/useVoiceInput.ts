import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/** types оставляю ваши как есть */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: SpeechGrammarList;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  serviceURI: string;
  start(): void;
  stop(): void;
  abort(): void;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
}
interface SpeechGrammarList {
  readonly length: number;
  item(index: number): SpeechGrammar;
  [index: number]: SpeechGrammar;
  addFromURI(src: string, weight?: number): void;
  addFromString(string: string, weight?: number): void;
}
interface SpeechGrammar {
  src: string;
  weight: number;
}

type VoiceErrorCode =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "start-failed"
  | "start-timeout"
  | "not-supported"
  | string;

interface UseVoiceInputOptions {
  lang?: string;
  onTranscript?: (transcript: string) => void;
  onError?: (code: VoiceErrorCode, message?: string) => void;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  isSupported: boolean;
  isIOS: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  toggleRecording: () => void;
}

export const useVoiceInput = ({
  lang = "ru-RU",
  onTranscript,
  onError,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastTranscriptRef = useRef<string>("");

  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Гварды от гонок/дублей (refs = стабильный mutex)
  const isStartingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const ignoreErrorsRef = useRef(false);

  // callbacks через refs (чтобы НЕ пересоздавать recognition при каждом рендере)
  const onTranscriptRef = useRef<typeof onTranscript>(onTranscript);
  const onErrorRef = useRef<typeof onError>(onError);

  // watchdog, чтобы isStarting не мог зависнуть
  const startTimeoutRef = useRef<number | null>(null);

  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const iPadOS13Plus = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
    return iOS || iPadOS13Plus;
  }, []);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  const clearStartTimeout = () => {
    if (startTimeoutRef.current) {
      window.clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
  };

  const hardResetFlags = () => {
    clearStartTimeout();
    isStartingRef.current = false;
    stopRequestedRef.current = false;
    setIsRecording(false);
  };

  const createRecognition = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!Ctor) {
      console.warn("🎤 Speech Recognition API not available");
      setIsSupported(false);
      return null;
    }

    const rec: SpeechRecognition = new Ctor();
    rec.continuous = true; // Изменяем на true для лучшего захвата
    rec.interimResults = true; // Включаем промежуточные результаты
    rec.lang = lang;

    rec.onstart = () => {
      console.log("🎤 Speech recognition started successfully");
      lastTranscriptRef.current = ""; // Сброс при старте
      clearStartTimeout();
      isStartingRef.current = false;
      stopRequestedRef.current = false;
      setIsRecording(true);
    };

    rec.onend = () => {
      console.log("🎤 Speech recognition ended", { lastTranscript: lastTranscriptRef.current });
      // Если остался не отправленный текст (например, при ручной остановке)
      if (lastTranscriptRef.current.trim() && stopRequestedRef.current) {
        console.log("🎤 Sending remaining transcript on manual stop:", lastTranscriptRef.current.trim());
        onTranscriptRef.current?.(lastTranscriptRef.current.trim());
      }
      hardResetFlags();
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = (finalTranscript || interimTranscript).trim();
      if (currentText) {
        lastTranscriptRef.current = currentText;
        console.log("🎤 Speech recognition update:", { final: finalTranscript, interim: interimTranscript });
      }

      if (finalTranscript.trim()) {
        console.log("🎤 Speech recognition result (final):", finalTranscript.trim());
        onTranscriptRef.current?.(finalTranscript.trim());
        lastTranscriptRef.current = ""; // Сбрасываем, так как уже отправили финальный
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = (event as any)?.error as VoiceErrorCode;
      const msg = (event as any)?.message as string | undefined;
      console.error("🎤 Speech recognition error:", { code, msg, event });

      if (ignoreErrorsRef.current) return;

      // aborted при stop/blur на iOS — не эскалируем
      if (code === "aborted" && (stopRequestedRef.current || isIOS)) {
        hardResetFlags();
        return;
      }

      hardResetFlags();
      onErrorRef.current?.(code, msg);
    };

    return rec;
  }, [lang, isIOS]);

  // Создаём recognition только при смене lang (а не при каждом рендере)
  useEffect(() => {
    ignoreErrorsRef.current = false;

    // важный reset на маунте эффекта (закрывает "залипания" после HMR/cleanup)
    hardResetFlags();

    const rec = createRecognition();
    if (!rec) return;

    recognitionRef.current = rec;
    setIsSupported(true);

    return () => {
      ignoreErrorsRef.current = true;

      // жёстко сбрасываем флаги здесь, потому что onend/onerror могут не сработать
      hardResetFlags();

      try {
        rec.onstart = null as any;
        rec.onend = null as any;
        rec.onresult = null as any;
        rec.onerror = null as any;
        rec.onaudiostart = null as any;

        // abort достаточно; stop часто даёт лишние aborted
        rec.abort();
      } catch {
        /* no-op */
      } finally {
        recognitionRef.current = null;
      }
    };
  }, [createRecognition]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const rec = recognitionRef.current;
    console.log("🎤 startRecording called, rec exists:", !!rec, "isStarting:", isStartingRef.current, "isRecording:", isRecording);

    if (!rec) {
      console.error("🎤 No recognition instance available");
      onErrorRef.current?.("not-supported", "SpeechRecognition instance отсутствует");
      return false;
    }

    if (isStartingRef.current || isRecording) {
      console.log("🎤 Recording already in progress or starting");
      return false;
    }

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("🎤 MediaDevices API is not available");
      onErrorRef.current?.("not-allowed", "Доступ к микрофону недоступен. Используйте HTTPS или другой браузер.");
      return false;
    }

    // Запрашиваем разрешение на микрофон перед запуском
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Сразу останавливаем поток, нам нужно только разрешение
      stream.getTracks().forEach(track => track.stop());
      console.log("🎤 Microphone permission granted");
    } catch (err: any) {
      console.error("🎤 Microphone permission denied:", err);
      onErrorRef.current?.("not-allowed", "Разрешение на использование микрофона не предоставлено");
      return false;
    }

    try {
      isStartingRef.current = true;
      stopRequestedRef.current = false;

      clearStartTimeout();
      // Увеличиваем таймаут до 3 секунд для медленных устройств
      startTimeoutRef.current = window.setTimeout(() => {
        if (isStartingRef.current && !isRecording) {
          console.warn("🎤 start timeout -> abort + reset");
          try {
            rec.abort();
          } catch {
            /* no-op */
          }
          hardResetFlags();
          onErrorRef.current?.("start-timeout", "onstart не сработал, старт завис");
        }
      }, 3000);

      console.log("🎤 Calling rec.start()");
      rec.start();
      return true;
    } catch (e: any) {
      console.error("🎤 Failed to start recording:", e);
      hardResetFlags();
      onErrorRef.current?.("start-failed", e?.message ?? "Не удалось начать запись голоса");
      return false;
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;

    try {
      stopRequestedRef.current = true;
      clearStartTimeout();
      rec.stop();
    } catch {
      // если stop упал — гарантированно не оставляем isStarting=true
      hardResetFlags();
      try {
        rec.abort();
      } catch {
        /* no-op */
      }
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) stopRecording();
    else await startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return {
    isSupported,
    isRecording,
    isIOS,
    startRecording,
    stopRecording,
    toggleRecording,
  };
};
