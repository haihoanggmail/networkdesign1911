import type { CADUnderlayAlignment, Point2D } from './CADTypes';

/**
 * Forward transform: CAD World coordinates (Y-up) -> HACHIHI Network Canvas coordinates (Y-down px).
 */
export function cadPointToNetworkCanvas(
  pt: Point2D,
  underlay: Pick<CADUnderlayAlignment, 'offsetX' | 'offsetY' | 'scaleToCanvasPx' | 'rotationDeg'>
): Point2D {
  const s = Number.isFinite(underlay.scaleToCanvasPx) && Math.abs(underlay.scaleToCanvasPx) > 1e-8
    ? underlay.scaleToCanvasPx
    : 0.05;
  const rad = ((underlay.rotationDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  const sx = pt.x * s;
  const sy = -pt.y * s;
  return {
    x: sx * c - sy * sn + (underlay.offsetX || 0),
    y: sx * sn + sy * c + (underlay.offsetY || 0)
  };
}

/**
 * Exact inverse transform: HACHIHI Network Canvas coordinates (Y-down px) -> CAD World coordinates (Y-up).
 */
export function networkCanvasToCadPoint(
  canvasPt: Point2D,
  underlay: Pick<CADUnderlayAlignment, 'offsetX' | 'offsetY' | 'scaleToCanvasPx' | 'rotationDeg'>
): Point2D {
  const s = Number.isFinite(underlay.scaleToCanvasPx) && Math.abs(underlay.scaleToCanvasPx) > 1e-8
    ? underlay.scaleToCanvasPx
    : 0.05;
  const rad = -((underlay.rotationDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  const dx = canvasPt.x - (underlay.offsetX || 0);
  const dy = canvasPt.y - (underlay.offsetY || 0);
  const sx = dx * c - dy * sn;
  const sy = dx * sn + dy * c;
  return {
    x: sx / s,
    y: -sy / s
  };
}
