import React, { useState } from 'react';
import { Terminal } from 'lucide-react';
import type { CADSnapSettings, CADToolId, CADUnitCode, Point2D } from '../core/CADTypes';
import { getCADUnitMeta } from '../core/CADUnits';

interface CADCommandBarProps {
  activeTool: CADToolId;
  promptVi: string;
  cursorWorld: Point2D;
  unitCode: CADUnitCode;
  snapSettings: CADSnapSettings;
  onUpdateSnapSettings: (next: CADSnapSettings) => void;
  onRunCommandLine: (input: string) => void;
}

export const CADCommandBar: React.FC<CADCommandBarProps> = ({
  activeTool,
  promptVi,
  cursorWorld,
  unitCode,
  snapSettings,
  onUpdateSnapSettings,
  onRunCommandLine
}) => {
  const [cmdText, setCmdText] = useState('');
  const unitMeta = getCADUnitMeta(unitCode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cmdText.trim();
    if (!trimmed) return;
    onRunCommandLine(trimmed);
    setCmdText('');
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-3 py-1.5 text-[11px]">
      {/* Command prompt */}
      <form onSubmit={handleSubmit} className="flex min-w-[260px] flex-1 items-center gap-2">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
        <span className="hidden text-slate-400 sm:inline">{promptVi}</span>
        <input
          type="text"
          value={cmdText}
          onChange={e => setCmdText(e.target.value)}
          placeholder={`Lệnh [${activeTool.toUpperCase()}]: L, PL, C, REC, M, CO, RO, SC, MI, O, TR, EX, DI, Z...`}
          className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-100 outline-none focus:border-cyan-500"
        />
      </form>

      {/* Live status toggles */}
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
          X: {cursorWorld.x.toFixed(1)} &nbsp; Y: {cursorWorld.y.toFixed(1)} {unitMeta.shortLabel}
        </span>

        <button
          type="button"
          onClick={() => onUpdateSnapSettings({ ...snapSettings, enabled: !snapSettings.enabled })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            snapSettings.enabled
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
              : 'bg-slate-900 text-slate-500 border border-slate-800'
          }`}
          title="Bật/tắt OSNAP (F3)"
        >
          OSNAP
        </button>

        <button
          type="button"
          onClick={() => onUpdateSnapSettings({ ...snapSettings, ortho: !snapSettings.ortho })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            snapSettings.ortho
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900 text-slate-500 border border-slate-800'
          }`}
          title="Khóa thẳng góc Ngang/Dọc (F8)"
        >
          ORTHO
        </button>

        <button
          type="button"
          onClick={() => onUpdateSnapSettings({ ...snapSettings, polar: !snapSettings.polar })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            snapSettings.polar
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900 text-slate-500 border border-slate-800'
          }`}
          title="Bắt góc cực 45° (F10)"
        >
          POLAR
        </button>

        <button
          type="button"
          onClick={() => onUpdateSnapSettings({ ...snapSettings, gridSnap: !snapSettings.gridSnap })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            snapSettings.gridSnap
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900 text-slate-500 border border-slate-800'
          }`}
          title="Bắt lưới tọa độ (F9)"
        >
          GRID
        </button>
      </div>
    </div>
  );
};
