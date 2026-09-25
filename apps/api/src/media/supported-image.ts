import { BadRequestException } from '@nestjs/common';

/**
 * Confere, pelos bytes, que o arquivo enviado é mesmo uma imagem JPEG, PNG ou
 * WebP inteira e de tamanho seguro — o tipo e o nome que o navegador manda não
 * provam nada. Usada pelo avatar e pela foto do produto da loja.
 */

const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface SupportedImage {
  extension: 'jpg' | 'png' | 'webp';
}

interface ImageDimensions {
  width: number;
  height: number;
}

export function detectSupportedImage(file: UploadedImageFile): SupportedImage {
  if (!file.buffer.length || file.size !== file.buffer.length) {
    throw new BadRequestException('Arquivo de imagem vazio ou incompleto.');
  }

  const bytes = file.buffer;
  const jpeg = readJpegDimensions(bytes);
  if (jpeg && hasSafeDimensions(jpeg)) return { extension: 'jpg' };

  const png = readPngDimensions(bytes);
  if (png && hasSafeDimensions(png)) return { extension: 'png' };

  const webp = readWebpDimensions(bytes);
  if (webp && hasSafeDimensions(webp)) return { extension: 'webp' };

  throw new BadRequestException(
    'Use uma imagem JPEG, PNG ou WebP valida, com no maximo 4096 x 4096 pixels.',
  );
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  const hasStart = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const hasEnd =
    bytes.length >= 4 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (!hasStart || !hasEnd) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes.readUInt8(offset);
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  return null;
}

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 45 ||
    !signature.every((value, index) => bytes[index] === value) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }

  const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.length) return null;
    const chunkType = bytes.toString('ascii', offset + 4, offset + 8);
    if (chunkType === 'IEND') {
      return chunkLength === 0 && chunkEnd === bytes.length ? dimensions : null;
    }
    offset = chunkEnd;
  }

  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (
    bytes.length < 25 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.readUInt32LE(4) + 8 !== bytes.length ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunkType = bytes.toString('ascii', 12, 16);
  const chunkLength = bytes.readUInt32LE(16);
  if (20 + chunkLength > bytes.length) return null;

  if (chunkType === 'VP8X' && chunkLength >= 10) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }

  if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[20] === 0x2f) {
    const byte21 = bytes.readUInt8(21);
    const byte22 = bytes.readUInt8(22);
    const byte23 = bytes.readUInt8(23);
    const byte24 = bytes.readUInt8(24);
    return {
      width: 1 + byte21 + ((byte22 & 0x3f) << 8),
      height: 1 + (byte22 >> 6) + (byte23 << 2) + ((byte24 & 0x0f) << 10),
    };
  }

  if (
    chunkType === 'VP8 ' &&
    chunkLength >= 10 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

function hasSafeDimensions({ width, height }: ImageDimensions): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION &&
    width * height <= MAX_IMAGE_PIXELS
  );
}
