export type NoiseType = 'rain' | 'forest' | 'ocean' | 'wind' | 'fire' | 'coffee' | 'night' | 'river';

export interface NoiseProfile {
  id: NoiseType;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export const NOISE_PROFILES: NoiseProfile[] = [
  { id: 'rain', name: '雨声', icon: 'fa-cloud-rain', description: '淅淅沥沥的雨滴声', color: '#60a5fa' },
  { id: 'forest', name: '森林', icon: 'fa-tree', description: '鸟鸣虫唱的自然之声', color: '#34d399' },
  { id: 'ocean', name: '海浪', icon: 'fa-water', description: '海浪拍打沙滩的声音', color: '#38bdf8' },
  { id: 'wind', name: '风声', icon: 'fa-wind', description: '轻柔的风吹过树梢', color: '#94a3b8' },
  { id: 'fire', name: '篝火', icon: 'fa-fire', description: '温暖的柴火噼啪声', color: '#f97316' },
  { id: 'coffee', name: '咖啡厅', icon: 'fa-mug-hot', description: '轻柔的人声与杯碟声', color: '#a78bfa' },
  { id: 'night', name: '夜晚', icon: 'fa-moon', description: '宁静的夏夜虫鸣', color: '#6366f1' },
  { id: 'river', name: '溪流', icon: 'fa-droplet', description: '潺潺流水声', color: '#22d3ee' },
];

class WhiteNoiseService {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseNodes: Map<NoiseType, { gain: GainNode; sources: AudioNode[] }> = new Map();
  private isPlaying: boolean = false;
  private currentMix: Map<NoiseType, number> = new Map();
  private masterVolume: number = 0.5;

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private createBrownNoise(context: AudioContext): AudioNode {
    const bufferSize = 2 * context.sampleRate;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    return source;
  }

  private createPinkNoise(context: AudioContext): AudioNode {
    const bufferSize = 2 * context.sampleRate;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11;
      b6 = white * 0.115926;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    return source;
  }

  private createWhiteNoise(context: AudioContext): AudioNode {
    const bufferSize = 2 * context.sampleRate;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    return source;
  }

  private createNoiseForType(context: AudioContext, type: NoiseType): { sources: AudioNode[]; gain: GainNode } {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain!);

    const sources: AudioNode[] = [];

    switch (type) {
      case 'rain': {
        const noise = this.createPinkNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 4000;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'forest': {
        const base = this.createPinkNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 0.5;
        base.connect(filter);
        filter.connect(gain);
        sources.push(base);
        break;
      }

      case 'ocean': {
        const noise = this.createBrownNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'wind': {
        const noise = this.createBrownNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'fire': {
        const noise = this.createPinkNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 2;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'coffee': {
        const noise = this.createPinkNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        filter.Q.value = 0.3;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'night': {
        const noise = this.createPinkNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }

      case 'river': {
        const noise = this.createWhiteNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 0.8;
        noise.connect(filter);
        filter.connect(gain);
        sources.push(noise);
        break;
      }
    }

    return { sources, gain };
  }

  async startNoise(type: NoiseType, volume: number = 0.5): Promise<void> {
    const context = this.ensureContext();

    if (context.state === 'suspended') {
      await context.resume();
    }

    if (!this.noiseNodes.has(type)) {
      const nodeGroup = this.createNoiseForType(context, type);
      nodeGroup.sources.forEach(s => (s as any)?.start?.());
      this.noiseNodes.set(type, nodeGroup);
    }

    const nodeGroup = this.noiseNodes.get(type)!;
    nodeGroup.gain.gain.setTargetAtTime(volume, context.currentTime, 0.3);
    this.currentMix.set(type, volume);
    this.isPlaying = true;
  }

  stopNoise(type: NoiseType): void {
    const nodeGroup = this.noiseNodes.get(type);
    if (nodeGroup && this.audioContext) {
      nodeGroup.gain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.3);
      this.currentMix.delete(type);
    }

    if (this.currentMix.size === 0) {
      this.isPlaying = false;
    }
  }

  setNoiseVolume(type: NoiseType, volume: number): void {
    const nodeGroup = this.noiseNodes.get(type);
    if (nodeGroup && this.audioContext) {
      nodeGroup.gain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
      if (volume > 0) {
        this.currentMix.set(type, volume);
      } else {
        this.currentMix.delete(type);
      }
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume;
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getCurrentMix(): Map<NoiseType, number> {
    return new Map(this.currentMix);
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  stopAll(): void {
    if (this.audioContext) {
      this.noiseNodes.forEach((nodeGroup) => {
        nodeGroup.gain.gain.setTargetAtTime(0, this.audioContext!.currentTime, 0.3);
      });
    }
    this.currentMix.clear();
    this.isPlaying = false;
  }

  destroy(): void {
    this.stopAll();
    if (this.audioContext) {
      this.noiseNodes.forEach((nodeGroup) => {
        nodeGroup.sources.forEach(s => {
          try {
            (s as any)?.stop?.();
          } catch {
            // ignore
          }
        });
      });
      this.noiseNodes.clear();
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
    }
  }
}

export const whiteNoiseService = new WhiteNoiseService();
