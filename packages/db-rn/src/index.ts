import type { Database, FileStore, KeyStore, StorageAdapter } from '@engram/core';

// React Native implementations of the core Platform pieces. Stubs until the native milestone lands.
const todo = (what: string): never => { throw new Error(`${what}: not implemented`); };

export function createOpSqliteDatabase(_path: string): Database { return todo('createOpSqliteDatabase'); }
export function createSecureKeyStore(): KeyStore { return todo('createSecureKeyStore'); }
export function createFileStore(_dir: string): FileStore { return todo('createFileStore'); }
export function createICloudAdapter(): StorageAdapter { return todo('createICloudAdapter'); }
