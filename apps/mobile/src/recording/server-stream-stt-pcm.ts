import { STT_STREAM_SAMPLE_RATE } from '@meetio/shared';
import { dbfsToVolume } from './server-stt-ports';

/**
 * PCM helpers for the streaming engine. The microphone is asked for 16 kHz mono int16, but
 * `AudioStream` may deliver another rate or channel count when the hardware cannot (its typings
 * say so), and the server accepts only 16 kHz mono — so every buffer goes through the converter.
 */
export type PcmConverter = (data: ArrayBuffer, sampleRate: number, channels: number) => Int16Array;

/** Stateful (the resampler carries its position across buffers) — one converter per recording. */
export function createPcmConverter(): PcmConverter {
  let last = 0; // last sample of the previous buffer, the left neighbour of the first output
  let pos = 0; // where the next output sits in the current buffer, in input samples (may be -1…0)

  return (data, sampleRate, channels) => {
    const raw = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
    const mono = channels > 1 ? downmix(raw, channels) : raw;
    if (sampleRate === STT_STREAM_SAMPLE_RATE) return mono;

    const ratio = sampleRate / STT_STREAM_SAMPLE_RATE;
    const out: number[] = [];
    // Linear interpolation between the two input samples around each output position.
    while (pos < mono.length) {
      const i = Math.floor(pos);
      if (i + 1 >= mono.length) break; // the right neighbour is in the next buffer
      const a = i < 0 ? last : mono[i];
      out.push(Math.round(a + (mono[i + 1] - a) * (pos - i)));
      pos += ratio;
    }
    if (mono.length > 0) {
      pos -= mono.length;
      last = mono[mono.length - 1];
    }
    return Int16Array.from(out);
  };
}

function downmix(interleaved: Int16Array, channels: number): Int16Array {
  const frames = Math.floor(interleaved.length / channels);
  const mono = new Int16Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += interleaved[f * channels + c];
    mono[f] = Math.round(sum / channels);
  }
  return mono;
}

/** RMS of a PCM16 buffer on the waveform's -2 (silence) … 10 (loud) scale. */
export function pcmVolume(samples: Int16Array): number {
  if (samples.length === 0) return -2;
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / samples.length);
  return dbfsToVolume(20 * Math.log10(rms / 32_768));
}
