import type { Table } from 'dexie';
import type { BaseRecord } from '../domain/types';
import { clock, newId } from './ids';

type WithId = BaseRecord & { id: string };
/** Input for creating a record: everything except generated fields; `id` optional. */
export type NewRecord<T extends WithId> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  id?: string;
};
export type Patch<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

const alive = <T extends BaseRecord>(r: T | undefined): r is T => !!r && !r.deletedAt;

/** Generic repository for id-keyed tables with timestamps and soft delete. */
export function createRepo<T extends WithId>(table: Table<T, string>) {
  return {
    table,

    async create(data: NewRecord<T>): Promise<T> {
      const now = clock.now();
      const rec = { ...data, id: data.id ?? newId(), createdAt: now, updatedAt: now } as T;
      await table.add(rec);
      return rec;
    },

    /** Returns the record unless it is soft-deleted (pass `includeDeleted` to override). */
    async get(id: string, opts?: { includeDeleted?: boolean }): Promise<T | undefined> {
      const r = await table.get(id);
      return opts?.includeDeleted ? r : alive(r) ? r : undefined;
    },

    async update(id: string, patch: Patch<T>): Promise<T> {
      return table.db.transaction('rw', table, async () => {
        const cur = await table.get(id);
        if (!cur) throw new Error(`Record not found: ${table.name}/${id}`);
        const next = { ...cur, ...patch, id, createdAt: cur.createdAt, updatedAt: clock.now() };
        await table.put(next);
        return next;
      });
    },

    /** Marks as deleted (Undo-able via `restore`). */
    async softDelete(id: string): Promise<void> {
      const now = clock.now();
      const n = await table.update(id, { deletedAt: now, updatedAt: now } as never);
      if (!n) throw new Error(`Record not found: ${table.name}/${id}`);
    },

    async restore(id: string): Promise<void> {
      await table.db.transaction('rw', table, async () => {
        const cur = await table.get(id);
        if (!cur) throw new Error(`Record not found: ${table.name}/${id}`);
        const next = { ...cur, updatedAt: clock.now() };
        delete next.deletedAt;
        await table.put(next);
      });
    },

    async hardDelete(id: string): Promise<void> {
      await table.delete(id);
    },

    /** All non-deleted records. */
    async list(): Promise<T[]> {
      return table.filter((r) => !r.deletedAt).toArray();
    },

    /** Non-deleted records whose indexed `field` equals `value`. */
    async where(field: string, value: string | number): Promise<T[]> {
      return table
        .where(field)
        .equals(value)
        .filter((r) => !r.deletedAt)
        .toArray();
    },
  };
}

export type Repo<T extends WithId> = ReturnType<typeof createRepo<T>>;
