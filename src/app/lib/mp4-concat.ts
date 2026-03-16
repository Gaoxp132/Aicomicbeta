/**
 * Browser-compatible MP4 Concatenation (v6.0.105)
 *
 * Pure TypeScript MP4 parser/builder/concat — runs in browser main thread.
 * No Workers, no FFmpeg.wasm, no external dependencies.
 * Ported from server-side mp4-parser.ts + mp4-builder.ts + mp4concat.ts.
 *
 * Supports: H.264/H.265 video + AAC audio (typical Volcengine output)
 *
 * Parser primitives extracted to ./mp4-parser.ts for maintainability.
 */

import {
  type Box, type SampleEntry, type TrackInfo,
  readU32, writeU32, boxType,
  scanBoxes, findBox, childBoxes, findPath, parseTrack,
} from './mp4-parser';

// Re-export parser types for consumers that import from mp4-concat
export type { Box, SampleEntry, TrackInfo } from './mp4-parser';

export interface ConcatResult {
  data: Uint8Array;
  duration: number;
  videoCount: number;
  totalSamples: number;
  excludedSegments?: number; // v6.0.108: segments excluded due to resolution mismatch
}

// ==================== Box Building ====================

function makeBox(type: string, data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const out = new Uint8Array(size);
  writeU32(out, 0, size);
  out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
  out.set(data, 8);
  return out;
}

function concatBuffers(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
  return out;
}

function buildStts(durations: { count: number; delta: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + durations.length * 8);
  writeU32(data, 4, durations.length);
  for (let i = 0; i < durations.length; i++) {
    writeU32(data, 8 + i * 8, durations[i].count);
    writeU32(data, 12 + i * 8, durations[i].delta);
  }
  return makeBox('stts', data);
}

function buildStsz(sizes: number[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + 4 + sizes.length * 4);
  writeU32(data, 4, 0);
  writeU32(data, 8, sizes.length);
  for (let i = 0; i < sizes.length; i++) writeU32(data, 12 + i * 4, sizes[i]);
  return makeBox('stsz', data);
}

function buildStco(offsets: number[]): Uint8Array {
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

function buildStsc(entries: { firstChunk: number; samplesPerChunk: number; sdi: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + entries.length * 12);
  writeU32(data, 4, entries.length);
  for (let i = 0; i < entries.length; i++) {
    writeU32(data, 8 + i * 12, entries[i].firstChunk);
    writeU32(data, 12 + i * 12, entries[i].samplesPerChunk);
    writeU32(data, 16 + i * 12, entries[i].sdi);
  }
  return makeBox('stsc', data);
}

function buildStss(syncSampleNumbers: number[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + syncSampleNumbers.length * 4);
  writeU32(data, 4, syncSampleNumbers.length);
  for (let i = 0; i < syncSampleNumbers.length; i++) writeU32(data, 8 + i * 4, syncSampleNumbers[i]);
  return makeBox('stss', data);
}

function buildCtts(entries: { count: number; offset: number }[]): Uint8Array {
  const data = new Uint8Array(4 + 4 + entries.length * 8);
  writeU32(data, 4, entries.length);
  for (let i = 0; i < entries.length; i++) {
    writeU32(data, 8 + i * 8, entries[i].count);
    writeU32(data, 12 + i * 8, entries[i].offset);
  }
  return makeBox('ctts', data);
}

function buildMvhd(timescale: number, duration: number, nextTrackId: number): Uint8Array {
  const data = new Uint8Array(108);
  writeU32(data, 12, timescale);
  writeU32(data, 16, duration);
  writeU32(data, 20, 0x00010000);
  data[24] = 0x01; data[25] = 0x00;
  writeU32(data, 36, 0x00010000);
  writeU32(data, 52, 0x00010000);
  writeU32(data, 68, 0x40000000);
  writeU32(data, 104, nextTrackId);
  return makeBox('mvhd', data);
}

function buildTkhd(trackId: number, duration: number, isVideo: boolean, width = 0, height = 0): Uint8Array {
  const data = new Uint8Array(92);
  data[3] = 0x03;
  writeU32(data, 12, trackId);
  writeU32(data, 20, duration);
  if (!isVideo) { data[36] = 0x01; data[37] = 0x00; }
  writeU32(data, 40, 0x00010000);
  writeU32(data, 56, 0x00010000);
  writeU32(data, 72, 0x40000000);
  if (isVideo) {
    writeU32(data, 76, (width << 16));
    writeU32(data, 80, (height << 16));
  }
  return makeBox('tkhd', data);
}

function buildMdhd(timescale: number, duration: number): Uint8Array {
  const data = new Uint8Array(24);
  writeU32(data, 12, timescale);
  writeU32(data, 16, duration);
  data[20] = 0x55; data[21] = 0xC4;
  return makeBox('mdhd', data);
}

function buildHdlr(handlerType: string, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name + '\0');
  const data = new Uint8Array(20 + nameBytes.length);
  data[8] = handlerType.charCodeAt(0); data[9] = handlerType.charCodeAt(1);
  data[10] = handlerType.charCodeAt(2); data[11] = handlerType.charCodeAt(3);
  data.set(nameBytes, 20);
  return makeBox('hdlr', data);
}

