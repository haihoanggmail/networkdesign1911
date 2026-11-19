import type { CADBlock, CADTextStyle } from '../core/CADTypes';

export const MAX_CAD_FILE_BYTES = 500 * 1024 * 1024; // 500 MB (Streaming Worker)
export const LARGE_CAD_STREAM_THRESHOLD_BYTES = 24 * 1024 * 1024; // 24 MB: bật đọc luồng + tiết kiệm RAM
export const MAX_CAD_ENTITIES = 600_000;
export const MAX_BLOCK_NESTING_DEPTH = 32;

const BROWSER_SAFE_FONT_BASES = new Set([
  'arial',
  'times',
  'times new roman',
  'courier',
  'courier new',
  'tahoma',
  'verdana',
  'inter',
  'roboto',
  'segoe ui',
  'helvetica',
  'sans',
  'txt'
]);

export function validateCadFilePayload(
  fileName: string,
  byteLength: number
): { ok: true } | { ok: false; error: string } {
  if (byteLength <= 0) {
    return {
      ok: false,
      error: `Tệp "${fileName}" bị rỗng (0 byte). Vui lòng chọn tệp DXF hoặc DWG hợp lệ.`
    };
  }
  if (byteLength > MAX_CAD_FILE_BYTES) {
    const mb = (byteLength / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `Tệp "${fileName}" (${mb} MB) vượt quá giới hạn tối đa ${MAX_CAD_FILE_BYTES / (1024 * 1024)} MB trên trình duyệt. Hãy lọc bớt lớp hoặc tách bản vẽ lớn.`
    };
  }
  return { ok: true };
}

/**
 * Strips any script/HTML/LISP injection artifacts from DXF text payloads while keeping pure text.
 */
export function sanitizeCadString(raw: string): { clean: string; hadUnsafePattern: boolean } {
  if (!raw) return { clean: '', hadUnsafePattern: false };
  const hasScript = /<\s*script\b|javascript\s*:|\(\s*defun\s+|\(\s*vl-|\(\s*command\s+/i.test(raw);
  const clean = raw
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '');
  return { clean, hadUnsafePattern: hasScript };
}

/**
 * Validates recursive block hierarchies and detects circular `INSERT` loops.
 */
export function detectBlockCycles(blocks: Record<string, CADBlock>): string[] {
  const warnings: string[] = [];
  const reportedCycles = new Set<string>();

  const dfs = (name: string, stack: string[], depth: number) => {
    if (depth > MAX_BLOCK_NESTING_DEPTH) {
      if (!reportedCycles.has(name)) {
        reportedCycles.add(name);
        warnings.push(
          `Block "${name}" lồng nhau sâu vượt ngưỡng ${MAX_BLOCK_NESTING_DEPTH} cấp — đã tự động cắt nhánh để chống treo.`
        );
      }
      return;
    }
    const blk = blocks[name];
    if (!blk) return;
    for (const ent of blk.entities) {
      if (ent.type === 'INSERT') {
        if (stack.includes(ent.blockName)) {
          if (!reportedCycles.has(ent.blockName)) {
            reportedCycles.add(ent.blockName);
            warnings.push(
              `Phát hiện tham chiếu Block vòng lặp (${stack.join(' -> ')} -> ${ent.blockName}) — đã vô hiệu hóa đệ quy vô hạn.`
            );
          }
          continue;
        }
        dfs(ent.blockName, [...stack, ent.blockName], depth + 1);
      }
    }
  };

  for (const name of Object.keys(blocks)) {
    dfs(name, [name], 0);
  }
  return warnings;
}

export function auditMissingCadFonts(textStyles: Record<string, CADTextStyle>): string[] {
  const missing: string[] = [];
  for (const style of Object.values(textStyles)) {
    const rawFont = (style.fontFile || '').trim();
    if (!rawFont) continue;
    const base = rawFont.replace(/\.(shx|ttf|otf)$/i, '').toLowerCase();
    const isShx = /\.shx$/i.test(rawFont) || (!/\.(ttf|otf)$/i.test(rawFont) && !BROWSER_SAFE_FONT_BASES.has(base));
    if (isShx && !BROWSER_SAFE_FONT_BASES.has(base)) {
      style.missingFontFallback = true;
      if (!missing.includes(rawFont)) {
        missing.push(rawFont);
      }
    }
  }
  return missing;
}
