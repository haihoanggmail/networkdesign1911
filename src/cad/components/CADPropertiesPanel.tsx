import React from 'react';
import { Lock, Scale, Trash2 } from 'lucide-react';
import { QUICK_ACI_SWATCHES } from '../core/CADColorPalette';
import type { CADDocument, CADEntity, CADUnderlayAlignment } from '../core/CADTypes';
import { CAD_UNIT_CATALOG, getCADUnitMeta } from '../core/CADUnits';
import { decodeAutoCadText, stripMTextFormatting } from '../geometry/CADCurve';

interface CADPropertiesPanelProps {
  doc: CADDocument;
  selectedEntities: CADEntity[];
  onPatchEntity: (entityId: string, patcher: (e: CADEntity) => CADEntity, labelVi?: string) => void;
  onDeleteSelected: () => void;
  onExplodeInsert: (entityId: string) => void;
  onUpdateDocumentSettings: (updater: (doc: CADDocument) => CADDocument) => void;
  onAutoFitUnderlay: () => void;
}

export const CADPropertiesPanel: React.FC<CADPropertiesPanelProps> = ({
  doc,
  selectedEntities,
  onPatchEntity,
  onDeleteSelected,
  onExplodeInsert,
  onUpdateDocumentSettings,
  onAutoFitUnderlay
}) => {
  const layerNames = Object.keys(doc.layers).sort();
  const unitMeta = getCADUnitMeta(doc.header.$INSUNITS);

  const updateUnderlay = (patch: Partial<CADUnderlayAlignment>) => {
    onUpdateDocumentSettings(prev => ({
      ...prev,
      underlay: { ...prev.underlay, ...patch },
      updatedAt: new Date().toISOString()
    }));
  };

  if (selectedEntities.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-3 text-xs space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-white">Thuộc tính Bản vẽ CAD</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">{doc.metadata.sourceFileName}</p>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[11px] font-semibold text-cyan-300">Đơn vị & Tiêu chuẩn</div>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">Đơn vị bản vẽ ($INSUNITS)</span>
            <select
              value={doc.header.$INSUNITS}
              onChange={e =>
                onUpdateDocumentSettings(prev => ({
                  ...prev,
                  header: { ...prev.header, $INSUNITS: Number(e.target.value) as CADDocument['header']['$INSUNITS'] },
                  updatedAt: new Date().toISOString()
                }))
              }
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
            >
              {Object.values(CAD_UNIT_CATALOG).map(u => (
                <option key={u.code} value={u.code}>
                  {u.labelVi}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Phiên bản DXF:</span>
            <span className="text-slate-200">{doc.metadata.acadVersion}</span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Tỉ lệ chiều dài:</span>
            <span className="text-slate-200">1 {unitMeta.shortLabel} = {unitMeta.metersPerUnit} m</span>
          </div>
        </div>

        {/* Underlay alignment for Network Design 2D & 3D */}
        <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-300">
              Căn chỉnh Nền Mạng (2D & 3D)
            </span>
            <button
              type="button"
              onClick={onAutoFitUnderlay}
              className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-slate-700"
            >
              Tự động khớp
            </button>
          </div>

          <label className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300">Hiển thị làm nền Thiết kế Mạng</span>
            <input
              type="checkbox"
              checked={doc.underlay.enabled}
              onChange={e => updateUnderlay({ enabled: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300">Hiển thị nền CAD trong 3D</span>
            <input
              type="checkbox"
              checked={doc.underlay.showIn3D}
              onChange={e => updateUnderlay({ showIn3D: e.target.checked })}
            />
          </label>

          <label className="block space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Độ mờ nền (Opacity)</span>
              <span>{Math.round(doc.underlay.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={doc.underlay.opacity}
              onChange={e => updateUnderlay({ opacity: Number(e.target.value) })}
              className="w-full"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-0.5">
              <span className="text-[10px] text-slate-400">Tỉ lệ (px/unit)</span>
              <input
                type="number"
                step={0.005}
                value={doc.underlay.scaleToCanvasPx}
                onChange={e => updateUnderlay({ scaleToCanvasPx: Math.max(0.0005, Number(e.target.value) || 0.05) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] text-slate-400">Góc xoay (°)</span>
              <input
                type="number"
                step={1}
                value={doc.underlay.rotationDeg}
                onChange={e => updateUnderlay({ rotationDeg: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] text-slate-400">Dịch X (px)</span>
              <input
                type="number"
                step={10}
                value={doc.underlay.offsetX}
                onChange={e => updateUnderlay({ offsetX: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] text-slate-400">Dịch Y (px)</span>
              <input
                type="number"
                step={10}
                value={doc.underlay.offsetY}
                onChange={e => updateUnderlay({ offsetY: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (selectedEntities.length > 1) {
    return (
      <div className="flex h-full flex-col space-y-3 p-3 text-xs">
        <div className="font-semibold text-white">
          Đang chọn {selectedEntities.length} đối tượng CAD
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Chuyển tất cả sang Layer</span>
          <select
            defaultValue=""
            onChange={e => {
              const targetLayer = e.target.value;
              if (!targetLayer) return;
              for (const ent of selectedEntities) {
                onPatchEntity(ent.id, prev => ({ ...prev, layer: targetLayer }), 'Đổi Layer hàng loạt');
              }
            }}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
          >
            <option value="">-- Giữ nguyên Layer --</option>
            {layerNames.map(n => (
              <option key={n} value={n}>
                {decodeAutoCadText(n)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onDeleteSelected}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xóa {selectedEntities.length} đối tượng
        </button>
      </div>
    );
  }

  const ent = selectedEntities[0];
  const isReadonlyOrUnknown = ent.preservationTier !== 'supported';

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 text-xs space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-white">
            {ent.type === 'UNKNOWN' ? ent.dxfType : ent.type}
          </div>
          <div className="text-[10px] text-slate-400">Handle DXF: #{ent.handle}</div>
        </div>
        <button
          type="button"
          onClick={onDeleteSelected}
          className="rounded p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
          title="Xóa đối tượng"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isReadonlyOrUnknown && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <div>
            {ent.preservationTier === 'unknown'
              ? 'Đối tượng đặc thù được bảo toàn mã DXF gốc để xuất Round-trip không mất dữ liệu.'
              : 'Đối tượng Hatch/Solid/Leader ở chế độ chỉ đọc hình học.'}
          </div>
        </div>
      )}

      {/* Common Properties */}
      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Layer</span>
          <select
            value={ent.layer}
            onChange={e =>
              onPatchEntity(ent.id, prev => ({ ...prev, layer: e.target.value }), 'Đổi Layer')
            }
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
          >
            {layerNames.map(n => (
              <option key={n} value={n}>
                {decodeAutoCadText(n)}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Màu sắc (ACI)</span>
          <select
            value={ent.colorIndex ?? 256}
            onChange={e =>
              onPatchEntity(
                ent.id,
                prev => ({ ...prev, colorIndex: Number(e.target.value), trueColor: undefined }),
                'Đổi màu đối tượng'
              )
            }
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
          >
            <option value={256}>ByLayer (Theo lớp)</option>
            <option value={0}>ByBlock (Theo khối)</option>
            {QUICK_ACI_SWATCHES.map(sw => (
              <option key={sw.aci} value={sw.aci}>
                {sw.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Type-specific geometry fields */}
      {ent.type === 'LINE' && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[11px] font-semibold text-cyan-300">Tọa độ Đoạn thẳng</div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-slate-400">Đầu X</span>
              <input
                type="number"
                value={Number(ent.start.x.toFixed(3))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'LINE'
                      ? { ...p, start: { ...p.start, x: Number(e.target.value) || 0 } }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Đầu Y</span>
              <input
                type="number"
                value={Number(ent.start.y.toFixed(3))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'LINE'
                      ? { ...p, start: { ...p.start, y: Number(e.target.value) || 0 } }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Cuối X</span>
              <input
                type="number"
                value={Number(ent.end.x.toFixed(3))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'LINE'
                      ? { ...p, end: { ...p.end, x: Number(e.target.value) || 0 } }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Cuối Y</span>
              <input
                type="number"
                value={Number(ent.end.y.toFixed(3))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'LINE'
                      ? { ...p, end: { ...p.end, y: Number(e.target.value) || 0 } }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
          </div>
          <div className="text-[11px] text-slate-400">
            Chiều dài:{' '}
            <span className="font-medium text-white">
              {Math.hypot(ent.end.x - ent.start.x, ent.end.y - ent.start.y).toFixed(2)}{' '}
              {unitMeta.shortLabel}
            </span>
          </div>
        </div>
      )}

      {(ent.type === 'CIRCLE' || ent.type === 'ARC') && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[11px] font-semibold text-cyan-300">
            {ent.type === 'CIRCLE' ? 'Đường tròn' : 'Cung tròn'}
          </div>
          <label className="block">
            <span className="text-[10px] text-slate-400">Bán kính (Radius)</span>
            <input
              type="number"
              min={0.1}
              value={Number(ent.radius.toFixed(3))}
              onChange={e =>
                onPatchEntity(ent.id, p =>
                  p.type === 'CIRCLE' || p.type === 'ARC'
                    ? { ...p, radius: Math.max(0.1, Number(e.target.value) || 1) }
                    : p
                )
              }
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
            />
          </label>
          {ent.type === 'ARC' && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="text-[10px] text-slate-400">Góc đầu (°)</span>
                <input
                  type="number"
                  value={Number(ent.startAngle.toFixed(1))}
                  onChange={e =>
                    onPatchEntity(ent.id, p =>
                      p.type === 'ARC' ? { ...p, startAngle: Number(e.target.value) || 0 } : p
                    )
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-400">Góc cuối (°)</span>
                <input
                  type="number"
                  value={Number(ent.endAngle.toFixed(1))}
                  onChange={e =>
                    onPatchEntity(ent.id, p =>
                      p.type === 'ARC' ? { ...p, endAngle: Number(e.target.value) || 0 } : p
                    )
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {(ent.type === 'TEXT' || ent.type === 'MTEXT') && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[11px] font-semibold text-cyan-300">Nội dung Chữ</div>
          <textarea
            rows={3}
            value={
              ent.type === 'TEXT'
                ? decodeAutoCadText(ent.text)
                : stripMTextFormatting(ent.plainText || ent.rawText)
            }
            onChange={e => {
              const nextVal = e.target.value;
              onPatchEntity(
                ent.id,
                p => {
                  if (p.type === 'TEXT') return { ...p, text: nextVal };
                  if (p.type === 'MTEXT') return { ...p, plainText: nextVal, rawText: nextVal };
                  return p;
                },
                'Sửa nội dung văn bản CAD'
              );
            }}
            className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-[11px] text-slate-100"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-slate-400">Chiều cao chữ</span>
              <input
                type="number"
                min={0.5}
                value={Number(ent.height.toFixed(2))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'TEXT' || p.type === 'MTEXT'
                      ? { ...p, height: Math.max(0.5, Number(e.target.value) || 2.5) }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Góc xoay (°)</span>
              <input
                type="number"
                value={Number(ent.rotation.toFixed(1))}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'TEXT' || p.type === 'MTEXT'
                      ? { ...p, rotation: Number(e.target.value) || 0 }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
          </div>
        </div>
      )}

      {ent.type === 'INSERT' && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[11px] font-semibold text-cyan-300">
            Block: {decodeAutoCadText(ent.blockName)}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-slate-400">Tỉ lệ X</span>
              <input
                type="number"
                step={0.1}
                value={ent.scale.x}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'INSERT'
                      ? { ...p, scale: { ...p.scale, x: Number(e.target.value) || 1 } }
                      : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Góc xoay (°)</span>
              <input
                type="number"
                value={ent.rotation}
                onChange={e =>
                  onPatchEntity(ent.id, p =>
                    p.type === 'INSERT' ? { ...p, rotation: Number(e.target.value) || 0 } : p
                  )
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onExplodeInsert(ent.id)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/40 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-900/50"
          >
            <Scale className="h-3.5 w-3.5" />
            Phá khối Block (Explode)
          </button>
        </div>
      )}
    </div>
  );
};
