/**
 * MP4 Concatenation — Main Entry
 * v6.0.77
 * v6.0.69: STRICT resolution mode
 *   Reason: MP4 stsd/SPS can only describe ONE resolution. Mixing different resolutions causes decoder corruption.
 *   When mismatch detected: throw descriptive error listing which segments have wrong resolution,
 *   so the caller (merge-videos) can tell the user exactly which storyboards need regeneration.
 * v6.0.65: (reverted) permissive resolution mode — include ALL segments (caused garbled video in practice)
 * v6.0.46: 拆分为 mp4-parser.ts + mp4-builder.ts + mp4concat.ts（851行→三文件各<350行）
 * v6.0.40: majority-vote resolution filtering（不一致分辨率跳过而非hard-fail）
 * v6.0.21: Pure TypeScript MP4 parser/writer for concatenating same-codec MP4 segments
 *
 * Approach: Parse each input MP4 -> extract track config + samples -> build single output MP4
 * Supports: H.264/H.265 video + AAC audio (typical Volcengine output)
 * Layout: ftyp + moov(mvhd + trak[]) + mdat
 */

import type { Box, SampleEntry, TrackInfo } from "./mp4-parser.ts";
import {
  readU32, writeU32, scanBoxes, findBox, childBoxes, findPath, parseTrack,
} from "./mp4-parser.ts";
import {
  makeBox, concatBuffers,
  buildStts, buildStsz, buildStco, buildStsc, buildStss, buildCtts,
  buildMvhd, buildTkhd, buildMdhd, buildHdlr,
} from "./mp4-builder.ts";

// ==================== Public Interface ====================

export interface ConcatResult {
  data: Uint8Array;
  duration: number;   // in seconds
  videoCount: number;
  totalSamples: number;
  /** Indices of input segments that were skipped due to resolution mismatch */
  skippedSegments?: number[];
}

/** Options for concatMP4 */
export interface ConcatOptions {
  /**
   * v6.0.93: Preferred resolution "WxH" (e.g. "720x1280").
   * When supplied, segments NOT matching this resolution are flagged as mismatched
   * instead of relying on majority-vote (which can pick the wrong resolution
   * when old/incorrect videos outnumber recently-corrected ones).
   */
  preferredResolution?: string;
}

/**
 * Concatenate multiple MP4 files into a single MP4 file.
 * All inputs must have the same codec configuration (resolution, codec, etc.)*
 * @param segments - Array of MP4 file data as Uint8Array
 * @param options  - Optional hints (preferredResolution from series config)
 * @returns Combined MP4 data, or throws on error
 */
