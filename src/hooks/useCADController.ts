import { useCallback, useEffect, useRef, useState } from 'react';
import type { CADCommand } from '../cad/commands/CADCommand';
import { CADCommandManager } from '../cad/commands/CADCommandManager';
import type { CADDocument } from '../cad/core/CADTypes';
import { cadAutosave } from '../cad/storage/CADAutosave';
import { cadRepository } from '../cad/storage/CADRepository';
import { cadRevisionManager } from '../cad/storage/CADRevisionManager';
import type { ProjectState } from '../types/infrastructure';

export const CAD_PROJECT_SYNC_EVENT = 'hachihi-cad-project-sync';

export function notifyCadProjectSync(projectId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CAD_PROJECT_SYNC_EVENT, { detail: { projectId } })
  );
}

export type WorkspaceMode = 'network' | 'cad';

export interface UseCADControllerOptions {
  project: ProjectState;
  onNotify?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export function useCADController({ project, onNotify }: UseCADControllerOptions) {
  const [cadDoc, setCadDoc] = useState<CADDocument | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('network');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const commandManagerRef = useRef<CADCommandManager>(new CADCommandManager(100));
  const cadDocRef = useRef<CADDocument | null>(null);
  cadDocRef.current = cadDoc;
  const loadedProjectIdRef = useRef<string | null>(null);

  const syncCommandFlags = useCallback(() => {
    setCanUndo(commandManagerRef.current.canUndo());
    setCanRedo(commandManagerRef.current.canRedo());
  }, []);

  // Load most recent CAD drawing linked to the current HACHIHI project & react to lifecycle sync events
  useEffect(() => {
    const pid = project.id;
    if (!pid) return;

    let cancelled = false;
    const loadLinkedCadForProject = (forceRefresh: boolean) => {
      if (!forceRefresh && loadedProjectIdRef.current === pid) return;
      loadedProjectIdRef.current = pid;

      void cadRepository
        .listDocumentsForProject(pid)
        .then(async summaries => {
          if (cancelled) return;
          if (summaries.length === 0) {
            if (cadDocRef.current && (forceRefresh || cadDocRef.current.projectId !== pid)) {
              commandManagerRef.current.clear();
              syncCommandFlags();
              setCadDoc(null);
              setWorkspaceMode('network');
            }
            return;
          }
          const loaded = await cadRepository.loadDocument(summaries[0].id);
          if (!cancelled && loaded) {
            commandManagerRef.current.clear();
            syncCommandFlags();
            setCadDoc(loaded);
          }
        })
        .catch(() => {
          // Ignore storage errors silently in initial load
        });
    };

    loadLinkedCadForProject(false);

    const handleSyncEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === pid) {
        loadLinkedCadForProject(true);
      }
    };
    window.addEventListener(CAD_PROJECT_SYNC_EVENT, handleSyncEvent);

    return () => {
      cancelled = true;
      window.removeEventListener(CAD_PROJECT_SYNC_EVENT, handleSyncEvent);
    };
  }, [project.id, syncCommandFlags]);

  // Flush autosave on unmount or pagehide
  useEffect(() => {
    const onPageHide = () => {
      void cadAutosave.flush();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      void cadAutosave.flush();
    };
  }, []);

  const openImportDialog = useCallback((file?: File | null) => {
    setPendingImportFile(file ?? null);
    setIsImportDialogOpen(true);
  }, []);

  const closeImportDialog = useCallback(() => {
    setIsImportDialogOpen(false);
    setPendingImportFile(null);
  }, []);

  const openCadDocument = useCallback(
    (doc: CADDocument, options?: { openInNetworkUnderlay?: boolean }) => {
      const nextDoc: CADDocument = {
        ...doc,
        projectId: project.id,
        underlay: options?.openInNetworkUnderlay
          ? { ...doc.underlay, enabled: true }
          : doc.underlay,
        updatedAt: new Date().toISOString()
      };
      commandManagerRef.current.clear();
      syncCommandFlags();
      setCadDoc(nextDoc);
      setWorkspaceMode(options?.openInNetworkUnderlay ? 'network' : 'cad');
      void cadRepository.saveDocument(nextDoc);
      onNotify?.(
        options?.openInNetworkUnderlay
          ? `Đã lồng bản vẽ AutoCAD "${nextDoc.name}" làm lớp nền thiết kế mạng.`
          : `Đã mở "${nextDoc.name}" trong AutoCAD Studio.`,
        'success'
      );
    },
    [onNotify, project.id, syncCommandFlags]
  );

  const executeCadCommand = useCallback(
    (cmd: CADCommand) => {
      setCadDoc(prev => {
        if (!prev) return prev;
        const next = commandManagerRef.current.execute(prev, cmd);
        syncCommandFlags();
        cadAutosave.schedule(next);
        return next;
      });
    },
    [syncCommandFlags]
  );

  const undoCad = useCallback(() => {
    setCadDoc(prev => {
      if (!prev) return prev;
      const restored = commandManagerRef.current.undo(prev);
      syncCommandFlags();
      if (!restored) return prev;
      cadAutosave.schedule(restored);
      return restored;
    });
  }, [syncCommandFlags]);

  const redoCad = useCallback(() => {
    setCadDoc(prev => {
      if (!prev) return prev;
      const redone = commandManagerRef.current.redo(prev);
      syncCommandFlags();
      if (!redone) return prev;
      cadAutosave.schedule(redone);
      return redone;
    });
  }, [syncCommandFlags]);

  const updateCadDocumentSettings = useCallback((updater: (doc: CADDocument) => CADDocument) => {
    setCadDoc(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      const stamped: CADDocument = {
        ...next,
        updatedAt: new Date().toISOString()
      };
      cadAutosave.schedule(stamped);
      return stamped;
    });
  }, []);

  const toggleCadUnderlayEnabled = useCallback(() => {
    updateCadDocumentSettings(doc => ({
      ...doc,
      underlay: {
        ...doc.underlay,
        enabled: !doc.underlay.enabled
      }
    }));
  }, [updateCadDocumentSettings]);

  const toggleCadUnderlay3D = useCallback(() => {
    updateCadDocumentSettings(doc => ({
      ...doc,
      underlay: {
        ...doc.underlay,
        showIn3D: !doc.underlay.showIn3D
      }
    }));
  }, [updateCadDocumentSettings]);

  const changeCadUnderlayOpacity = useCallback(
    (opacity: number) => {
      const clamped = Math.max(0.05, Math.min(1, opacity));
      updateCadDocumentSettings(doc => ({
        ...doc,
        underlay: {
          ...doc.underlay,
          opacity: clamped
        }
      }));
    },
    [updateCadDocumentSettings]
  );

  const toggleCadLayerVisibility = useCallback(
    (layerName: string) => {
      updateCadDocumentSettings(doc => {
        const layer = doc.layers[layerName];
        if (!layer) return doc;
        return {
          ...doc,
          layers: {
            ...doc.layers,
            [layerName]: {
              ...layer,
              visible: !layer.visible
            }
          }
        };
      });
    },
    [updateCadDocumentSettings]
  );

  const autoFitUnderlayToProject = useCallback(() => {
    updateCadDocumentSettings(doc => {
      const ext = doc.extents;
      const cadW = Math.max(1e-3, ext.maxX - ext.minX);
      const cadH = Math.max(1e-3, ext.maxY - ext.minY);
      const cadCenterX = (ext.minX + ext.maxX) / 2;
      const cadCenterY = (ext.minY + ext.maxY) / 2;

      // Compute active floor target bounds (rooms & visible nodes), fallback to 1000x660 canvas region
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const room of project.rooms) {
        if (project.activeFloorId && room.floorId && room.floorId !== project.activeFloorId) continue;
        minX = Math.min(minX, room.x);
        minY = Math.min(minY, room.y);
        maxX = Math.max(maxX, room.x + room.width);
        maxY = Math.max(maxY, room.y + room.height);
      }
      for (const node of project.nodes) {
        if (node.hidden) continue;
        if (project.activeFloorId && node.floorId && node.floorId !== project.activeFloorId) continue;
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      if (!Number.isFinite(minX) || maxX - minX < 40 || maxY - minY < 40) {
        minX = 120;
        minY = 80;
        maxX = 1080;
        maxY = 720;
      }

      const targetW = Math.max(200, maxX - minX);
      const targetH = Math.max(200, maxY - minY);
      const targetCenterX = (minX + maxX) / 2;
      const targetCenterY = (minY + maxY) / 2;

      const s = Math.max(1e-5, Math.min(100, Math.min(targetW / cadW, targetH / cadH)));
      return {
        ...doc,
        underlay: {
          ...doc.underlay,
          enabled: true,
          rotationDeg: 0,
          scaleToCanvasPx: Number(s.toFixed(6)),
          offsetX: Math.round(targetCenterX - cadCenterX * s),
          offsetY: Math.round(targetCenterY + cadCenterY * s)
        }
      };
    });
    onNotify?.('Đã tự động căn khớp bản vẽ AutoCAD với sơ đồ hạ tầng mạng.', 'success');
  }, [onNotify, project.activeFloorId, project.nodes, project.rooms, updateCadDocumentSettings]);

  const saveCadRevision = useCallback(
    async (labelVi = 'Bản lưu thủ công') => {
      const current = cadDocRef.current;
      if (!current) return;
      await cadAutosave.flush();
      await cadRepository.saveDocument(current);
      await cadRevisionManager.createRevision(current, labelVi);
      onNotify?.(`Đã lưu bản chụp AutoCAD "${current.name}" vào IndexedDB.`, 'success');
    },
    [onNotify]
  );

  const applyToNetworkDesign = useCallback(() => {
    updateCadDocumentSettings(doc => ({
      ...doc,
      underlay: {
        ...doc.underlay,
        enabled: true
      }
    }));
    setWorkspaceMode('network');
    onNotify?.('Đã chuyển sang không gian Thiết kế Mạng với lớp nền AutoCAD đang bật.', 'info');
  }, [onNotify, updateCadDocumentSettings]);

  return {
    cadDoc,
    workspaceMode,
    setWorkspaceMode,
    isImportDialogOpen,
    pendingImportFile,
    canUndo,
    canRedo,
    openImportDialog,
    closeImportDialog,
    openCadDocument,
    executeCadCommand,
    undoCad,
    redoCad,
    updateCadDocumentSettings,
    toggleCadUnderlayEnabled,
    toggleCadUnderlay3D,
    changeCadUnderlayOpacity,
    toggleCadLayerVisibility,
    autoFitUnderlayToProject,
    saveCadRevision,
    applyToNetworkDesign
  };
}
