/**
 * PCM Processor AudioWorklet
 * 
 * Converts browser audio to PCM 16-bit mono 16kHz
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.resampleBuffer = [];
    this.targetSampleRate = 16000;
    this.inputSampleRate = 16000; 
    this.resampleRatio = 1; 
    this.resamplePhase = 0;
    this.isInitialized = false;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.inputSampleRate = event.data.sampleRate || 16000;
        this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
        this.isInitialized = true;
        console.log(`[AudioWorklet] Initialized: input=${this.inputSampleRate}Hz, target=${this.targetSampleRate}Hz`);
      }
    };
    
    this.outputBuffer = [];
    this.targetChunkSize = 320; // 20ms @ 16kHz
  }

  floatToInt16(float) {
    const s = Math.max(-1, Math.min(1, float));
    return s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  resample(input) {
    if (this.resampleRatio === 1) return input;
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

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || !this.isInitialized) return true;

    const channelData = input[0];
    const resampled = this.resample(channelData);
    
    for (let i = 0; i < resampled.length; i++) {
      this.outputBuffer.push(resampled[i]);
      if (this.outputBuffer.length >= this.targetChunkSize) {
        this.sendChunk();
      }
    }
    return true;
  }

  sendChunk() {
    const int16Array = new Int16Array(this.targetChunkSize);
    let sum = 0;
    for (let i = 0; i < this.targetChunkSize; i++) {
      const val = this.outputBuffer[i];
      int16Array[i] = this.floatToInt16(val);
      sum += Math.abs(val);
    }
    
    this.port.postMessage({
      pcm: int16Array.buffer,
      avgAbs: sum / this.targetChunkSize,
      sampleRate: 16000,
      length: this.targetChunkSize
    }, [int16Array.buffer]);
    
    this.outputBuffer = [];
  }
}

registerProcessor('pcm-processor', PCMProcessor);
