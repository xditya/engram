// DECISION: op values and pushed batches are JSON (UTF-8 bytes), not CBOR.
export interface Op {
  hlc: string; // "wallms-counter-deviceid", lexically sortable
  deviceId: string;
  tbl: string;
  rowId: string;
  col: string;
  value: unknown;
  schemaVersion: number;
}