export function concatMP4(segments: Uint8Array[], options?: ConcatOptions): ConcatResult {
  if (segments.length === 0) throw new Error('No segments to concatenate');
  if (segments.length === 1) {
    return { data: segments[0], duration: 0, videoCount: 1, totalSamples: 0 };
  }

  console.log(`[MP4Concat] Concatenating ${segments.length} segments...`);

  // Parse each segment
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
    const trakBoxes = moovChildren.filter(b => b.type === 'trak');

    const tracks: TrackInfo[] = [];
    for (const trakBox of trakBoxes) {
      const track = parseTrack(buf, trakBox, mdatBox.dataOffset);
      if (track) tracks.push(track);
    }

    if (tracks.length === 0) throw new Error(`Segment ${i}: no parseable tracks`);

    segInfos.push({
      buf,
      ftypBox: ftypBox || segInfos[0].ftypBox,
      moovBox,
      mdatBox,
      tracks,
    });

    console.log(`[MP4Concat] Segment ${i}: ${tracks.length} tracks, ${tracks.map(t => `${t.handlerType}:${t.samples.length}samples`).join(', ')}, mdat=${(mdatBox.dataSize / 1024).toFixed(0)}KB`);
  }

  // v6.0.69: Resolution consistency — strict mode (reject merge when resolutions differ)
  // Modern H.264 decoders handle in-stream SPS changes; skipping caused silent scene loss
  const skippedSegments: number[] = []; // kept for interface compat but should stay empty
  let refSegOverride = 0; // index of segment to use as codec/stsd reference
  const resVotes = new Map<string, number[]>(); // "WxH" -> [original indices]
  for (let i = 0; i < segInfos.length; i++) {
    const vt = segInfos[i].tracks.find(t => t.handlerType === 'vide');
    const key = (vt && vt.width > 0) ? `${vt.width}x${vt.height}` : 'unknown';
    if (!resVotes.has(key)) resVotes.set(key, []);
    resVotes.get(key)!.push(i);
  }

  if (resVotes.size > 1) {
    // v6.0.69: STRICT mode — reject merge when resolutions differ
    // MP4 stsd/SPS can only describe ONE resolution config. Mixing different resolutions
    // causes decoder corruption (garbled/glitched video). User must regenerate mismatched storyboards.

    // v6.0.93: If caller provides a preferred resolution (from series config), use it as the
    // "correct" key. This prevents majority-vote from choosing stale/wrong-resolution videos
    // as the reference when newer correct-resolution videos are in the minority.
    const preferred = options?.preferredResolution;
    let bestKey = '';
    let bestCount = 0;
    if (preferred && resVotes.has(preferred)) {
      // Caller knows the intended resolution — trust it over majority vote
      bestKey = preferred;
      bestCount = resVotes.get(preferred)!.length;
      console.log(`[MP4Concat] Using preferred resolution "${bestKey}" (${bestCount} segs) over majority vote`);
    } else {
      for (const [key, indices] of resVotes) {
        if (indices.length > bestCount) { bestKey = key; bestCount = indices.length; }
      }
    }

    // Build detailed mismatch report for user-facing error
    const mismatchDetails: string[] = [];
    for (const [key, indices] of resVotes) {
      if (key !== bestKey) {
        mismatchDetails.push(`分辨率${key}的分镜段: [${indices.map(i => i + 1).join(',')}]`);
      }
    }
    const errorMsg = `视频分辨率不一致，无法合并。${preferred ? `目标分辨率: ${bestKey}` : `主流分辨率: ${bestKey} (${bestCount}/${segInfos.length}段)`}，不匹配: ${mismatchDetails.join('; ')}。请重新生成分辨率不一致的分镜视频后再合并。`;
    console.error(`[MP4Concat] ❌ Resolution mismatch — REJECTING merge. ${errorMsg}`);
    // Attach metadata for caller to extract mismatched segment indices
    const err = new Error(errorMsg) as any;
    err.resolutionMismatch = true;
    err.majorityResolution = bestKey;
    err.mismatchedSegmentIndices = [];
    for (const [key, indices] of resVotes) {
      if (key !== bestKey) err.mismatchedSegmentIndices.push(...indices);
    }
    throw err;
  } else {
    const resKey = resVotes.keys().next().value;
    console.log(`[MP4Concat] Resolution check passed: ${resKey} (all ${segInfos.length} segments)`);
  }

  // Reference segment — majority resolution for stsd/codec config (scene order preserved)
  const refSeg = segInfos[refSegOverride];
  const numTracks = refSeg.tracks.length;

  // Collect combined sample data for each track
  interface CombinedTrack {
    ref: TrackInfo;
    allSamples: SampleEntry[];
    sampleDataChunks: { segIdx: number; sampleIdx: number }[];
  }

  const combinedTracks: CombinedTrack[] = refSeg.tracks.map(t => ({
    ref: t,
    allSamples: [],
    sampleDataChunks: [],
  }));

  // For each segment, accumulate samples per track
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

  console.log(`[MP4Concat] Combined: ${combinedTracks.map(t => `${t.ref.handlerType}:${t.allSamples.length}samples`).join(', ')}, mdat=${(totalMdatSize / 1024 / 1024).toFixed(2)}MB`);

  // Build mdat: write all samples from track 0, then track 1, etc.
  const mdatData = new Uint8Array(totalMdatSize);
  let mdatWritePos = 0;

  // Track sample offset tables (offset within mdat data section)
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

  // Build the mdat box
  const mdatBoxSize = 8 + totalMdatSize;
  let mdatHeader: Uint8Array;
  if (mdatBoxSize > 0xFFFFFFFF) {
    // 64-bit extended size for very large files
    mdatHeader = new Uint8Array(16);
    writeU32(mdatHeader, 0, 1); // size=1 indicates 64-bit extended size
    mdatHeader[4] = 0x6D; mdatHeader[5] = 0x64; mdatHeader[6] = 0x61; mdatHeader[7] = 0x74; // 'mdat'
    writeU32(mdatHeader, 8, Math.floor((16 + totalMdatSize) / 0x100000000));
    writeU32(mdatHeader, 12, (16 + totalMdatSize) & 0xFFFFFFFF);
  } else {
    mdatHeader = new Uint8Array(8);
    writeU32(mdatHeader, 0, mdatBoxSize);
    mdatHeader[4] = 0x6D; mdatHeader[5] = 0x64; mdatHeader[6] = 0x61; mdatHeader[7] = 0x74; // 'mdat'
  }

  // Build ftyp
  const ftypData = refSeg.buf.slice(refSeg.ftypBox.offset, refSeg.ftypBox.offset + refSeg.ftypBox.size);

  // Calculate moov position (right after ftyp, before mdat)
  // We need to know moov size first, so build it, then fixup stco offsets
  const ftypSize = ftypData.length;

  // Build track boxes
  const trakBoxes: Uint8Array[] = [];
  for (let trackIdx = 0; trackIdx < combinedTracks.length; trackIdx++) {
    const ct = combinedTracks[trackIdx];
    const isVideo = ct.ref.handlerType === 'vide';

    // Calculate track duration in track timescale
    const totalDurationTS = ct.allSamples.reduce((s, sample) => s + sample.duration, 0);

    // Build stbl children
    // stts: RLE compress durations
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

    // stsc: one chunk containing all samples for this track
    const stscBuf = buildStsc([{ firstChunk: 1, samplesPerChunk: ct.allSamples.length, sdi: 1 }]);

    // stco: placeholder (will be fixed up after we know moov size)
    const stcoBuf = buildStco([0]); // placeholder

    // stss: sync samples
    const syncNums: number[] = [];
    ct.allSamples.forEach((s, i) => { if (s.isSync) syncNums.push(i + 1); });
    const stssBuf = syncNums.length > 0 && syncNums.length < ct.allSamples.length
      ? buildStss(syncNums)
      : new Uint8Array(0);

    // ctts: composition time offsets (if any non-zero)
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

    // Assemble stbl
    const stblContent = concatBuffers(ct.ref.codecBox, sttsBuf, stszBuf, stscBuf, stcoBuf, stssBuf, cttsBuf);
    const stblBuf = makeBox('stbl', stblContent);

    // dinf (data reference) — minimal
    const drefData = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 12, 0x75, 0x72, 0x6C, 0x20, 0, 0, 0, 1]);
    const dinfBuf = makeBox('dinf', makeBox('dref', drefData));

    // vmhd/smhd + dinf + stbl -> minf
    const headerBox = isVideo
      ? makeBox('vmhd', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])) // version=0, flags=1
      : makeBox('smhd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    const minfBuf = makeBox('minf', concatBuffers(headerBox, dinfBuf, stblBuf));

    // mdhd + hdlr + minf -> mdia
    const mdhdBuf = buildMdhd(ct.ref.timescale, totalDurationTS);
    const hdlrBuf = buildHdlr(ct.ref.handlerType, isVideo ? 'VideoHandler' : 'SoundHandler');
    const mdiaBuf = makeBox('mdia', concatBuffers(mdhdBuf, hdlrBuf, minfBuf));

    // tkhd + mdia -> trak
    // tkhd duration uses movie timescale (not track timescale)
    const movieTS = (combinedTracks.find(t => t.ref.handlerType === 'vide') || combinedTracks[0]).ref.timescale;
    const tkhdDuration = ct.ref.timescale === movieTS
      ? totalDurationTS
      : Math.round(totalDurationTS * movieTS / ct.ref.timescale);
    const tkhdBuf = buildTkhd(trackIdx + 1, tkhdDuration, isVideo, ct.ref.width, ct.ref.height);
    const trakBuf = makeBox('trak', concatBuffers(tkhdBuf, mdiaBuf));

    trakBoxes.push(trakBuf);
  }

  // Calculate overall duration (use video track timescale, or first track)
  const primaryTrack = combinedTracks.find(t => t.ref.handlerType === 'vide') || combinedTracks[0];
  const movieTimescale = primaryTrack.ref.timescale;
  const movieDuration = primaryTrack.allSamples.reduce((s, sample) => s + sample.duration, 0);
  const totalSamples = combinedTracks.reduce((s, t) => s + t.allSamples.length, 0);

  // mvhd + traks -> moov
  const mvhdBuf = buildMvhd(movieTimescale, movieDuration, combinedTracks.length + 1);
  const moovContent = concatBuffers(mvhdBuf, ...trakBoxes);
  const moovBuf = makeBox('moov', moovContent);

  // Now fix up stco offsets: mdat starts at ftypSize + moovSize + mdatHeader.length
  const moovSize = moovBuf.length;
  const mdatDataStart = ftypSize + moovSize + mdatHeader.length;

  for (let trackIdx = 0; trackIdx < combinedTracks.length; trackIdx++) {
    // Find the stco box inside the moov for this track and update the chunk offset
    const offsets = trackSampleOffsets[trackIdx];
    // The chunk offset should be: mdatDataStart + first sample offset for this track
    const chunkOffset = mdatDataStart + (offsets.length > 0 ? offsets[0] : 0);

    // Scan moov to find the stco box for this track
    const moovBoxes = scanBoxes(moovBuf, 8, moovBuf.length); // skip moov header
    const trakBoxesParsed = moovBoxes.filter(b => b.type === 'trak');
    if (trackIdx < trakBoxesParsed.length) {
      const stcoBox = findPath(moovBuf, childBoxes(moovBuf, trakBoxesParsed[trackIdx]),
        ['mdia', 'minf', 'stbl', 'stco']);
      if (stcoBox) {
        // Update the chunk offset in the moov buffer
        writeU32(moovBuf, stcoBox.dataOffset + 8, chunkOffset);
      }
      const co64Box = findPath(moovBuf, childBoxes(moovBuf, trakBoxesParsed[trackIdx]),
        ['mdia', 'minf', 'stbl', 'co64']);
      if (co64Box) {
        writeU32(moovBuf, co64Box.dataOffset + 8, Math.floor(chunkOffset / 0x100000000));
        writeU32(moovBuf, co64Box.dataOffset + 12, chunkOffset & 0xFFFFFFFF);
      }
    }
  }

  // Assemble final file: ftyp + moov + mdat
  const result = concatBuffers(ftypData, moovBuf, mdatHeader, mdatData);

  const durationSec = movieTimescale > 0 ? movieDuration / movieTimescale : 0;
  console.log(`[MP4Concat] Output: ${(result.length / 1024 / 1024).toFixed(2)}MB, ${durationSec.toFixed(1)}s, ${totalSamples} samples`);

  return {
    data: result,
    duration: durationSec,
    videoCount: segInfos.length,
    totalSamples,
    skippedSegments: skippedSegments.length > 0 ? skippedSegments : undefined,
  };
}