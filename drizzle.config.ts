import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  // A throwaway path; migrations are generated from the schema, not the live DB.
  dbCredentials: { url: 'file:./.dev.db' }
})
