// API base URL - always use current origin for browser environment
const getApiBaseUrl = () => {
  // Для браузерной среды всегда используем текущий origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }

  // Для продакшена используем переменную окружения
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Fallback для server-side rendering
  return 'https://ai.windexs.ru/api';
};

export const API_BASE_URL = getApiBaseUrl();

// Proxy configuration
const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'socks5://7BwWCS:BBBvb6@185.68.186.158:8000';

// Create proxy agent for fetch
const createProxyFetch = () => {
  if (typeof window !== 'undefined') {
    // Browser environment - use native fetch
    return fetch;
  }

  // Node.js environment - use proxy agent
  try {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    const { HttpsProxyAgent } = require('https-proxy-agent');

    if (PROXY_URL.startsWith('socks')) {
      const agent = new SocksProxyAgent(PROXY_URL);
      return (url: RequestInfo | URL, options?: RequestInit) => {
        return fetch(url, {
          ...options,
          // @ts-ignore - agent is not in standard fetch options
          agent
        });
      };
    } else {
      const agent = new HttpsProxyAgent(PROXY_URL);
      return (url: RequestInfo | URL, options?: RequestInit) => {
        return fetch(url, {
          ...options,
          // @ts-ignore - agent is not in standard fetch options
          agent
        });
      };
    }
  } catch (error) {
    console.warn('Proxy agent not available, using regular fetch:', error);
    return fetch;
  }
};

const proxyFetch = createProxyFetch();

export interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  artifactId?: number;
}

export interface ChatSession {
  id?: number;
  title: string;
  created_at: number;
  updated_at: number;
  messageCount?: number;
}

export interface Artifact {
  id?: number;
  sessionId: number;
  type: 'website';
  title: string;
  files: Record<string, string>;
  deps?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    console.log(`🔗 API Request: ${options.method || 'GET'} ${endpoint}`);

    const response = await fetch(url, {
      ...options,
      credentials: "include", // Включаем cookies для сессий
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API request failed: ${response.status} ${text || response.statusText}`);
    }

    return response.json();
  }

  // Создать новую сессию чата
  async createSession(title: string = 'Новый чат'): Promise<{ sessionId: number }> {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  // Получить все сессии
  async getAllSessions(): Promise<ChatSession[]> {
    return this.request('/sessions');
  }

  // Получить сообщения сессии
  async getMessages(sessionId: number): Promise<Message[]> {
    return this.request(`/sessions/${sessionId}/messages`);
  }

  // Удалить сообщение
  async deleteMessage(messageId: number): Promise<{ success: boolean }> {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  // Обновить сообщение
  async updateMessage(messageId: number, content: string): Promise<{ success: boolean; message: Message }> {
    try {
      console.log(`✏️ API: updateMessage called`, { messageId, contentLength: content.length });
      const result = await this.request<{ success: boolean; message: Message }>(`/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      console.log(`✏️ API: updateMessage response`, result);
      return result;
    } catch (error) {
      console.error(`❌ API: updateMessage failed`, error);
      throw error;
    }
  }

