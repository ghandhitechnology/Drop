/**
 * A Node stand-in for `expo-sqlite`, backed by the real SQLite engine that
 * ships with Node (`node:sqlite`).
 *
 * Vitest aliases `expo-sqlite` to this module, so `db.ts`, `schema.ts`,
 * `catalog.ts`, and `entries.ts` run **unmodified** against a real database
 * file: real WAL, real transactions, real constraint enforcement. What the
 * tests exercise is the shipping SQL, not a mock of it.
 *
 * This file is deliberately not named `*.test.ts`, so the runner treats it as a
 * helper rather than a suite.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type SQLiteBindValue = string | number | null | Uint8Array;

/** expo-sqlite accepts either a params array or loose variadic params. */
function normalizeParams(args: unknown[]): SQLiteBindValue[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0] as SQLiteBindValue[];
  return args as SQLiteBindValue[];
}

export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

export class SQLiteStatement {
  constructor(private readonly statement: StatementSync) {}

  async executeAsync(params: SQLiteBindValue[] = []): Promise<SQLiteRunResult> {
    const result = this.statement.run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async finalizeAsync(): Promise<void> {
    // node:sqlite finalises statements on garbage collection.
  }
}

export class SQLiteDatabase {
  constructor(private readonly db: DatabaseSync) {}

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(source: string, ...args: unknown[]): Promise<SQLiteRunResult> {
    const result = this.db.prepare(source).run(...normalizeParams(args));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getAllAsync<T>(source: string, ...args: unknown[]): Promise<T[]> {
    return this.db.prepare(source).all(...normalizeParams(args)) as T[];
  }

  async getFirstAsync<T>(source: string, ...args: unknown[]): Promise<T | null> {
    const row = this.db.prepare(source).get(...normalizeParams(args));
    return (row ?? null) as T | null;
  }

  async prepareAsync(source: string): Promise<SQLiteStatement> {
    return new SQLiteStatement(this.db.prepare(source));
  }

  /**
   * BEGIN IMMEDIATE matches expo-sqlite's exclusive transaction: the write lock
   * is taken up front, so a failure part-way rolls the whole step back.
   */
  async withExclusiveTransactionAsync(
    task: (txn: SQLiteDatabase) => Promise<void>,
  ): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

/** One directory per process, so a suite gets a real file and real WAL. */
const directory = mkdtempSync(join(tmpdir(), 'drop-data-'));

export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  return new SQLiteDatabase(new DatabaseSync(join(directory, name)));
}

export function openDatabaseSync(name: string): SQLiteDatabase {
  return new SQLiteDatabase(new DatabaseSync(join(directory, name)));
}

/** The on-disk location the suite can reopen to prove durability. */
export const databaseDirectory = directory;
