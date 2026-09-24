import { env } from 'cloudflare:workers';
import { createSeatingStateTableSql } from '@/db/schema';

export const dynamic = 'force-dynamic';

type SharedState = {
  guests: unknown[];
  tables: unknown[];
  tableOrder?: unknown[];
};

function isValidGuest(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const guest = value as Record<string, unknown>;
  return typeof guest.id === 'number'
    && typeof guest.name === 'string'
    && (guest.side === '신부측' || guest.side === '신랑측')
    && typeof guest.group === 'string';
}

function isValidTable(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const table = value as Record<string, unknown>;
  return (table.capacity === 8 || table.capacity === 9 || table.capacity === 10)
    && Array.isArray(table.seats)
    && table.seats.length === 10
    && table.seats.every((id) => id === null || typeof id === 'number');
}

function isValidTableOrder(value: unknown) {
  return Array.isArray(value)
    && value.length === 23
    && new Set(value).size === 23
    && value.every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 23);
}

function database(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(createSeatingStateTableSql).run();
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

export async function GET() {
  const db = database();
  await ensureSchema(db);
  const row = await db.prepare(
    'SELECT payload, version, updated_at FROM seating_state WHERE id = 1',
  ).first<{ payload: string; version: number; updated_at: string }>();

  if (!row) return json({ state: null, version: 0, updatedAt: null });

  try {
    return json({
      state: JSON.parse(row.payload),
      version: row.version,
      updatedAt: row.updated_at,
    });
  } catch {
    return json({ error: '저장된 배치 데이터를 읽지 못했어요.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { state?: SharedState } | null;
  if (!body?.state || !Array.isArray(body.state.guests) || !Array.isArray(body.state.tables)) {
    return json({ error: '올바른 배치 데이터가 필요합니다.' }, { status: 400 });
  }
  if (body.state.tables.length !== 23
    || body.state.guests.length > 1000
    || !body.state.guests.every(isValidGuest)
    || !body.state.tables.every(isValidTable)
    || (body.state.tableOrder !== undefined && !isValidTableOrder(body.state.tableOrder))) {
    return json({ error: '배치 데이터의 크기가 올바르지 않습니다.' }, { status: 400 });
  }

  const payload = JSON.stringify(body.state);
  if (payload.length > 1_500_000) {
    return json({ error: '배치 데이터가 너무 큽니다.' }, { status: 413 });
  }

  const db = database();
  await ensureSchema(db);
  const updatedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO seating_state (id, payload, version, updated_at)
    VALUES (1, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      version = seating_state.version + 1,
      updated_at = excluded.updated_at
  `).bind(payload, updatedAt).run();

  const row = await db.prepare(
    'SELECT version, updated_at FROM seating_state WHERE id = 1',
  ).first<{ version: number; updated_at: string }>();

  return json({ version: row?.version ?? 1, updatedAt: row?.updated_at ?? updatedAt });
}
