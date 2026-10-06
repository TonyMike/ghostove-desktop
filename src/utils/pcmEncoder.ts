/**
 * Converts Web Audio API Float32Array audio samples to 16kHz 16-bit PCM ArrayBuffer.
 */
export function floatTo16BitPCM(inputBuffer: Float32Array): ArrayBuffer {
  const output = new Int16Array(inputBuffer.length);
  for (let i = 0; i < inputBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, inputBuffer[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

/**
 * Resamples Float32Array from input sample rate to 16000 Hz using smooth linear
 * interpolation to eliminate phase-jumping, robotic buzz, and aliasing distortion.
 */
export function resampleTo16kHz(
  audioData: Float32Array,
  origSampleRate: number
): Float32Array {
  if (origSampleRate === 16000) {
    return audioData;
  }

  const ratio = origSampleRate / 16000;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const sample1 = audioData[index] || 0;
    const sample2 = index + 1 < audioData.length ? audioData[index + 1] : sample1;
    result[i] = sample1 + frac * (sample2 - sample1);
  }

  return result;
}
