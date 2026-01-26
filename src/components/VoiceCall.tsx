import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '@/lib/utils';

interface VoiceCallProps {
  wsUrl?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onLLMResponse?: (delta: string, isStart: boolean, isEnd: boolean) => void;
  className?: string;
  autoStart?: boolean;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
type CallState = 'idle' | 'active' | 'speaking' | 'listening';

export const VoiceCall: React.FC<VoiceCallProps> = ({
  wsUrl = window.location.protocol === 'https:' 
    ? `wss://${window.location.hostname}/ws-voice/`
    : `ws://${window.location.hostname}:2700`,
  onTranscript,
  onLLMResponse,
  className,
  autoStart = false
}) => {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transcript state
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [llmResponse, setLlmResponse] = useState('');
  const [protocolVersion, setProtocolVersion] = useState(1);
  const backendReadyRef = useRef(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const isPlayingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMutedRef = useRef(false);
  const isLLMRespondingRef = useRef(false);
  const ttsChunkCountRef = useRef(0);
  const isTTSActiveRef = useRef(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([0.3, 0.5, 0.7, 0.5, 0.3]);
  const [isMediaDevicesSupported, setIsMediaDevicesSupported] = useState<boolean | null>(null);
  const audioLevelsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const isAudioPlayingRef = useRef(false);

  // Check MediaDevices API availability on mount
  useEffect(() => {
    const checkMediaDevices = () => {
      const isSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      setIsMediaDevicesSupported(isSupported);
      if (!isSupported) {
        const isHttp = window.location.protocol === 'http:';
        const hostname = window.location.hostname;
        if (isHttp && hostname !== 'localhost' && !hostname.startsWith('127.0.0.1')) {
          setError(`⚠️ Голосовой ввод недоступен на HTTP.\n\nДля работы требуется HTTPS.\nИспользуйте: https://chat.tartihome.online\n\nИли настройте chrome://flags для тестирования.`);
        } else {
          setError('Голосовой ввод недоступен в этом браузере.');
        }
      }
    };
    checkMediaDevices();
  }, []);

  // Sync ref with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Функция для запуска анимации звуковой волны на основе реального аудио
  const startAudioWaveAnimation = useCallback(() => {
    // Очищаем предыдущий интервал и таймаут остановки, если есть
    if (audioLevelsIntervalRef.current) {
      clearInterval(audioLevelsIntervalRef.current);
    }
    if (stopAnimationTimeoutRef.current) {
      clearTimeout(stopAnimationTimeoutRef.current);
      stopAnimationTimeoutRef.current = null;
    }

    // Создаем анимацию на основе реальных данных аудио
    audioLevelsIntervalRef.current = setInterval(() => {
      const analyser = analyserNodeRef.current;
      
      if (analyser && isAudioPlayingRef.current) {
        // Получаем данные частотного анализа
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        // Разбиваем частотный диапазон на 5 полос для 5 баров
        const bands = 5;
        const bandSize = Math.floor(bufferLength / bands);
        const levels: number[] = [];
        
        for (let i = 0; i < bands; i++) {
          let sum = 0;
          const start = i * bandSize;
          const end = start + bandSize;
          
          for (let j = start; j < end; j++) {
            sum += dataArray[j];
          }
          
          // Нормализуем значение от 0 до 1
          const average = sum / bandSize;
          const normalized = average / 255;
          
          // Применяем нелинейное масштабирование для более визуально приятной анимации
          const scaled = Math.pow(normalized, 0.5); // Квадратный корень для более плавной анимации
          
          // Ограничиваем минимальное значение для видимости
          levels.push(Math.max(0.2, Math.min(1.0, scaled * 2)));
        }
        
        setAudioLevels(levels);
      } else {
        // Если аудио не воспроизводится, используем статичные значения
        setAudioLevels([0.3, 0.5, 0.7, 0.5, 0.3]);
      }
    }, 50); // Обновляем каждые 50мс для плавной анимации
  }, []);

  // Функция для плавной остановки анимации
  const stopAudioWaveAnimation = useCallback((delay = 1500) => {
    // Если уже запланирована остановка, не делаем ничего
    if (stopAnimationTimeoutRef.current) return;

    stopAnimationTimeoutRef.current = setTimeout(() => {
      if (audioLevelsIntervalRef.current) {
        clearInterval(audioLevelsIntervalRef.current);
        audioLevelsIntervalRef.current = null;
      }
      setAudioLevels([0.3, 0.5, 0.7, 0.5, 0.3]);
      stopAnimationTimeoutRef.current = null;
    }, delay);
  }, []);

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => {
      if (audioLevelsIntervalRef.current) {
        clearInterval(audioLevelsIntervalRef.current);
      }
      if (stopAnimationTimeoutRef.current) {
        clearTimeout(stopAnimationTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Initialize WebSocket connection
   */
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('connecting');
    
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        setConnectionState('connected');
        
        // Send config
        ws.send(JSON.stringify({
          config: {
            sample_rate: 16000,
            words: false,
            protocol_version: 2
          }
        }));
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          console.log(`📦 Received binary data: ${event.data.byteLength} bytes (TTS active: ${isTTSActiveRef.current}, chunk #${ttsChunkCountRef.current + 1})`);
          // Обрабатываем асинхронно, но не блокируем получение следующих сообщений
          handleBinaryAudio(event.data);
          return;
        }

        try {
          const message = JSON.parse(event.data);
          // Бэкенд может присылать тип в поле 'type' или 'event'
          const msgType = message.type || message.event;
          console.log(`📨 Received message: ${msgType}`, message);
          handleWebSocketMessage({ ...message, type: msgType });
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionState('error');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setConnectionState('disconnected');
        backendReadyRef.current = false;
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnectionState('error');
    }
  }, [wsUrl]);

  /**
   * Handle WebSocket messages
   */
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'partial':
        setPartialTranscript(message.partial || '');
        onTranscript?.(message.partial || '', false);
        setCallState('listening');
        break;

      case 'final':
        if (message.text?.trim()) {
          setFinalTranscript(prev => prev + ' ' + message.text);
          onTranscript?.(message.text, true);
          setPartialTranscript('');
        }
        break;

      case 'nlu_start':
      case 'llm_start':
        if (!isLLMRespondingRef.current) {
          isLLMRespondingRef.current = true;
          setLlmResponse('');
          setCallState('speaking');
          onLLMResponse?.('', true, false); // isStart = true
          // Анимация будет запущена автоматически при воспроизведении аудио
        }
        break;

      case 'llm_delta':
        setLlmResponse(prev => prev + (message.delta || ''));
        onLLMResponse?.(message.delta || '', false, false); // delta chunk
        break;

      case 'nlu_end':
      case 'llm_end':
        isLLMRespondingRef.current = false;
        setCallState('active');
        onLLMResponse?.('', false, true); // isEnd = true
        // Анимация остановится автоматически при окончании воспроизведения аудио
        break;

      case 'llm_error':
        isLLMRespondingRef.current = false;
        console.error('LLM error:', message.error);
        setCallState('active');
        // Уведомляем родительский компонент об ошибке, чтобы удалить незавершенное сообщение
        onLLMResponse?.('', false, true); // isEnd = true, чтобы очистить состояние
        break;

      case 'abort':
        console.log('🛑 Abort received:', message.reason);
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setCallState('active');
        break;

        case 'tts_start':
          console.log('🔊 TTS started');
          isTTSActiveRef.current = true;
          ttsChunkCountRef.current = 0;
          setCallState('speaking');
          // Анимация будет запущена автоматически при воспроизведении аудио
          break;

      case 'tts_end':
        console.log(`🔊 TTS ended (received ${ttsChunkCountRef.current} audio chunks)`);
        isTTSActiveRef.current = false;
        // Анимация остановится автоматически при окончании воспроизведения аудио
        // Не переводим в idle, чтобы звонок не прерывался
        if (protocolVersion < 2) {
          setCallState('active');
        }
        break;

      case 'tts_error':
        console.error('TTS error:', message.error);
        break;

      case 'tts_audio':
        // Это метаданные перед бинарным аудио-чанком
        // Следующий бинарный фрейм будет содержать аудио
        console.log(`🎵 TTS audio metadata: utterance_id=${message.utterance_id}, mime=${message.mime}`);
        // Не нужно ничего делать, просто ждем бинарные данные
        break;

      case 'ready':
        console.log('✅ Backend ready', message);
        if (message.protocol_version) {
          setProtocolVersion(message.protocol_version);
        }
        backendReadyRef.current = true;
        console.log('✅ Ready received, can start sending PCM');
        break;

      case 'pong':
        // Keep-alive response
        break;

      case 'asr_tentative_pause':
        // Игнорируем или используем для индикации "пользователь замолчал"
        console.log('🔇 User paused (tentative)');
        break;

      case 'metric':
        // Метрики от бэкенда (латенси и т.д.)
        if (message.metrics) {
          console.log('📊 Metrics:', message.metrics);
        }
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, [onTranscript, onLLMResponse]);

  /**
   * Play audio chunk using AudioContext for better reliability
   */
  const playNextAudio = useCallback(async () => {
    // Создаем отдельный AudioContext для воспроизведения, если его нет
    if (!playbackAudioContextRef.current) {
      try {
        // Используем нативный sample rate устройства для лучшего качества на iPhone
        const nativeSampleRate = new AudioContext().sampleRate;
        playbackAudioContextRef.current = new AudioContext({ sampleRate: nativeSampleRate });
        console.log(`✅ Created playback AudioContext with native sample rate: ${nativeSampleRate}Hz`);
      } catch (error) {
        console.error('❌ Failed to create playback AudioContext:', error);
        isPlayingRef.current = false;
        return;
      }
    }

     const playbackCtx = playbackAudioContextRef.current;

     if (audioQueueRef.current.length === 0) {
       isPlayingRef.current = false;
      isAudioPlayingRef.current = false;
      stopAudioWaveAnimation(500); // Плавная остановка анимации
       return;
     }
 
     isPlayingRef.current = true;
     const wavBytes = audioQueueRef.current.shift()!;
     
     try {
       // Проверяем состояние AudioContext
       console.log(`🎵 AudioContext state before: ${playbackCtx.state}`);
       
       if (playbackCtx.state === 'suspended') {
         await playbackCtx.resume();
         console.log(`✅ Resumed playback AudioContext, new state: ${playbackCtx.state}`);
       }

      if (playbackCtx.state === 'closed') {
        console.error('❌ Playback AudioContext is closed, recreating...');
        // Используем нативный sample rate устройства для лучшего качества на iPhone
        const nativeSampleRate = new AudioContext().sampleRate;
        playbackAudioContextRef.current = new AudioContext({ sampleRate: nativeSampleRate });
        console.log(`✅ Recreated playback AudioContext with native sample rate: ${nativeSampleRate}Hz`);
        return playNextAudio();
      }

       // Убеждаемся, что контекст в состоянии 'running'
       if (playbackCtx.state !== 'running') {
         console.warn(`⚠️ AudioContext not running (state: ${playbackCtx.state}), attempting to resume...`);
         await playbackCtx.resume();
       }

       // Декодируем WAV данные
       const audioData = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength);
       console.log(`🎵 Decoding audio: ${audioData.byteLength} bytes`);
       const audioBuffer = await playbackCtx.decodeAudioData(audioData as ArrayBuffer);
       console.log(`✅ Audio decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels, ${audioBuffer.sampleRate}Hz`);
       
       const source = playbackCtx.createBufferSource();
       source.buffer = audioBuffer;
      
      // Создаем AnalyserNode для анализа аудио в реальном времени
      // Важно: создаем в том же AudioContext, что и source
      // Если AnalyserNode был создан в другом контексте, пересоздаем его
      if (!analyserNodeRef.current || analyserNodeRef.current.context !== playbackCtx) {
        analyserNodeRef.current = playbackCtx.createAnalyser();
        analyserNodeRef.current.fftSize = 256; // Размер FFT для анализа
        analyserNodeRef.current.smoothingTimeConstant = 0.8; // Сглаживание для плавной анимации
      }
       
       // Создаем GainNode для контроля громкости
       const gainNode = playbackCtx.createGain();
       gainNode.gain.value = 1.0; // Полная громкость
      
      // Подключаем цепочку: source -> gain -> analyser -> destination
       source.connect(gainNode);
      gainNode.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(playbackCtx.destination);
      
      // Запускаем анимацию при начале воспроизведения
      isAudioPlayingRef.current = true;
      startAudioWaveAnimation();
       
       source.onended = () => {
         console.log('✅ Audio chunk playback ended');
        // Если очередь пуста, останавливаем анимацию
        if (audioQueueRef.current.length === 0) {
          isAudioPlayingRef.current = false;
          stopAudioWaveAnimation(500); // Плавная остановка через 500мс
        }
         playNextAudio();
       };
 
       source.start(0);
       console.log(`🔊 Audio playback started! State: ${playbackCtx.state}, Duration: ${audioBuffer.duration.toFixed(2)}s`);
     } catch (error) {
       console.error('❌ Audio playback error:', error);
       playNextAudio();
     }
   }, []);

  /**
   * Play audio chunk
   */
  const playAudioChunk = useCallback((wavBytes: Uint8Array) => {
    audioQueueRef.current.push(wavBytes);
    if (!isPlayingRef.current) {
      playNextAudio();
    }
  }, [playNextAudio]);

  /**
   * Handle binary audio data from server (TTS)
   */
  const handleBinaryAudio = useCallback((data: ArrayBuffer) => {
    try {
      const buffer = new Uint8Array(data);
      let wavBytes: Uint8Array;
 
      // Проверяем наличие заголовка AUD0 (протокол v1)
      const isV1 = buffer.length > 14 && 
                   buffer[0] === 65 && buffer[1] === 85 && 
                   buffer[2] === 68 && buffer[3] === 48; // "AUD0"

      if (isV1) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const payloadLen = view.getUint32(10, true);
        wavBytes = buffer.slice(14, 14 + payloadLen);
      } else {
        // Если нет заголовка AUD0, считаем что это чистый WAV (протокол v2)
        wavBytes = buffer;
      }
 
      if (wavBytes.length > 0) {
        ttsChunkCountRef.current++;
        console.log(`📥 Processed audio chunk #${ttsChunkCountRef.current}: ${wavBytes.length} bytes (protocol: ${isV1 ? 'v1' : 'v2'}, TTS active: ${isTTSActiveRef.current})`);
      }

      if (audioEnabled && wavBytes.length > 0) {
        setCallState('speaking');
        console.log(`🎵 Adding to playback queue (queue length: ${audioQueueRef.current.length}, total chunks: ${ttsChunkCountRef.current})`);
        playAudioChunk(wavBytes);
      } else if (!audioEnabled) {
        console.log('🔇 Audio disabled, skipping playback');
      } else {
        console.warn('⚠️ Empty audio chunk received');
      }
    } catch (error) {
      console.error('❌ Error parsing binary audio:', error);
    }
  }, [audioEnabled, playAudioChunk]);