// ==================== Public: getVideoResolution ====================

/**
 * Quickly read the video track resolution from an MP4 buffer.
 * Returns null if the file can't be parsed or has no video track.
 */
export function getVideoResolution(buf: Uint8Array): { width: number; height: number } | null {
  try {
    const topBoxes = scanBoxes(buf, 0, buf.length);
    const moovBox = findBox(topBoxes, 'moov');
    if (!moovBox) return null;
    const moovChildren = childBoxes(buf, moovBox);
    const trakBoxes = moovChildren.filter(b => b.type === 'trak');
    for (const trakBox of trakBoxes) {
      const trakChildren = childBoxes(buf, trakBox);
      const mdiaBox = findBox(trakChildren, 'mdia');
      if (!mdiaBox) continue;
      const mdiaChildren = childBoxes(buf, mdiaBox);
      const hdlrBox = findBox(mdiaChildren, 'hdlr');
      if (!hdlrBox) continue;
      const handlerType = boxType(buf, hdlrBox.dataOffset + 8);
      if (handlerType !== 'vide') continue;
      // Found video track — read tkhd for width/height
      const tkhdBox = findBox(trakChildren, 'tkhd');
      if (!tkhdBox) continue;
      const tkhdVersion = buf[tkhdBox.dataOffset];
      const tkhdWidthOff = tkhdVersion === 1 ? 88 : 76;
      const tkhdHeightOff = tkhdVersion === 1 ? 92 : 80;
      if (tkhdBox.dataSize >= tkhdHeightOff + 4) {
        const width = readU32(buf, tkhdBox.dataOffset + tkhdWidthOff) >> 16;
        const height = readU32(buf, tkhdBox.dataOffset + tkhdHeightOff) >> 16;
        if (width > 0 && height > 0) return { width, height };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== Public: concatMP4 ====================

/**
 * Concatenate multiple MP4 files (same codec/resolution) into a single MP4.
 * Pure TypeScript — runs in any JS environment, no Workers/FFmpeg needed.
 */
export function concatMP4(segments: Uint8Array[]): ConcatResult {
  if (segments.length === 0) throw new Error('No segments to concatenate');
  if (segments.length === 1) {
    return { data: segments[0], duration: 0, videoCount: 1, totalSamples: 0 };
  }

  console.log(`[MP4Concat:Client] Concatenating ${segments.length} segments...`);

  interface SegmentInfo {
    buf: Uint8Array;
    ftypBox: Box;
    moovBox: Box;
    mdatBox: Box;
    tracks: TrackInfo[];
  }

  const segInfos: SegmentInfo[] = [];
  for (let i = 0; i < segments.length; i++) {
    const buf = segments[i];
    const topBoxes = scanBoxes(buf, 0, buf.length);
    const ftypBox = findBox(topBoxes, 'ftyp');
    const moovBox = findBox(topBoxes, 'moov');
    const mdatBox = findBox(topBoxes, 'mdat');
    if (!moovBox) throw new Error(`Segment ${i}: missing moov box`);
    if (!mdatBox) throw new Error(`Segment ${i}: missing mdat box`);
    if (!ftypBox && i === 0) throw new Error(`Segment 0: missing ftyp box`);
    const moovChildren = childBoxes(buf, moovBox);
    const trakBoxesParsed = moovChildren.filter(b => b.type === 'trak');
    const tracks: TrackInfo[] = [];
    for (const trakBox of trakBoxesParsed) {
      const track = parseTrack(buf, trakBox, mdatBox.dataOffset);
      if (track) tracks.push(track);
    }
    if (tracks.length === 0) throw new Error(`Segment ${i}: no parseable tracks`);
    segInfos.push({
      buf, ftypBox: ftypBox || segInfos[0].ftypBox, moovBox, mdatBox, tracks,
    });
    console.log(`[MP4Concat:Client] Segment ${i}: ${tracks.length} tracks, ${tracks.map(t => `${t.handlerType}:${t.samples.length}samples`).join(', ')}, mdat=${(mdatBox.dataSize / 1024).toFixed(0)}KB`);
  }

  // v6.0.121: 包容模式——所有段全部包含，不跳过（现代H.264解码器可处理流内SPS分辨率变更）
  // 原v6.0.108分辨率过滤逻辑已移除，改为仅记录警告不排除任何分镜
  if (segInfos.length > 1) {
    const resVotes = new Map<string, number[]>();
    for (let i = 0; i < segInfos.length; i++) {
      const vt = segInfos[i].tracks.find(t => t.handlerType === 'vide');
      const key = (vt && vt.width > 0) ? `${vt.width}x${vt.height}` : 'unknown';
      if (!resVotes.has(key)) resVotes.set(key, []);
      resVotes.get(key)!.push(i);
    }
    if (resVotes.size > 1) {
      const details: string[] = [];
      for (const [key, indices] of resVotes) {
        details.push(`${key}: 段[${indices.map(i => i + 1).join(',')}]`);
      }
      console.warn(`[MP4Concat:Client] ⚠️ 分辨率不一致（共 ${resVotes.size} 种），全部保留合并: ${details.join('; ')}`);
    }
  }

  const refSeg = segInfos[0];
  const numTracks = refSeg.tracks.length;

  interface CombinedTrack {
    ref: TrackInfo;
    allSamples: SampleEntry[];
    sampleDataChunks: { segIdx: number; sampleIdx: number }[];
  }

  const combinedTracks: CombinedTrack[] = refSeg.tracks.map(t => ({
    ref: t, allSamples: [], sampleDataChunks: [],
  }));

  let totalMdatSize = 0;
  for (let segIdx = 0; segIdx < segInfos.length; segIdx++) {
    const seg = segInfos[segIdx];
    for (let trackIdx = 0; trackIdx < Math.min(numTracks, seg.tracks.length); trackIdx++) {
      const track = seg.tracks[trackIdx];
      const combined = combinedTracks[trackIdx];
      for (let s = 0; s < track.samples.length; s++) {
        combined.allSamples.push(track.samples[s]);
        combined.sampleDataChunks.push({ segIdx, sampleIdx: s });
        totalMdatSize += track.samples[s].size;
      }
    }
  }

  console.log(`[MP4Concat:Client] Combined: ${combinedTracks.map(t => `${t.ref.handlerType}:${t.allSamples.length}samples`).join(', ')}, mdat=${(totalMdatSize / 1024 / 1024).toFixed(2)}MB`);

  // Build mdat
  const mdatData = new Uint8Array(totalMdatSize);
  let mdatWritePos = 0;
  const trackSampleOffsets: number[][] = combinedTracks.map(() => []);

  for (let trackIdx = 0; trackIdx < combinedTracks.length; trackIdx++) {
    const ct = combinedTracks[trackIdx];
    for (let i = 0; i < ct.sampleDataChunks.length; i++) {
      const { segIdx, sampleIdx } = ct.sampleDataChunks[i];
      const seg = segInfos[segIdx];
      const track = seg.tracks[trackIdx];
      const sampleSize = ct.allSamples[i].size;
      const srcOffset = track.sampleDataOffsets[sampleIdx] + track.mdatOffset;
      trackSampleOffsets[trackIdx].push(mdatWritePos);
      mdatData.set(seg.buf.subarray(srcOffset, srcOffset + sampleSize), mdatWritePos);
      mdatWritePos += sampleSize;
    }
  }

  // Build mdat box header
  const mdatBoxSize = 8 + totalMdatSize;
  let mdatHeader: Uint8Array;
  if (mdatBoxSize > 0xFFFFFFFF) {
    mdatHeader = new Uint8Array(16);
    writeU32(mdatHeader, 0, 1);
    mdatHeader[4] = 0x6D; mdatHeader[5] = 0x64; mdatHeader[6] = 0x61; mdatHeader[7] = 0x74;
    writeU32(mdatHeader, 8, Math.floor((16 + totalMdatSize) / 0x100000000));
    writeU32(mdatHeader, 12, (16 + totalMdatSize) & 0xFFFFFFFF);
  } else {
    mdatHeader = new Uint8Array(8);
    writeU32(mdatHeader, 0, mdatBoxSize);
    mdatHeader[4] = 0x6D; mdatHeader[5] = 0x64; mdatHeader[6] = 0x61; mdatHeader[7] = 0x74;
  }

  const ftypData = refSeg.buf.slice(refSeg.ftypBox.offset, refSeg.ftypBox.offset + refSeg.ftypBox.size);
  const ftypSize = ftypData.length;

  // Build track boxes
  const trakBoxes: Uint8Array[] = [];
  for (let trackIdx = 0; trackIdx < combinedTracks.length; trackIdx++) {
    const ct = combinedTracks[trackIdx];
    const isVideo = ct.ref.handlerType === 'vide';
    const totalDurationTS = ct.allSamples.reduce((s, sample) => s + sample.duration, 0);

    const sttsEntries: { count: number; delta: number }[] = [];
    for (const sample of ct.allSamples) {
      if (sttsEntries.length > 0 && sttsEntries[sttsEntries.length - 1].delta === sample.duration) {
        sttsEntries[sttsEntries.length - 1].count++;
      } else {
        sttsEntries.push({ count: 1, delta: sample.duration });
      }
    }

    const sttsBuf = buildStts(sttsEntries);
    const stszBuf = buildStsz(ct.allSamples.map(s => s.size));
    const stscBuf = buildStsc([{ firstChunk: 1, samplesPerChunk: ct.allSamples.length, sdi: 1 }]);
    const stcoBuf = buildStco([0]); // placeholder

    const syncNums: number[] = [];
    ct.allSamples.forEach((s, i) => { if (s.isSync) syncNums.push(i + 1); });
    const stssBuf = syncNums.length > 0 && syncNums.length < ct.allSamples.length
      ? buildStss(syncNums) : new Uint8Array(0);

    const hasCtts = ct.allSamples.some(s => s.compositionOffset !== 0);
    let cttsBuf = new Uint8Array(0);
    if (hasCtts) {
      const cttsEntries: { count: number; offset: number }[] = [];
      for (const sample of ct.allSamples) {
        if (cttsEntries.length > 0 && cttsEntries[cttsEntries.length - 1].offset === sample.compositionOffset) {
          cttsEntries[cttsEntries.length - 1].count++;
        } else {
          cttsEntries.push({ count: 1, offset: sample.compositionOffset });
        }
      }
      cttsBuf = buildCtts(cttsEntries);
    }

    const stblContent = concatBuffers(ct.ref.codecBox, sttsBuf, stszBuf, stscBuf, stcoBuf, stssBuf, cttsBuf);
    const stblBuf = makeBox('stbl', stblContent);
    const drefData = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 12, 0x75, 0x72, 0x6C, 0x20, 0, 0, 0, 1]);
    const dinfBuf = makeBox('dinf', makeBox('dref', drefData));
    const headerBox = isVideo
      ? makeBox('vmhd', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]))
      : makeBox('smhd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    const minfBuf = makeBox('minf', concatBuffers(headerBox, dinfBuf, stblBuf));
    const mdhdBuf = buildMdhd(ct.ref.timescale, totalDurationTS);
    const hdlrBuf = buildHdlr(ct.ref.handlerType, isVideo ? 'VideoHandler' : 'SoundHandler');
    const mdiaBuf = makeBox('mdia', concatBuffers(mdhdBuf, hdlrBuf, minfBuf));
    const movieTS = (combinedTracks.find(t => t.ref.handlerType === 'vide') || combinedTracks[0]).ref.timescale;
    const tkhdDuration = ct.ref.timescale === movieTS
      ? totalDurationTS
      : Math.round(totalDurationTS * movieTS / ct.ref.timescale);
    const tkhdBuf = buildTkhd(trackIdx + 1, tkhdDuration, isVideo, ct.ref.width, ct.ref.height);
    const trakBuf = makeBox('trak', concatBuffers(tkhdBuf, mdiaBuf));
    trakBoxes.push(trakBuf);
  }

  const primaryTrack = combinedTracks.find(t => t.ref.handlerType === 'vide') || combinedTracks[0];
  const movieTimescale = primaryTrack.ref.timescale;
  const movieDuration = primaryTrack.allSamples.reduce((s, sample) => s + sample.duration, 0);
  const totalSamples = combinedTracks.reduce((s, t) => s + t.allSamples.length, 0);

  const mvhdBuf = buildMvhd(movieTimescale, movieDuration, combinedTracks.length + 1);
  const moovContent = concatBuffers(mvhdBuf, ...trakBoxes);
  const moovBuf = makeBox('moov', moovContent);

  // Fix up stco offsets
  const moovSize = moovBuf.length;
  const mdatDataStart = ftypSize + moovSize + mdatHeader.length;

  for (let trackIdx = 0; trackIdx < combinedTracks.length; trackIdx++) {
    const offsets = trackSampleOffsets[trackIdx];
    const chunkOffset = mdatDataStart + (offsets.length > 0 ? offsets[0] : 0);
    const moovBoxes = scanBoxes(moovBuf, 8, moovBuf.length);
    const trakBoxesParsed = moovBoxes.filter(b => b.type === 'trak');
    if (trackIdx < trakBoxesParsed.length) {
      const stcoBox = findPath(moovBuf, childBoxes(moovBuf, trakBoxesParsed[trackIdx]),
        ['mdia', 'minf', 'stbl', 'stco']);
      if (stcoBox) writeU32(moovBuf, stcoBox.dataOffset + 8, chunkOffset);
      const co64Box = findPath(moovBuf, childBoxes(moovBuf, trakBoxesParsed[trackIdx]),
        ['mdia', 'minf', 'stbl', 'co64']);
      if (co64Box) {
        writeU32(moovBuf, co64Box.dataOffset + 8, Math.floor(chunkOffset / 0x100000000));
        writeU32(moovBuf, co64Box.dataOffset + 12, chunkOffset & 0xFFFFFFFF);
      }
    }
  }

  const result = concatBuffers(ftypData, moovBuf, mdatHeader, mdatData);
  const durationSec = movieTimescale > 0 ? movieDuration / movieTimescale : 0;
  console.log(`[MP4Concat:Client] Output: ${(result.length / 1024 / 1024).toFixed(2)}MB, ${durationSec.toFixed(1)}s, ${totalSamples} samples`);

  return { data: result, duration: durationSec, videoCount: segInfos.length, totalSamples };
}
