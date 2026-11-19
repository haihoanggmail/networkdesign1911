import { APP_BUILD_HASH, APP_VERSION } from '../../config/appInfo';
import type { CADDocument, RawDxfGroupPair } from '../core/CADTypes';
import { CADHandleAllocator } from '../core/CADRegistry';
import { recomputeDocumentExtents } from '../geometry/CADBounds';
import {
  formatDxfPairs,
  serializeBlockToPairs,
  serializeDimStyleToPairs,
  serializeEntityToPairs,
  serializeHeaderToPairs,
  serializeLayerToPairs,
  serializeLineTypeToPairs,
  serializeTextStyleToPairs
} from './CADSerializer';
import { writeCleanDxf } from './DXFWriter';

function buildTablePairs(
  tableName: string,
  records: RawDxfGroupPair[][],
  allocator: CADHandleAllocator,
  includeAcDb: boolean
): RawDxfGroupPair[] {
  const pairs: RawDxfGroupPair[] = [
    { code: 0, value: 'TABLE' },
    { code: 2, value: tableName },
    { code: 5, value: allocator.allocate() }
  ];
  if (includeAcDb) {
    pairs.push({ code: 100, value: 'AcDbSymbolTable' });
  }
  pairs.push({ code: 70, value: records.length });
  for (const rec of records) {
    pairs.push(...rec);
  }
  pairs.push({ code: 0, value: 'ENDTAB' });
  return pairs;
}

/**
 * Lossless Round-Trip DXF Exporter:
 * - Preserves original DXF handles, untouched entity rawDxf group codes (incl. XDATA & OCS),
 *   and ALL unknown/unsupported entities (`3DSOLID`, `PROXY_ENTITY`, `REGION`, etc.).
 * - Preserves raw `CLASSES`, `OBJECTS`, and `THUMBNAILIMAGE` sections captured at import.
 * - Updates `$EXTMIN`/`$EXTMAX`/`$INSUNITS`/`$CLAYER`, layer definitions, modified/newly added
 *   entities, and excludes deleted entities.
 */
export function writeRoundTripDxf(doc: CADDocument): string {
  if (!doc.metadata.hasRawRoundTripData && (!doc.rawSections?.classes && !doc.rawSections?.objects)) {
    // Still emit with untouched raw handles if present, otherwise standard AC1015
    return writeCleanDxf(doc);
  }

  const allocator = new CADHandleAllocator(doc);
  const acadVer = doc.header.$ACADVER || 'AC1015';
  const includeAcDb = acadVer !== 'AC1009' && acadVer !== 'AC1006';
  const updatedExtents = recomputeDocumentExtents(doc);

  const headerWithExtents = {
    ...doc.header,
    $ACADVER: acadVer,
    $EXTMIN: { x: updatedExtents.minX, y: updatedExtents.minY, z: 0 },
    $EXTMAX: { x: updatedExtents.maxX, y: updatedExtents.maxY, z: 0 }
  };

  const pairs: RawDxfGroupPair[] = [
    { code: 999, value: `Round-trip DXF by HACHIHI AutoCAD Engine v${APP_VERSION} (${APP_BUILD_HASH})` },
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'HEADER' },
    ...serializeHeaderToPairs(headerWithExtents),
    { code: 0, value: 'ENDSEC' }
  ];

  // Preserve CLASSES section if captured
  if (doc.rawSections?.classes && doc.rawSections.classes.length > 0) {
    pairs.push(
      { code: 0, value: 'SECTION' },
      { code: 2, value: 'CLASSES' },
      ...doc.rawSections.classes,
      { code: 0, value: 'ENDSEC' }
    );
  }

  // TABLES (re-emitted from current document layers/lineTypes/styles/dimStyles)
  const ltypes = Object.values(doc.lineTypes).map(lt => serializeLineTypeToPairs(lt, allocator, includeAcDb));
  const layers = Object.values(doc.layers).map(l => serializeLayerToPairs(l, allocator, includeAcDb));
  const styles = Object.values(doc.textStyles).map(s => serializeTextStyleToPairs(s, allocator, includeAcDb));
  const dimstyles = Object.values(doc.dimStyles).map(d => serializeDimStyleToPairs(d, allocator, includeAcDb));

  pairs.push(
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    ...buildTablePairs('LTYPE', ltypes, allocator, includeAcDb),
    ...buildTablePairs('LAYER', layers, allocator, includeAcDb),
    ...buildTablePairs('STYLE', styles, allocator, includeAcDb),
    ...buildTablePairs('DIMSTYLE', dimstyles, allocator, includeAcDb),
    { code: 0, value: 'ENDSEC' }
  );

  // BLOCKS
  pairs.push({ code: 0, value: 'SECTION' }, { code: 2, value: 'BLOCKS' });
  for (const block of Object.values(doc.blocks)) {
    pairs.push(...serializeBlockToPairs(block, allocator, { includeAcDb, preferRawIfUntouched: true }));
  }
  pairs.push({ code: 0, value: 'ENDSEC' });

  // ENTITIES (untouched entities keep original rawDxf verbatim; dirty/new entities re-serialize cleanly)
  pairs.push({ code: 0, value: 'SECTION' }, { code: 2, value: 'ENTITIES' });
  for (const entity of doc.entities) {
    pairs.push(...serializeEntityToPairs(entity, allocator, { includeAcDb, preferRawIfUntouched: true }));
  }
  pairs.push({ code: 0, value: 'ENDSEC' });

  // Preserve OBJECTS section if captured
  if (doc.rawSections?.objects && doc.rawSections.objects.length > 0) {
    pairs.push(
      { code: 0, value: 'SECTION' },
      { code: 2, value: 'OBJECTS' },
      ...doc.rawSections.objects,
      { code: 0, value: 'ENDSEC' }
    );
  }

  // Preserve THUMBNAILIMAGE if captured
  if (doc.rawSections?.thumbnail && doc.rawSections.thumbnail.length > 0) {
    pairs.push(
      { code: 0, value: 'SECTION' },
      { code: 2, value: 'THUMBNAILIMAGE' },
      ...doc.rawSections.thumbnail,
      { code: 0, value: 'ENDSEC' }
    );
  }

  pairs.push({ code: 0, value: 'EOF' });
  return formatDxfPairs(pairs);
}
