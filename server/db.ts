// server/db.ts
// Drizzle ORM + PostgreSQL Pool 설정

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

// PostgreSQL 연결 풀 (트랜잭션용으로 export)
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Drizzle ORM 인스턴스
export const db = drizzle({ client: pool, schema });
