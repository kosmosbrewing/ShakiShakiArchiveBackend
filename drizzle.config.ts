import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// SSL 설정: 기본적으로 SSL 사용, DB_SSL=false일 때만 비활성화
const useSSL = process.env.DB_SSL !== "false";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: useSSL
      ? {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined,
        }
      : false,
  },
});
