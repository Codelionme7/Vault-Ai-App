/**
 * Web Audio mixing. Combines multiple input streams (tab + mic) into a single
 * mixed-down stream for the "mixed" channel, while the originals are recorded
 * separately for dual-channel capture. Also exposes an AnalyserNode per input
 * so the dashboard can show independent level meters.
 */
export interface MixerTap {
  analyser: AnalyserNode;
  label: string;
}

export class AudioMixer {
  readonly context: AudioContext;
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly taps = new Map<string, MixerTap>();
  private readonly sources: MediaStreamAudioSourceNode[] = [];

  constructor(context?: AudioContext) {
    this.context = context ?? new AudioContext({ sampleRate: 48_000 });
    this.destination = this.context.createMediaStreamDestination();
  }

  /**
   * Route a stream into the mix and create an analyser tap for metering.
   * Returns the analyser so callers can poll levels.
   */
  addInput(label: string, stream: MediaStream, gain = 1): AnalyserNode {
    const source = this.context.createMediaStreamSource(stream);
    const gainNode = this.context.createGain();
    gainNode.gain.value = gain;
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(gainNode);
    gainNode.connect(analyser);
    gainNode.connect(this.destination);

    this.sources.push(source);
    this.taps.set(label, { analyser, label });
    return analyser;
  }

  /** The mixed-down output stream (tab + mic). */
  get mixedStream(): MediaStream {
    return this.destination.stream;
  }

  getTap(label: string): MixerTap | undefined {
    return this.taps.get(label);
  }

  async close(): Promise<void> {
    this.sources.forEach((s) => s.disconnect());
    this.taps.clear();
    if (this.context.state !== 'closed') await this.context.close();
  }
}
