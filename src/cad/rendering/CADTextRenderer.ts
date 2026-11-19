import type {
  CADAttribEntity,
  CADDimensionEntity,
  CADDocument,
  CADMTextEntity,
  CADTextEntity,
  Point2D
} from '../core/CADTypes';
import { Affine2D, applyAffine2D, decomposeAffine2D } from '../core/CADTransform';
import { decodeAutoCadText, stripMTextFormatting } from '../geometry/CADCurve';
import { cadWorldToScreen, CADViewportState } from './CADViewport';

const CAD_FONT_FAMILY = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

export function formatDimensionDisplayText(entity: CADDimensionEntity, doc: CADDocument): string {
  const ds = doc.dimStyles[entity.style] || doc.dimStyles['STANDARD'];
  const decimals = ds?.dimdec ?? 2;
  const lfac = ds?.dimlfac ?? 1;
  const val = (entity.measuredValue || 0) * lfac;
  const formatted = Number.isFinite(val) ? val.toFixed(Math.max(0, Math.min(4, decimals))) : '0';
  if (!entity.text || entity.text === '<>') {
    return formatted;
  }
  return decodeAutoCadText(entity.text).replace(/<>/g, formatted);
}

function drawTextScreenSpace(
  ctx: CanvasRenderingContext2D,
  screenPos: Point2D,
  lines: string[],
  fontSizePx: number,
  rotationDeg: number,
  color: string,
  hAlign: 'left' | 'center' | 'right' = 'left',
  vBaseline: 'alphabetic' | 'top' | 'middle' | 'bottom' = 'alphabetic'
): void {
  if (fontSizePx < 1.5 || lines.length === 0) return;

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);
  if (rotationDeg) {
    ctx.rotate((-rotationDeg * Math.PI) / 180);
  }
  ctx.font = `${Math.max(5, fontSizePx)}px ${CAD_FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = hAlign;
  ctx.textBaseline = vBaseline;

  const lineH = fontSizePx * 1.28;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, i * lineH);
  }
  ctx.restore();
}

export function renderCADTextEntity(
  ctx: CanvasRenderingContext2D,
  entity: CADTextEntity | CADAttribEntity,
  vp: CADViewportState,
  color: string,
  worldTransform?: Affine2D
): void {
  const text = decodeAutoCadText(entity.text);
  if (!text) return;
  const dec = worldTransform ? decomposeAffine2D(worldTransform) : null;
  const worldPos = worldTransform ? applyAffine2D(worldTransform, entity.position) : entity.position;
  const screenPos = cadWorldToScreen(worldPos, vp);
  const scaleAvg = dec ? (Math.abs(dec.scaleX) + Math.abs(dec.scaleY)) / 2 : 1;
  const fontSizePx = entity.height * scaleAvg * vp.scale;
  const rot = (entity.rotation || 0) + (dec?.rotationDeg || 0);

  let hAlign: 'left' | 'center' | 'right' = 'left';
  if (entity.type === 'TEXT') {
    if (entity.hAlign === 1 || entity.hAlign === 4) hAlign = 'center';
    else if (entity.hAlign === 2) hAlign = 'right';
  }
  drawTextScreenSpace(ctx, screenPos, [text], fontSizePx, rot, color, hAlign, 'alphabetic');
}

export function renderCADMTextEntity(
  ctx: CanvasRenderingContext2D,
  entity: CADMTextEntity,
  vp: CADViewportState,
  color: string,
  worldTransform?: Affine2D
): void {
  const raw = entity.plainText || entity.rawText;
  const content = raw ? stripMTextFormatting(raw) : '';
  if (!content) return;
  const dec = worldTransform ? decomposeAffine2D(worldTransform) : null;
  const worldPos = worldTransform ? applyAffine2D(worldTransform, entity.position) : entity.position;
  const screenPos = cadWorldToScreen(worldPos, vp);
  const scaleAvg = dec ? (Math.abs(dec.scaleX) + Math.abs(dec.scaleY)) / 2 : 1;
  const fontSizePx = entity.height * scaleAvg * vp.scale;
  const rot = (entity.rotation || 0) + (dec?.rotationDeg || 0);

  const attach = entity.attachmentPoint || 1;
  const hAlign: 'left' | 'center' | 'right' =
    attach === 2 || attach === 5 || attach === 8
      ? 'center'
      : attach === 3 || attach === 6 || attach === 9
        ? 'right'
        : 'left';
  const vBaseline: 'top' | 'middle' | 'bottom' =
    attach >= 7 ? 'bottom' : attach >= 4 ? 'middle' : 'top';

  const lines = content.split('\n').slice(0, 40);
  drawTextScreenSpace(ctx, screenPos, lines, fontSizePx, rot, color, hAlign, vBaseline);
}

export function renderCADDimensionLabel(
  ctx: CanvasRenderingContext2D,
  entity: CADDimensionEntity,
  doc: CADDocument,
  vp: CADViewportState,
  color: string,
  worldTransform?: Affine2D
): void {
  const label = formatDimensionDisplayText(entity, doc);
  const ds = doc.dimStyles[entity.style] || doc.dimStyles['STANDARD'];
  const txtH = (ds?.dimtxt || doc.header.$TEXTSIZE || 180) * (ds?.dimscale || doc.header.$DIMSCALE || 1);
  const worldPos = worldTransform ? applyAffine2D(worldTransform, entity.textMidPoint) : entity.textMidPoint;
  const screenPos = cadWorldToScreen(worldPos, vp);
  const fontSizePx = Math.max(9, Math.min(28, txtH * vp.scale));
  drawTextScreenSpace(ctx, screenPos, [label], fontSizePx, entity.rotation || 0, color, 'center', 'middle');
}
