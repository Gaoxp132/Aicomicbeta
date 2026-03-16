/**
 * MP4 low-level parser — types, binary utilities, box scanning, sample table parsing.
 * Extracted from mp4-concat.ts for maintainability.
 */

// ==================== Types ====================

export interface Box {
  type: string;
  offset: number;
  headerSize: number;
  size: number;
  dataOffset: number;
  dataSize: number;
}

export interface SampleEntry {
  size: number;
  duration: number;
  isSync: boolean;
  compositionOffset: number;
}

export interface TrackInfo {
  trackId: number;
  timescale: number;
  handlerType: string;
  codecBox: Uint8Array;
  width: number;
  height: number;
  samples: SampleEntry[];
  mdatOffset: number;
  sampleDataOffsets: number[];
}

// ==================== Binary Utilities ====================

export function readU32(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

export function readU64(buf: Uint8Array, off: number): number {
  return readU32(buf, off) * 0x100000000 + readU32(buf, off + 4);
}

export function writeU32(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}

export function boxType(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

// ==================== Box Scanning ====================

export function scanBoxes(buf: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = readU32(buf, pos);
    const type = boxType(buf, pos + 4);
    let headerSize = 8;
    if (size === 1 && pos + 16 <= end) {
      size = readU64(buf, pos + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;
    boxes.push({ type, offset: pos, headerSize, size, dataOffset: pos + headerSize, dataSize: size - headerSize });
    pos += size;
  }
  return boxes;
}

export function findBox(boxes: Box[], type: string): Box | undefined {
  return boxes.find(b => b.type === type);
}

export function childBoxes(buf: Uint8Array, parent: Box): Box[] {
  return scanBoxes(buf, parent.dataOffset, parent.offset + parent.size);
}

export function findPath(buf: Uint8Array, boxes: Box[], path: string[]): Box | undefined {
  let current = boxes;
  let result: Box | undefined;
  for (const p of path) {
    result = findBox(current, p);
    if (!result) return undefined;
    if (path.indexOf(p) < path.length - 1) {
      current = childBoxes(buf, result);
    }
  }
  return result;
}

// ==================== Sample Table Parsing ====================

function parseStts(buf: Uint8Array, box: Box): { count: number; delta: number }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const entryCount = dv.getUint32(4);
  const entries: { count: number; delta: number }[] = [];
  for (let i = 0; i < entryCount; i++) {
    entries.push({ count: dv.getUint32(8 + i * 8), delta: dv.getUint32(12 + i * 8) });
  }
  return entries;
}

function parseStsz(buf: Uint8Array, box: Box): number[] {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const defaultSize = dv.getUint32(4);
  const count = dv.getUint32(8);
  const sizes: number[] = [];
  if (defaultSize > 0) {
    for (let i = 0; i < count; i++) sizes.push(defaultSize);
  } else {
    for (let i = 0; i < count; i++) sizes.push(dv.getUint32(12 + i * 4));
  }
  return sizes;
}

function parseStco(buf: Uint8Array, box: Box): number[] {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const count = dv.getUint32(4);
  const is64 = box.type === 'co64';
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    if (is64) {
      offsets.push(dv.getUint32(8 + i * 8) * 0x100000000 + dv.getUint32(12 + i * 8));
    } else {
      offsets.push(dv.getUint32(8 + i * 4));
    }
  }
  return offsets;
}

function parseStsc(buf: Uint8Array, box: Box): { firstChunk: number; samplesPerChunk: number; sdi: number }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const count = dv.getUint32(4);
  const entries: { firstChunk: number; samplesPerChunk: number; sdi: number }[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      firstChunk: dv.getUint32(8 + i * 12),
      samplesPerChunk: dv.getUint32(12 + i * 12),
      sdi: dv.getUint32(16 + i * 12),
    });
  }
  return entries;
}

function parseStss(buf: Uint8Array, box: Box): Set<number> {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const count = dv.getUint32(4);
  const syncs = new Set<number>();
  for (let i = 0; i < count; i++) syncs.add(dv.getUint32(8 + i * 4));
  return syncs;
}

function parseCtts(buf: Uint8Array, box: Box): { count: number; offset: number }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset + box.dataOffset, box.dataSize);
  const version = dv.getUint8(0);
  const entryCount = dv.getUint32(4);
  const entries: { count: number; offset: number }[] = [];
  for (let i = 0; i < entryCount; i++) {
    const count = dv.getUint32(8 + i * 8);
    const offset = version === 0 ? dv.getUint32(12 + i * 8) : dv.getInt32(12 + i * 8);
    entries.push({ count, offset });
  }
  return entries;
}

