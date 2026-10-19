import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const caPath = process.env.DB_CA_PATH;
  if (!caPath) {
    console.error('DB_CA_PATH is not set in .env. Configure it with the Supabase database CA certificate path.');
    process.exit(1);
  }

  let ca;
  try {
    ca = fs.readFileSync(path.resolve(process.cwd(), caPath), 'utf8');
  } catch (err) {
    console.error('Unable to read the Supabase database CA certificate:', err);
    process.exit(1);
  }

  console.log('Connecting to PostgreSQL database at Supabase...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true, ca }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const schemaPath = path.resolve(__dirname, '../supabase/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema migration...');
    await client.query(sql);

    console.log('Migration completed successfully! All tables and policies are ready.');

    // Verify tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('Current public tables:');
    res.rows.forEach(r => console.log(' - ' + r.table_name));

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
