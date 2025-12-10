@echo off
set DATABASE_URL=postgresql://postgres:AA742800!!@localhost:5432/shophub_dev
set SESSION_SECRET=5f2b3c9e7a1d48c6f0ab94de27c83f15b9f4a6c2d7e0f913c8a4f2d9b7e6c1a0
set NODE_ENV=development

npx tsx server/index.ts
npx tsx server/scripts/create-admin.ts