function computeSampleOffsets(
  stscEntries: { firstChunk: number; samplesPerChunk: number; sdi: number }[],
  chunkOffsets: number[],
  sampleSizes: number[],
  totalSamples: number
): number[] {
  const offsets: number[] = new Array(totalSamples);
  let sampleIdx = 0;
  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    const chunkNum = chunkIdx + 1;
    let samplesInChunk = 1;
    for (let e = stscEntries.length - 1; e >= 0; e--) {
      if (chunkNum >= stscEntries[e].firstChunk) {
        samplesInChunk = stscEntries[e].samplesPerChunk;
        break;
      }
    }
    let offset = chunkOffsets[chunkIdx];
    for (let s = 0; s < samplesInChunk && sampleIdx < totalSamples; s++) {
      offsets[sampleIdx] = offset;
      offset += sampleSizes[sampleIdx];
      sampleIdx++;
    }
  }
  return offsets;
}

export function parseTrack(buf: Uint8Array, trakBox: Box, mdatDataOffset: number): TrackInfo | null {
  const trakChildren = childBoxes(buf, trakBox);
  const tkhdBox = findBox(trakChildren, 'tkhd');
  if (!tkhdBox) return null;
  const tkhdVersion = buf[tkhdBox.dataOffset];
  const trackId = tkhdVersion === 1
    ? readU32(buf, tkhdBox.dataOffset + 20)
    : readU32(buf, tkhdBox.dataOffset + 12);
  let width = 0, height = 0;
  const tkhdWidthOff = tkhdVersion === 1 ? 88 : 76;
  const tkhdHeightOff = tkhdVersion === 1 ? 92 : 80;
  if (tkhdBox.dataSize >= tkhdHeightOff + 4) {
    width = readU32(buf, tkhdBox.dataOffset + tkhdWidthOff) >> 16;
    height = readU32(buf, tkhdBox.dataOffset + tkhdHeightOff) >> 16;
  }
  const mdiaBox = findBox(trakChildren, 'mdia');
  if (!mdiaBox) return null;
  const mdiaChildren = childBoxes(buf, mdiaBox);
  const mdhdBox = findBox(mdiaChildren, 'mdhd');
  if (!mdhdBox) return null;
  const mdhdVersion = buf[mdhdBox.dataOffset];
  const timescale = mdhdVersion === 1
    ? readU32(buf, mdhdBox.dataOffset + 20)
    : readU32(buf, mdhdBox.dataOffset + 12);
  const hdlrBox = findBox(mdiaChildren, 'hdlr');
  if (!hdlrBox) return null;
  const handlerType = boxType(buf, hdlrBox.dataOffset + 8);
  const minfBox = findBox(mdiaChildren, 'minf');
  if (!minfBox) return null;
  const stblBox = findPath(buf, childBoxes(buf, minfBox), ['stbl']);
  if (!stblBox) return null;
  const stblChildren = childBoxes(buf, stblBox);
  const stsdBox = findBox(stblChildren, 'stsd');
  if (!stsdBox) return null;
  const codecBox = buf.slice(stsdBox.offset, stsdBox.offset + stsdBox.size);
  const sttsBox = findBox(stblChildren, 'stts');
  const stszBox = findBox(stblChildren, 'stsz');
  const stcoBox = findBox(stblChildren, 'stco') || findBox(stblChildren, 'co64');
  const stscBox = findBox(stblChildren, 'stsc');
  const stssBox = findBox(stblChildren, 'stss');
  const cttsBox = findBox(stblChildren, 'ctts');
  if (!sttsBox || !stszBox || !stcoBox || !stscBox) return null;
  const sttsEntries = parseStts(buf, sttsBox);
  const sampleSizes = parseStsz(buf, stszBox);
  const chunkOffsets = parseStco(buf, stcoBox);
  const stscEntries = parseStsc(buf, stscBox);
  const syncSamples = stssBox ? parseStss(buf, stssBox) : null;
  const cttsEntries = cttsBox ? parseCtts(buf, cttsBox) : null;
  const totalSamples = sampleSizes.length;
  const sampleDataOffsets = computeSampleOffsets(stscEntries, chunkOffsets, sampleSizes, totalSamples);
  const durations: number[] = [];
  for (const entry of sttsEntries) {
    for (let i = 0; i < entry.count; i++) durations.push(entry.delta);
  }
  while (durations.length < totalSamples) durations.push(durations[durations.length - 1] || 0);
  const compOffsets: number[] = [];
  if (cttsEntries) {
    for (const entry of cttsEntries) {
      for (let i = 0; i < entry.count; i++) compOffsets.push(entry.offset);
    }
  }
  while (compOffsets.length < totalSamples) compOffsets.push(0);
  const samples: SampleEntry[] = [];
  for (let i = 0; i < totalSamples; i++) {
    samples.push({
      size: sampleSizes[i],
      duration: durations[i],
      isSync: syncSamples ? syncSamples.has(i + 1) : true,
      compositionOffset: compOffsets[i],
    });
  }
  return {
    trackId, timescale, handlerType, codecBox, width, height, samples,
    mdatOffset: mdatDataOffset,
    sampleDataOffsets: sampleDataOffsets.map(off => off - mdatDataOffset),
  };
}
