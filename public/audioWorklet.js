/**
 * PCM Processor AudioWorklet
 * 
 * Converts browser audio (48kHz float32) to PCM 16-bit mono 16kHz
 * for real-time speech recognition with Vosk.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Resampling buffer for 16kHz -> 16kHz conversion (default)
    this.resampleBuffer = [];
    this.targetSampleRate = 16000;
    this.inputSampleRate = 16000; // Default matches our AudioContext
    this.resampleRatio = 1; 
    this.resamplePhase = 0;
    this.isInitialized = false;
    
    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.initialize(event.data.sampleRate);
      }
    };
    
    // Output buffer for 20ms chunks (320 samples @ 16kHz)
    this.outputBuffer = [];
    this.targetChunkSize = 320; // 20ms @ 16kHz
  }

  /**
   * Initialize resampling parameters based on actual sample rate
   */
  initialize(sampleRate) {
    this.inputSampleRate = sampleRate;
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    this.isInitialized = true;
    console.log(`[AudioWorklet] Initialized: input=${this.inputSampleRate}Hz, target=${this.targetSampleRate}Hz, ratio=${this.resampleRatio}`);
  }

  /**
   * Convert float32 [-1, 1] to int16 [-32768, 32767]
   */
  floatToInt16(float) {
    const s = Math.max(-1, Math.min(1, float));
    return s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  /**
   * Resampling using simple decimation/interpolation
   */
  resample(input) {
    if (this.resampleRatio === 1) {
      return input;
    }

    const output = [];
    
    for (let i = 0; i < input.length; i++) {
      if (this.resamplePhase <= 0) {
        output.push(input[i]);
        this.resamplePhase += this.resampleRatio;
      }
      this.resamplePhase -= 1;
    }
    
    return output;
  }

  /**
   * Process audio in 128-sample chunks (AudioWorklet quantum)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!input || !input[0]) {
      return true;
    }

    // Initialize on first process if not done
    if (!this.isInitialized) {
      // AudioWorklet Global scope doesn't have easy access to sampleRate
      // but we can infer it or receive it via port.
      // For now, let's assume if it's not 16000, it's 48000 or 44100
      // Actually, we can pass it from VoiceCall.tsx
    }

    // Get mono channel (or mix if stereo)
    const channelData = input[0];
    
    // Resample to 16kHz
    const resampled = this.resample(channelData);
    
    // Add to output buffer
    for (let i = 0; i < resampled.length; i++) {
      this.outputBuffer.push(resampled[i]);
      
      // When we have 320 samples (20ms @ 16kHz), send to main thread
      if (this.outputBuffer.length >= this.targetChunkSize) {
        this.sendChunk();
      }
    }
    
    return true;
  }

  /**
   * Handle messages from main thread
   */
  static get parameterDescriptors() {
    return [];
  }

  onmessage(event) {
    if (event.data.type === 'init') {
      this.initialize(event.data.sampleRate);
    }
  }

  /**
   * Send 20ms PCM chunk to main thread
   */
  sendChunk() {
    // Convert float32 to int16 PCM
    const int16Array = new Int16Array(this.targetChunkSize);
    
    for (let i = 0; i < this.targetChunkSize; i++) {
      int16Array[i] = this.floatToInt16(this.outputBuffer[i]);
    }
    
    // Calculate average absolute value for simple VAD
    let sum = 0;
    for (let i = 0; i < this.targetChunkSize; i++) {
      sum += Math.abs(this.outputBuffer[i]);
    }
    const avgAbs = sum / this.targetChunkSize;
    
    // Send to main thread
    this.port.postMessage({
      pcm: int16Array.buffer,
      avgAbs: avgAbs,
      sampleRate: 16000,
      length: this.targetChunkSize
    }, [int16Array.buffer]);
    
    // Clear output buffer
    this.outputBuffer = [];
  }
}

// Register the processor
registerProcessor('pcm-processor', PCMProcessor);