  // Сохранить сообщение
  async saveMessage(sessionId: number, role: 'user' | 'assistant', content: string, artifactId?: number | null): Promise<{ messageId: number }> {
    const sid = Number(sessionId);
    // локальная валидация — не посылаем мусор на сервер
    if (!Number.isFinite(sid) || sid <= 0) throw new Error("Invalid sessionId in saveMessage");
    if (!role) throw new Error("Missing role in saveMessage");
    if (!content || !content.trim()) throw new Error("Missing content in saveMessage");

    return this.request('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // ✅ принудительно
      body: JSON.stringify({
        sessionId: sid,                               // ✅ имя ключа как на сервере
        role,
        content,
        artifactId: artifactId ?? null,
      }),
    });
  }

  // Обновить заголовок сессии
  async updateSessionTitle(sessionId: number, title: string): Promise<{ success: boolean }> {
    return this.request(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  // Удалить сессию
  async deleteSession(sessionId: number): Promise<{ success: boolean }> {
    return this.request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }

  // Generic GET method
  async get<T>(endpoint: string): Promise<T> {
    return this.request(endpoint);
  }

  // Generic POST method
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Получить информацию о текущем пользователе
  me() {
    return this.request("/me");
  }

  // Выйти из системы
  logout() {
    return this.request("/logout", { method: "POST" });
  }

  // === Artifacts API ===

  // Создать артефакт
  async createArtifact(
    sessionId: number,
    type: 'website',
    title: string,
    files: Record<string, string>,
    deps?: Record<string, string>
  ): Promise<{ artifactId: number }> {
    return this.request('/artifacts', {
      method: 'POST',
      body: JSON.stringify({ sessionId, type, title, files, deps }),
    });
  }

  // Получить артефакт по ID
  async getArtifact(artifactId: number): Promise<Artifact> {
    console.log("🔍 GET artifact artifactId:", artifactId);
    return this.request(`/artifacts/${artifactId}`);
  }

  // Обновить артефакт
  async updateArtifact(
    artifactId: number,
    title: string,
    files: Record<string, string>,
    deps?: Record<string, string>
  ): Promise<{ success: boolean }> {
    return this.request(`/artifacts/${artifactId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, files, deps }),
    });
  }

  // Получить все артефакты сессии
  async getArtifactsBySession(sessionId: number): Promise<Artifact[]> {
    return this.request(`/sessions/${sessionId}/artifacts`);
  }

  // === АРТЕФАКТЫ: РЕДАКТИРОВАНИЕ САЙТА ===

  async editWebsiteArtifact(
    artifactId: number,
    instruction: string,
    model: string,
    requestId: string
  ): Promise<{ artifact: { title: string; files: Record<string, string>; deps?: Record<string, string> }; assistantText: string }> {
    return this.request(`/artifacts/${artifactId}/edit`, {
      method: "POST",
      body: JSON.stringify({
        instruction,
        model,
        requestId,
        requestType: "website_generation",
        max_tokens: 4000, // PATCH ответы могут быть длинными при сложных изменениях
        temperature: 0.2,
        // Для редактирования response_format передается только если нужен
      }),
    });
  }

  // Сгенерировать резюме чата
  async generateSummary(sessionId: number): Promise<string> {
    const result = await this.request<{ summary: string }>(`/sessions/${sessionId}/summary`, {
      method: 'POST',
    });
    return result.summary;
  }

}

// OpenAI TTS клиент
class OpenAITTSClient {
  private apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";

  async generateTTS(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    try {
      const response = await proxyFetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'tts-1',
          input: text,
          voice: options.voice || 'alloy',
          speed: options.speed || 1.0,
          response_format: 'mp3'
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI TTS API error: ${response.status} ${error}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return {
        audioUrl,
        duration: undefined // OpenAI не возвращает длительность
      };
    } catch (error) {
      console.error('OpenAI TTS error:', error);
      throw error;
    }
  }

  async generateTTSRu(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    return this.generateTTS(text, {
      model: options.model || 'tts-1',
      voice: 'alloy', // Можно использовать разные голоса для разных языков
      speed: options.speed || 1.0,
      ...options
    });
  }

  async generateTTSEn(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    return this.generateTTS(text, {
      model: options.model || 'tts-1',
      voice: 'alloy',
      speed: options.speed || 1.0,
      ...options
    });
  }
}

// Локальный TTS клиент (использует Silero TTS через Node.js API)
class LocalTTSClient {
  // Используем endpoint в Node.js сервере для генерации Silero TTS
  private baseUrl = '/api/tts';

  async generateTTS(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    try {
      // Улучшенное определение языка:
      // 1. Если есть кириллица - русский (даже если есть английский или цифры)
      // 2. Если только английские буквы (без кириллицы) - английский
      // 3. По умолчанию русский (для цифр, знаков препинания, смешанного текста)
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error('Empty text provided for TTS');
      }
      
      const hasCyrillic = /[а-яё]/i.test(trimmed);
      const hasEnglish = /[a-z]/i.test(trimmed);
      const isOnlyEnglish = hasEnglish && !hasCyrillic;
      
      const model = options.model || (isOnlyEnglish ? 'silero_en' : 'silero_ru');
      const voice = options.voice || (isOnlyEnglish ? 'en_0' : 'eugene');
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model: model,
          voice: voice,
          speed: options.speed || 1.0,
          emotion: 'neutral'
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Silero TTS API error: ${response.status} ${error}`);
      }

      // Silero TTS Service возвращает WAV файл напрямую
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      console.log('✅ Silero TTS: сгенерирована речь, размер:', audioBlob.size, 'байт');

      return {
        audioUrl,
        duration: undefined
      };
    } catch (error) {
      console.error('❌ Silero TTS error:', error);
      throw error;
    }
  }

  async generateTTSRu(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    console.log('🔊 Silero TTS generateTTSRu called with:', { text: text.substring(0, 50), options });
    return this.generateTTS(text, {
      model: options.model || 'silero_ru',
      voice: options.voice || 'eugene',
      speed: options.speed || 1.0,
      ...options
    });
  }

  async generateTTSEn(text: string, options: {
    model?: string;
    voice?: string;
    speed?: number;
  } = {}): Promise<{ audioUrl: string; duration?: number }> {
    console.log('🔊 Silero TTS generateTTSEn called with:', { text: text.substring(0, 50), options });
    return this.generateTTS(text, {
      model: options.model || 'silero_en',
      voice: options.voice || 'en_0',
      speed: options.speed || 1.0,
      ...options
    });
  }
}

// Функция выбора TTS клиента
export function createTTSClient(useLocal: boolean = false) {
  return useLocal ? new LocalTTSClient() : new OpenAITTSClient();
}

// По умолчанию используем OpenAI TTS
export const ttsClient = new OpenAITTSClient();

// Экспортируем клиентов для явного использования
export const openAITTSClient = new OpenAITTSClient();
export const localTTSClient = new LocalTTSClient();

export const apiClient = new ApiClient();
