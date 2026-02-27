/**
 * MP4 Box Building Module
 * v6.0.77
 * v6.0.46: 从 mp4concat.ts 提取
 *
 * Functions for constructing MP4 box structures (moov/trak/stbl children)
 */

import { writeU32 } from "./mp4-parser.ts";

// ==================== Box Construction ====================

/** Create a box: [size(4)][type(4)][data] */
export function makeBox(type: string, data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const out = new Uint8Array(size);
  writeU32(out, 0, size);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  return out;
}

/** Build stts box from durations */
export function buildStts(durations: { count: number; delta: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + durations.length * 8);
  // version=0, flags=0
  writeU32(data, 4, durations.length);
  for (let i = 0; i < durations.length; i++) {
    writeU32(data, 8 + i * 8, durations[i].count);
    writeU32(data, 12 + i * 8, durations[i].delta);
  }
  return makeBox('stts', data);
}

/** Build stsz box from sizes */
export function buildStsz(sizes: number[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + 4 + sizes.length * 4);
  writeU32(data, 4, 0); // default size = 0 (variable)
  writeU32(data, 8, sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    writeU32(data, 12 + i * 4, sizes[i]);
  }
  return makeBox('stsz', data);
}

/** Build stco box (32-bit chunk offsets) or co64 if needed */
export function buildStco(offsets: number[]): Uint8Array {
  const need64 = offsets.some(o => o > 0xFFFFFFFF);
  const type = need64 ? 'co64' : 'stco';
  const entrySize = need64 ? 8 : 4;
  const data = new Uint8Array(4 + 4 + offsets.length * entrySize);
  writeU32(data, 4, offsets.length);
  for (let i = 0; i < offsets.length; i++) {
    if (need64) {
      writeU32(data, 8 + i * 8, Math.floor(offsets[i] / 0x100000000));
      writeU32(data, 12 + i * 8, offsets[i] & 0xFFFFFFFF);
    } else {
      writeU32(data, 8 + i * 4, offsets[i]);
    }
  }
  return makeBox(type, data);
}

/** Build stsc: all samples in one chunk per segment */
export function buildStsc(entries: { firstChunk: number; samplesPerChunk: number; sdi: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + entries.length * 12);
  writeU32(data, 4, entries.length);
  for (let i = 0; i < entries.length; i++) {
    writeU32(data, 8 + i * 12, entries[i].firstChunk);
    writeU32(data, 12 + i * 12, entries[i].samplesPerChunk);
    writeU32(data, 16 + i * 12, entries[i].sdi);
  }
  return makeBox('stsc', data);
}

/** Build stss (sync samples) */
export function buildStss(syncSampleNumbers: number[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + syncSampleNumbers.length * 4);
  writeU32(data, 4, syncSampleNumbers.length);
  for (let i = 0; i < syncSampleNumbers.length; i++) {
    writeU32(data, 8 + i * 4, syncSampleNumbers[i]);
  }
  return makeBox('stss', data);
}

/** Build ctts (composition time offsets) */
export function buildCtts(entries: { count: number; offset: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + entries.length * 8);
  // version=0
  writeU32(data, 4, entries.length);
  for (let i = 0; i < entries.length; i++) {
    writeU32(data, 8 + i * 8, entries[i].count);
    writeU32(data, 12 + i * 8, entries[i].offset);
  }
  return makeBox('ctts', data);
}

/** Build mvhd (movie header) */
export function buildMvhd(timescale: number, duration: number, nextTrackId: number): Uint8Array {
  // version 0, 108 bytes total data
  const data = new Uint8Array(108);
  // version(1) + flags(3) = 0
  // creation_time(4) + modification_time(4) = 0
  writeU32(data, 12, timescale);
  writeU32(data, 16, duration);
  writeU32(data, 20, 0x00010000); // rate = 1.0
  data[24] = 0x01; data[25] = 0x00; // volume = 1.0
  // matrix: identity
  writeU32(data, 36, 0x00010000);
  writeU32(data, 52, 0x00010000);
  writeU32(data, 68, 0x40000000);
  // next_track_ID
  writeU32(data, 104, nextTrackId);
  return makeBox('mvhd', data);
}

/** Build tkhd (track header) */
export function buildTkhd(trackId: number, duration: number, isVideo: boolean, width: number = 0, height: number = 0): Uint8Array {
  const data = new Uint8Array(92);
  // version=0, flags=3 (track_enabled | track_in_movie)
  data[3] = 0x03;
  writeU32(data, 12, trackId);
  writeU32(data, 20, duration);
  // volume for audio
  if (!isVideo) { data[36] = 0x01; data[37] = 0x00; }
  // matrix: identity
  writeU32(data, 40, 0x00010000);
  writeU32(data, 56, 0x00010000);
  writeU32(data, 72, 0x40000000);
  // width, height (16.16 fixed-point)
  if (isVideo) {
    writeU32(data, 76, (width << 16));
    writeU32(data, 80, (height << 16));
  }
  return makeBox('tkhd', data);
}

/** Build mdhd (media header) */
export function buildMdhd(timescale: number, duration: number): Uint8Array {
  const data = new Uint8Array(24);
  // version=0, flags=0
  writeU32(data, 12, timescale);
  writeU32(data, 16, duration);
  // language: 'und' = 0x55C4
  data[20] = 0x55;
  data[21] = 0xC4;
  return makeBox('mdhd', data);
}

/** Build hdlr (handler reference) */
export function buildHdlr(handlerType: string, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name + '\0');
  const data = new Uint8Array(20 + nameBytes.length);
  // version=0, flags=0
  // handler_type at offset 8
  data[8] = handlerType.charCodeAt(0);
  data[9] = handlerType.charCodeAt(1);
  data[10] = handlerType.charCodeAt(2);
  data[11] = handlerType.charCodeAt(3);
  data.set(nameBytes, 20);
  return makeBox('hdlr', data);
}

/** Concat multiple Uint8Array */
export function concatBuffers(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}