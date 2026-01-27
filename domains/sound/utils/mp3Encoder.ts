export interface Mp3EncoderOptions {
  bitrate?: number; // kbps (default: 128)
}

/**
 * Converts an AudioBuffer to MP3 Blob using lamejs
 */
export async function audioBufferToMp3(
  audioBuffer: AudioBuffer,
  options: Mp3EncoderOptions = {}
): Promise<Blob> {
  const { bitrate = 128 } = options;

  // Dynamic import to avoid SSR issues with lamejs
  const lamejs = await import("@breezystack/lamejs");
  const Mp3Encoder = lamejs.Mp3Encoder;

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;

  // Create encoder
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);

  // Get channel data
  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  // Convert Float32Array to Int16Array
  const leftInt16 = floatTo16BitPCM(left);
  const rightInt16 = floatTo16BitPCM(right);

  // Encode in chunks (lamejs processes 1152 samples at a time)
  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152;

  for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
    const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
    const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);

    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  // Flush remaining data
  const mp3buf = encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  // Combine all chunks into Uint8Array for Blob
  const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of mp3Data) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return new Blob([result], { type: "audio/mpeg" });
}

/**
 * Converts Float32Array audio samples to Int16Array
 */
function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const buffer = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    // Clamp value between -1 and 1
    const s = Math.max(-1, Math.min(1, samples[i]));
    // Convert to 16-bit integer
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return buffer;
}