  /**
   * Start voice call
   */
  const startCall = useCallback(async () => {
    if (isStartingRef.current || callState !== 'idle') {
      console.log('⚠️ Call already starting or active, skipping startCall');
      return;
    }

    isStartingRef.current = true;
    try {
      // Connect WebSocket if not connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        
        // Wait for WebSocket connection (max 5 seconds)
        let attempts = 0;
        while (attempts < 50 && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket connection timeout');
        }
        
        // Wait for backend ready (max 5 seconds)
        attempts = 0;
        while (attempts < 50 && !backendReadyRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!backendReadyRef.current) {
          throw new Error('Backend not ready (timeout)');
        }
      } else {
        // WebSocket connected, but check if backend is ready
        if (!backendReadyRef.current) {
          // Wait for backend ready (max 3 seconds)
          let attempts = 0;
          while (attempts < 30 && !backendReadyRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          if (!backendReadyRef.current) {
            throw new Error('Backend not ready');
          }
        }
      }

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not available. Please use HTTPS or a browser that supports microphone access.');
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      streamRef.current = stream;

      // Create AudioContext with native sample rate (browsers may not support 16kHz)
      // We'll resample to 16kHz in the AudioWorklet
      const nativeSampleRate = new AudioContext().sampleRate;
      const audioContext = new AudioContext({ sampleRate: nativeSampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Load AudioWorklet with error handling
      try {
        console.log('📦 Loading AudioWorklet module...');
        // Use unique URL to bypass cache
        await audioContext.audioWorklet.addModule(`/audioWorklet.js?v=${Date.now()}`);
        console.log('✅ AudioWorklet module loaded successfully');
        
        // Ensure AudioContext is running before creating nodes
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('✅ AudioContext resumed');
        }
        
        // Small delay to ensure processor is registered
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('🔧 Creating AudioWorkletNode...');
        const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
        workletNodeRef.current = workletNode;
        console.log('✅ AudioWorkletNode created successfully');
      } catch (workletError: any) {
        console.error('❌ AudioWorklet error:', workletError);
        throw new Error(`Failed to load AudioWorklet: ${workletError.message}. Make sure audioWorklet.js is accessible at /audioWorklet.js`);
      }

      // Initialize worklet with actual sample rate
      workletNode.port.postMessage({
        type: 'init',
        sampleRate: audioContext.sampleRate
      });

      // Handle PCM data from worklet
      workletNode.port.onmessage = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.warn('⚠️ WebSocket not ready, skipping PCM');
          return;
        }
        if (!backendReadyRef.current) {
          // Не логируем слишком часто, чтобы не спамить
          if (Math.random() < 0.01) {
            console.warn('⚠️ Backend not ready yet, skipping PCM');
          }
          return;
        }
        if (isMutedRef.current) {
          // Skip sending if muted
          return;
        }

        const { pcm } = event.data;
        if (pcm && pcm.byteLength > 0) {
          // Логируем только первые несколько пакетов, чтобы не засорять консоль
          if (Math.random() < 0.01) { // ~1% пакетов
            console.log(`📤 Sending PCM: ${pcm.byteLength} bytes`);
          }
          wsRef.current.send(pcm);
        } else {
          console.warn('⚠️ Empty PCM data');
        }
      };

      source.connect(workletNode);
      
      // Создаем и активируем AudioContext для воспроизведения заранее
      if (!playbackAudioContextRef.current) {
        try {
          // Используем нативный sample rate устройства для лучшего качества на iPhone
          const nativeSampleRate = new AudioContext().sampleRate;
          playbackAudioContextRef.current = new AudioContext({ sampleRate: nativeSampleRate });
          // Активируем контекст сразу при старте звонка (user interaction уже есть)
          if (playbackAudioContextRef.current.state === 'suspended') {
            await playbackAudioContextRef.current.resume();
          }
          console.log(`✅ Playback AudioContext created and activated: ${playbackAudioContextRef.current.state}, sample rate: ${nativeSampleRate}Hz`);
        } catch (error) {
          console.error('⚠️ Failed to create playback AudioContext:', error);
        }
      }
      
      setCallState('active');
      console.log('✅ Voice call started');
      console.log('🎤 Microphone stream active, worklet connected');
      console.log(`📊 Stream settings: ${stream.getAudioTracks()[0]?.getSettings()?.sampleRate}Hz`);
    } catch (error: any) {
      console.error('Failed to start call:', error);
      let errorMessage = 'Не удалось запустить голосовой звонок.';
      
      if (error?.message?.includes('MediaDevices API')) {
        const isHttp = window.location.protocol === 'http:';
        const hostname = window.location.hostname;
        errorMessage = isHttp 
          ? `⚠️ Для работы голосового ввода требуется HTTPS.\n\nИспользуйте домен с SSL:\nhttps://chat.tartihome.online\n\nИли настройте HTTPS для ${hostname}`
          : 'Доступ к микрофону недоступен. Используйте браузер с поддержкой MediaDevices API.';
      } else if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен.';
      } else if (error?.message) {
        errorMessage = `Ошибка: ${error.message}`;
      }
      
      setError(errorMessage);
    } finally {
      isStartingRef.current = false;
    }
  }, [connectWebSocket]); // Removed isMuted from deps

  /**
   * Stop voice call
   */
  const stopCall = useCallback(() => {
    try {
      // Send EOF to server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ eof: 1 }));
      }

      // Stop microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Disconnect worklet
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }

      // Close AudioContext for recording
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Close AudioContext for playback
      if (playbackAudioContextRef.current) {
        playbackAudioContextRef.current.close();
        playbackAudioContextRef.current = null;
      }

      // Clear audio queue
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      setCallState('idle');
      setPartialTranscript('');
      console.log('✅ Voice call stopped');
    } catch (error) {
      console.error('Error stopping call:', error);
    }
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    if (autoStart) {
      startCall();
    }
    return () => {
      stopCall();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className={cn('p-4 space-y-4 bg-background/95 backdrop-blur border-primary/20 shadow-lg animate-in fade-in zoom-in duration-300', className)}>
      {/* Connection Status & Call State */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            connectionState === 'connected' && 'animate-pulse',
            connectionState === 'connecting' && 'bg-yellow-500',
            connectionState === 'disconnected' && 'bg-gray-400',
            connectionState === 'error' && 'bg-red-500'
          )} style={connectionState === 'connected' ? { backgroundColor: '#1e983a' } : {}} />
          <span className="text-xs font-medium text-muted-foreground">
            {connectionState === 'connected' && 'AI на связи'}
            {connectionState === 'connecting' && 'Подключение...'}
            {connectionState === 'disconnected' && 'Ожидание'}
            {connectionState === 'error' && 'Ошибка'}
          </span>
        </div>

      </div>

      {/* Main Controls - simplified */}
      <div className="flex items-center justify-center gap-3">
        {isMediaDevicesSupported === false ? (
          <div className="w-full text-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Голосовой ввод недоступен на HTTP
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Используйте HTTPS для доступа к микрофону
            </p>
          </div>
        ) : callState === 'idle' ? (
          <Button
            size="lg"
            onClick={startCall}
            disabled={connectionState === 'connecting' || isMediaDevicesSupported === false}
            className="rounded-full w-full py-6 gap-3 text-lg font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <Phone className="w-6 h-6" />
            Начать звонок
          </Button>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <Button
              size="icon"
              variant="destructive"
              onClick={stopCall}
              className="rounded-full h-12 w-12 shrink-0 shadow-md hover:shadow-lg transition-all"
              title="Завершить звонок"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>

            <div className="flex-1 h-12 bg-secondary/50 rounded-full flex items-center px-4 overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {callState === 'speaking' ? (
                  <div className="flex gap-1 items-center justify-center h-8">
                    {audioLevels.map((level, index) => {
                      // Вычисляем высоту на основе уровня (от 8px до 32px)
                      const height = 8 + level * 24;
                      // Базовые задержки для плавной анимации
                      const delay = index * 0.1;
                      return (
                        <div
                          key={index}
                          className="w-1 bg-primary/70 rounded-full transition-all duration-100 ease-out"
                          style={{
                            height: `${height}px`,
                            minHeight: '8px',
                            maxHeight: '32px',
                            animationDelay: `${delay}s`,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex gap-1 items-center justify-center opacity-30 h-8">
                    <div className="w-1 h-4 bg-primary/50 rounded-full" />
                    <div className="w-1 h-6 bg-primary/50 rounded-full" />
                    <div className="w-1 h-8 bg-primary/50 rounded-full" />
                    <div className="w-1 h-6 bg-primary/50 rounded-full" />
                    <div className="w-1 h-4 bg-primary/50 rounded-full" />
                  </div>
                )}
              </div>
            </div>

            <Button
              size="icon"
              variant={isMuted ? 'secondary' : 'outline'}
              onClick={() => setIsMuted(!isMuted)}
              className={cn("rounded-full h-10 w-10 shrink-0 transition-all", isMuted && "bg-red-100 text-red-600 border-red-200")}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            
            <Button
              size="icon"
              variant={audioEnabled ? 'outline' : 'secondary'}
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="rounded-full h-10 w-10 shrink-0 transition-all"
              title={audioEnabled ? 'Выключить звук' : 'Включить звук'}
            >
              {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-500 text-center bg-red-50 p-3 rounded border border-red-100 whitespace-pre-line">
          {error}
        </div>
      )}
    </Card>
  );
};

export default VoiceCall;
