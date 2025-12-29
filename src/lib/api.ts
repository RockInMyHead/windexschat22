// Use relative path for API - works on any domain
export const API_BASE_URL = '/api';
export const TTS_BASE_URL = 'http://localhost:8000';

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

  // === TTS API ===

}

// TTS API Client
class TTSClient {
  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${TTS_BASE_URL}${endpoint}`;

    console.log(`🔗 TTS Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async generateTTS(text: string, options: {
    model?: string;
    voice?: string;
    emotion?: string;
    language?: string;
  } = {}): Promise<{ file_url: string; duration?: number }> {
    return this.request('/tts', {
      method: 'POST',
      body: JSON.stringify({
        text,
        ...options
      }),
    });
  }

  async generateTTSRu(text: string, options: {
    model?: string;
    voice?: string;
    emotion?: string;
  } = {}): Promise<{ file_url: string; duration?: number }> {
    return this.generateTTS(text, {
      model: 'silero_ru',
      language: 'ru',
      ...options
    });
  }

  async generateTTSEn(text: string, options: {
    model?: string;
    voice?: string;
    emotion?: string;
  } = {}): Promise<{ file_url: string; duration?: number }> {
    return this.generateTTS(text, {
      model: 'silero_en',
      language: 'en',
      ...options
    });
  }
}

export const apiClient = new ApiClient();
export const ttsClient = new TTSClient();
