import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Snowflake,
  Unlock
} from 'lucide-react';
import { QUICK_ACI_SWATCHES, resolveLayerColorHex } from '../core/CADColorPalette';
import { createDefaultLayer } from '../core/CADDocument';
import type { CADDocument, CADLayer } from '../core/CADTypes';
import { decodeAutoCadText } from '../geometry/CADCurve';

interface CADLayerPanelProps {
  doc: CADDocument;
  activeLayerName: string;
  onSetActiveLayer: (name: string) => void;
  onUpdateLayer: (layer: CADLayer) => void;
  onCreateLayer: (layer: CADLayer) => void;
  onShowAllLayers: () => void;
}

export const CADLayerPanel: React.FC<CADLayerPanelProps> = ({
  doc,
  activeLayerName,
  onSetActiveLayer,
  onUpdateLayer,
  onCreateLayer,
  onShowAllLayers
}) => {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of doc.entities) {
      counts[e.layer] = (counts[e.layer] || 0) + 1;
    }
    return counts;
  }, [doc.entities]);

  const layers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(doc.layers)
      .filter(l => {
        if (!q) return true;
        const decoded = decodeAutoCadText(l.name).toLowerCase();
        return decoded.includes(q) || l.name.toLowerCase().includes(q);
      })
      .sort((a, b) =>
        a.name === '0'
          ? -1
          : b.name === '0'
            ? 1
            : decodeAutoCadText(a.name).localeCompare(decodeAutoCadText(b.name))
      );
  }, [doc.layers, search]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newName.trim().replace(/[^\w\u00C0-\u1EF9-]/g, '_');
    if (!clean || doc.layers[clean]) return;
    const layer = createDefaultLayer(clean, 3);
    onCreateLayer(layer);
    onSetActiveLayer(clean);
    setNewName('');
  };

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="space-y-2 border-b border-slate-800 p-2.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-200">Quản lý Lớp ({layers.length})</span>
          <button
            type="button"
            onClick={onShowAllLayers}
            className="text-[11px] text-cyan-400 hover:underline"
          >
            Hiện tất cả
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm Layer..."
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
        />
        <form onSubmit={handleAdd} className="flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Tên Layer mới..."
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-500"
            title="Thêm Layer mới"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {layers.map(layer => {
          const isCurrent = layer.name === activeLayerName;
          const colorHex = resolveLayerColorHex(layer, false);
          return (
            <div
              key={layer.name}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 ${
                isCurrent ? 'bg-cyan-950/35' : 'hover:bg-slate-800/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSetActiveLayer(layer.name)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isCurrent
                    ? 'border-cyan-400 bg-cyan-600 text-white'
                    : 'border-slate-700 text-transparent hover:border-slate-500'
                }`}
                title="Đặt làm Layer hiện hành ($CLAYER)"
              >
                <Check className="h-3 w-3" />
              </button>

              <div
                className="relative h-4 w-4 shrink-0 overflow-hidden rounded border border-slate-600 shadow-inner"
                style={{ backgroundColor: colorHex }}
                title="Đổi màu ACI"
              >
                <select
                  value={layer.colorIndex}
                  onChange={e =>
                    onUpdateLayer({ ...layer, colorIndex: Number(e.target.value) || 7 })
                  }
                  aria-label={`Màu ACI lớp ${decodeAutoCadText(layer.name)}`}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {QUICK_ACI_SWATCHES.map(sw => (
                    <option key={sw.aci} value={sw.aci} className="bg-slate-900 text-slate-100">
                      {sw.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => onSetActiveLayer(layer.name)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[11px] font-medium text-slate-200" title={decodeAutoCadText(layer.name)}>
                  {decodeAutoCadText(layer.name)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {entityCounts[layer.name] || 0} đối tượng • {layer.lineType}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onUpdateLayer({ ...layer, visible: !layer.visible })}
                className={`rounded p-1 ${
                  layer.visible ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-800'
                }`}
                title={layer.visible ? 'Tắt hiển thị (Off)' : 'Bật hiển thị (On)'}
              >
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => onUpdateLayer({ ...layer, frozen: !layer.frozen })}
                className={`rounded p-1 ${
                  layer.frozen ? 'text-sky-400 bg-sky-950/40' : 'text-slate-500 hover:bg-slate-800'
                }`}
                title={layer.frozen ? 'Rã đông (Thaw)' : 'Đóng băng (Freeze)'}
              >
                <Snowflake className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onUpdateLayer({ ...layer, locked: !layer.locked })}
                className={`rounded p-1 ${
                  layer.locked ? 'text-amber-400 bg-amber-950/40' : 'text-slate-500 hover:bg-slate-800'
                }`}
                title={layer.locked ? 'Mở khóa Layer' : 'Khóa chỉnh sửa Layer'}
              >
                {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
