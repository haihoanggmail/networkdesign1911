import type {
  BoundingBox2D,
  CADBlock,
  CADDimensionStyle,
  CADDocument,
  CADDocumentMetadata,
  CADEntity,
  CADHeaderVariables,
  CADLayer,
  CADLayout,
  CADLineType,
  CADRawSections,
  CADTextStyle,
  CADUnderlayAlignment
} from '../core/CADTypes';
import { createCadId } from '../core/CADRegistry';
import { CAD_ENTITY_CHUNK_SIZE, cadDatabase } from './CADDatabase';

export interface CADDocumentSummary {
  id: string;
  name: string;
  projectId?: string;
  entityCount: number;
  layerCount: number;
  updatedAt: string;
  acadVersion: string;
  sourceFileName: string;
}

interface StoredDocumentRecord {
  id: string;
  name: string;
  projectId?: string;
  schemaVersion: number;
  header: CADHeaderVariables;
  extents: BoundingBox2D;
  nextHandleSeed: number;
  rawSections?: CADRawSections;
  metadata: CADDocumentMetadata;
  underlay: CADUnderlayAlignment;
  entityCount: number;
  layerCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredEntityChunk {
  id: string;
  docId: string;
  chunkIndex: number;
  entities: CADEntity[];
}

export class CADRepository {
  async saveDocument(doc: CADDocument): Promise<void> {
    const chunkCount = Math.max(1, Math.ceil(doc.entities.length / CAD_ENTITY_CHUNK_SIZE));
    const docRecord: StoredDocumentRecord = {
      id: doc.id,
      name: doc.name,
      projectId: doc.projectId,
      schemaVersion: doc.schemaVersion,
      header: doc.header,
      extents: doc.extents,
      nextHandleSeed: doc.nextHandleSeed,
      rawSections: doc.rawSections,
      metadata: doc.metadata,
      underlay: doc.underlay,
      entityCount: doc.entities.length,
      layerCount: Object.keys(doc.layers).length,
      chunkCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };

    await cadDatabase.putRecord('documents', docRecord);
    await cadDatabase.putRecord('layers', { id: doc.id, docId: doc.id, layers: doc.layers });
    await cadDatabase.putRecord('blocks', { id: doc.id, docId: doc.id, blocks: doc.blocks });
    await cadDatabase.putRecord('styles', {
      id: doc.id,
      docId: doc.id,
      lineTypes: doc.lineTypes,
      textStyles: doc.textStyles,
      dimStyles: doc.dimStyles
    });
    await cadDatabase.putRecord('layouts', { id: doc.id, docId: doc.id, layouts: doc.layouts });

    // Replace entity chunks cleanly via streaming batch transactions + V8 heap checks
    await cadDatabase.saveEntityChunksStreaming(doc.id, doc.entities, {
      chunkSize: CAD_ENTITY_CHUNK_SIZE
    });
  }

  async loadDocument(docId: string): Promise<CADDocument | null> {
    const meta = await cadDatabase.getRecord<StoredDocumentRecord>('documents', docId);
    if (!meta) return null;

    const [layersRec, blocksRec, stylesRec, layoutsRec, chunks] = await Promise.all([
      cadDatabase.getRecord<{ id: string; docId: string; layers: Record<string, CADLayer> }>('layers', docId),
      cadDatabase.getRecord<{ id: string; docId: string; blocks: Record<string, CADBlock> }>('blocks', docId),
      cadDatabase.getRecord<{
        id: string;
        docId: string;
        lineTypes: Record<string, CADLineType>;
        textStyles: Record<string, CADTextStyle>;
        dimStyles: Record<string, CADDimensionStyle>;
      }>('styles', docId),
      cadDatabase.getRecord<{ id: string; docId: string; layouts: CADLayout[] }>('layouts', docId),
      cadDatabase.getRecordsByDocId<StoredEntityChunk>('entities', docId)
    ]);

    const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const entities: CADEntity[] = [];
    for (const c of sortedChunks) {
      entities.push(...c.entities);
    }

    return {
      id: meta.id,
      name: meta.name,
      projectId: meta.projectId,
      schemaVersion: meta.schemaVersion,
      header: meta.header,
      layers: layersRec?.layers || {},
      lineTypes: stylesRec?.lineTypes || {},
      textStyles: stylesRec?.textStyles || {},
      dimStyles: stylesRec?.dimStyles || {},
      blocks: blocksRec?.blocks || {},
      layouts: layoutsRec?.layouts || [{ name: 'Model', tabOrder: 0, isModelSpace: true }],
      entities,
      extents: meta.extents,
      nextHandleSeed: meta.nextHandleSeed,
      rawSections: meta.rawSections,
      metadata: meta.metadata,
      underlay: meta.underlay,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt
    };
  }

  async listDocuments(): Promise<CADDocumentSummary[]> {
    const records = await cadDatabase.getAllRecords<StoredDocumentRecord>('documents');
    return records
      .map(r => ({
        id: r.id,
        name: r.name,
        projectId: r.projectId,
        entityCount: r.entityCount ?? 0,
        layerCount: r.layerCount ?? 0,
        updatedAt: r.updatedAt,
        acadVersion: r.metadata?.acadVersion || r.header?.$ACADVER || 'AC1015',
        sourceFileName: r.metadata?.sourceFileName || `${r.name}.dxf`
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listDocumentsForProject(projectId: string): Promise<CADDocumentSummary[]> {
    const all = await this.listDocuments();
    return all.filter(d => d.projectId === projectId);
  }

  async deleteDocument(docId: string): Promise<void> {
    await Promise.all([
      cadDatabase.deleteRecord('documents', docId),
      cadDatabase.deleteRecord('layers', docId),
      cadDatabase.deleteRecord('blocks', docId),
      cadDatabase.deleteRecord('styles', docId),
      cadDatabase.deleteRecord('layouts', docId),
      cadDatabase.deleteRecordsByDocId('entities', docId),
      cadDatabase.deleteRecordsByDocId('revisions', docId),
      cadDatabase.deleteRecordsByDocId('attachments', docId)
    ]);
  }

  async deleteDocumentsForProject(projectId: string): Promise<number> {
    if (!projectId) return 0;
    const docs = await this.listDocumentsForProject(projectId);
    for (const summary of docs) {
      await this.deleteDocument(summary.id);
    }
    return docs.length;
  }

  async cloneDocumentsForProject(sourceProjectId: string, targetProjectId: string): Promise<CADDocument[]> {
    if (!sourceProjectId || !targetProjectId || sourceProjectId === targetProjectId) return [];
    const summaries = await this.listDocumentsForProject(sourceProjectId);
    const clonedDocs: CADDocument[] = [];
    const now = new Date().toISOString();

    for (const summary of summaries) {
      const sourceDoc = await this.loadDocument(summary.id);
      if (!sourceDoc) continue;
      const cloned: CADDocument = {
        ...structuredClone(sourceDoc),
        id: createCadId('cad'),
        projectId: targetProjectId,
        createdAt: now,
        updatedAt: now
      };
      await this.saveDocument(cloned);
      clonedDocs.push(cloned);
    }

    return clonedDocs;
  }
}

export const cadRepository = new CADRepository();
