export const createSeatingStateTableSql = `
  CREATE TABLE IF NOT EXISTS seating_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`;
