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
  wsUrl = 'ws://127.0.0.1:2700',
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

  // Sync ref with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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
        break;

      case 'llm_error':
        isLLMRespondingRef.current = false;
        console.error('LLM error:', message.error);
        setCallState('active');
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
          break;

      case 'tts_end':
        console.log(`🔊 TTS ended (received ${ttsChunkCountRef.current} audio chunks)`);
        isTTSActiveRef.current = false;
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
         playbackAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
         console.log('✅ Created playback AudioContext');
       } catch (error) {
         console.error('❌ Failed to create playback AudioContext:', error);
         isPlayingRef.current = false;
         return;
       }
     }

     const playbackCtx = playbackAudioContextRef.current;

     if (audioQueueRef.current.length === 0) {
       isPlayingRef.current = false;
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
         playbackAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
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
       
       // Создаем GainNode для контроля громкости
       const gainNode = playbackCtx.createGain();
       gainNode.gain.value = 1.0; // Полная громкость
       source.connect(gainNode);
       gainNode.connect(playbackCtx.destination);
       
       source.onended = () => {
         console.log('✅ Audio chunk playback ended');
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

      // Create AudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Load AudioWorklet
      await audioContext.audioWorklet.addModule('/audioWorklet.js');
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      workletNodeRef.current = workletNode;

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
          playbackAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
          // Активируем контекст сразу при старте звонка (user interaction уже есть)
          if (playbackAudioContextRef.current.state === 'suspended') {
            await playbackAudioContextRef.current.resume();
          }
          console.log(`✅ Playback AudioContext created and activated: ${playbackAudioContextRef.current.state}`);
        } catch (error) {
          console.error('⚠️ Failed to create playback AudioContext:', error);
        }
      }
      
      setCallState('active');
      console.log('✅ Voice call started');
      console.log('🎤 Microphone stream active, worklet connected');
      console.log(`📊 Stream settings: ${stream.getAudioTracks()[0]?.getSettings()?.sampleRate}Hz`);
    } catch (error) {
      console.error('Failed to start call:', error);
      setError('Не удалось запустить голосовой звонок. Проверьте доступ к микрофону.');
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
            connectionState === 'connected' && 'bg-green-500 animate-pulse',
            connectionState === 'connecting' && 'bg-yellow-500',
            connectionState === 'disconnected' && 'bg-gray-400',
            connectionState === 'error' && 'bg-red-500'
          )} />
          <span className="text-xs font-medium text-muted-foreground">
            {connectionState === 'connected' && 'AI на связи'}
            {connectionState === 'connecting' && 'Подключение...'}
            {connectionState === 'disconnected' && 'Ожидание'}
            {connectionState === 'error' && 'Ошибка'}
          </span>
        </div>

        {callState !== 'idle' && (
          <div className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary animate-pulse">
            {callState === 'active' && '🎤 Говорите'}
            {callState === 'listening' && '👂 Слушаю...'}
            {callState === 'speaking' && '🗣️ AI отвечает'}
          </div>
        )}
      </div>

      {/* Main Controls - simplified */}
      <div className="flex items-center justify-center gap-3">
        {callState === 'idle' ? (
          <Button
            size="lg"
            onClick={startCall}
            disabled={connectionState === 'connecting'}
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
                  <div className="flex gap-1 items-center justify-center">
                    <div className="w-1 h-4 bg-primary/50 rounded-full animate-wave" />
                    <div className="w-1 h-6 bg-primary/50 rounded-full animate-wave [animation-delay:0.1s]" />
                    <div className="w-1 h-8 bg-primary/50 rounded-full animate-wave [animation-delay:0.2s]" />
                    <div className="w-1 h-6 bg-primary/50 rounded-full animate-wave [animation-delay:0.3s]" />
                    <div className="w-1 h-4 bg-primary/50 rounded-full animate-wave [animation-delay:0.4s]" />
                  </div>
                ) : partialTranscript ? (
                  <p className="text-sm text-foreground truncate italic">
                    {partialTranscript}
                  </p>
                ) : (
                  <div className="flex gap-1 items-center justify-center opacity-30">
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
        <div className="text-xs text-red-500 text-center bg-red-50 p-2 rounded border border-red-100">
          {error}
        </div>
      )}
    </Card>
  );
};

export default VoiceCall;
