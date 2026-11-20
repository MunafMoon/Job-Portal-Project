import pg from 'pg';
import { readFileSync } from 'node:fs';

export function createDatabasePool(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database URL');
  if (['disable', 'no-verify'].includes(url.searchParams.get('sslmode'))) throw new Error('Verified TLS is required');
  const certificate = env.DATABASE_CA_FILE || url.searchParams.get('sslrootcert');
  // Prevent pg connection-string SSL settings from replacing the verified TLS object.
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(certificate ? { ca: readFileSync(certificate, 'utf8') } : {}) },
    max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    query_timeout: 15000, statement_timeout: 12000,
  });
}
