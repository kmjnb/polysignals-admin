import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

let _client: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  _client = postgres(url, { max: 10, prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

export const db = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      const real = getDb();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === "function" ? value.bind(real) : value;
    },
  },
);

export { schema };
