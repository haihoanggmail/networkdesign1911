import React, { useMemo, useState } from 'react';
import { Box, Link2Off, PlusCircle } from 'lucide-react';
import type { CADDocument } from '../core/CADTypes';
import { decodeAutoCadText } from '../geometry/CADCurve';

interface CADBlockPanelProps {
  doc: CADDocument;
  activeInsertBlockName: string | null;
  onStartInsertBlock: (blockName: string) => void;
}

export const CADBlockPanel: React.FC<CADBlockPanelProps> = ({
  doc,
  activeInsertBlockName,
  onStartInsertBlock
}) => {
  const [search, setSearch] = useState('');

  const blocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(doc.blocks)
      .filter(
        b =>
          !b.name.startsWith('*Model_Space') &&
          !b.name.startsWith('*Paper_Space') &&
          (!q || decodeAutoCadText(b.name).toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
      )
      .sort((a, b) => decodeAutoCadText(a.name).localeCompare(decodeAutoCadText(b.name)));
  }, [doc.blocks, search]);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="space-y-2 border-b border-slate-800 p-2.5">
        <div className="font-semibold text-slate-200">Thư viện Block ({blocks.length})</div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm tên Block..."
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {blocks.length === 0 && (
          <div className="p-4 text-center text-[11px] text-slate-500">
            Bản vẽ chưa có định nghĩa Block nào.
          </div>
        )}
        {blocks.map(blk => {
          const isActive = activeInsertBlockName === blk.name;
          return (
            <div
              key={blk.name}
              className={`flex items-center justify-between gap-2 px-2.5 py-2 ${
                isActive ? 'bg-cyan-950/40' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Box className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <span className="truncate" title={decodeAutoCadText(blk.name)}>
                    {decodeAutoCadText(blk.name)}
                  </span>
                  {blk.xrefPath && (
                    <span title={`Xref ngoài: ${blk.xrefPath}`}>
                      <Link2Off className="h-3 w-3 text-amber-400" />
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  {blk.entities.length} đối tượng • Gốc ({blk.basePoint.x.toFixed(1)}, {blk.basePoint.y.toFixed(1)})
                </div>
              </div>
              <button
                type="button"
                onClick={() => onStartInsertBlock(blk.name)}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-600 hover:text-white"
              >
                <PlusCircle className="h-3 w-3" />
                Chèn
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
