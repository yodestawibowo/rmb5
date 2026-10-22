import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INITIAL_PUBLICATIONS } from '../data/initialPublications.ts';
import { FLAGSHIP_PROGRAMS } from '../data/flagshipPrograms.ts';
import { INITIAL_INSTAGRAM_PHOTOS, InstagramPhotoItem } from '../data/initialInstagramPhotos.ts';
import { Publication } from '../types/publication.ts';
import { FlagshipProgram } from '../types/program.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const JSON_DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface DatabaseState {
  seeded: boolean;
  deletedIds?: string[];
  publications: Publication[];
  programs: FlagshipProgram[];
  categories: string[];
  instagramPhotos: InstagramPhotoItem[];
}

let pgPool: Pool | null = null;
let isPostgresActive = false;
let isConnecting = false;

// Extract database configuration from standard environment variable names
function getPostgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const host =
    process.env.PGHOST ||
    process.env.SQL_HOST ||
    process.env.DB_HOST ||
    process.env.POSTGRES_HOST;
  const user =
    process.env.PGUSER ||
    process.env.SQL_USER ||
    process.env.DB_USER ||
    process.env.POSTGRES_USER;
  const password =
    process.env.PGPASSWORD ||
    process.env.SQL_PASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD;
  const database =
    process.env.PGDATABASE ||
    process.env.SQL_DB_NAME ||
    process.env.DB_NAME ||
    process.env.POSTGRES_DB ||
    'wartakarsa_db';
  const port = parseInt(
    process.env.PGPORT ||
      process.env.SQL_PORT ||
      process.env.DB_PORT ||
      process.env.POSTGRES_PORT ||
      '5432',
    10
  );

  return { connectionString, host, user, password, database, port };
}

// Initialize PostgreSQL Pool with auto-retry (essential for Docker Compose / CasaOS startup)
export async function initPostgres(maxRetries = 2, delayMs = 1000): Promise<boolean> {
  const cfg = getPostgresConfig();

  // If no PostgreSQL credentials/host provided, default to persistent file storage
  if (!cfg.connectionString && (!cfg.host || !cfg.user)) {
    console.log('ℹ️ No PostgreSQL environment variables provided. Operating in Persistent File Storage mode.');
    isPostgresActive = false;
    return false;
  }

  if (isConnecting) return false;
  isConnecting = true;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (pgPool) {
        try {
          await pgPool.end();
        } catch {
          // ignore
        }
      }

      pgPool = new Pool(
        cfg.connectionString
          ? { connectionString: cfg.connectionString, connectionTimeoutMillis: 1500 }
          : {
              host: cfg.host,
              user: cfg.user,
              password: cfg.password,
              database: cfg.database,
              port: cfg.port,
              connectionTimeoutMillis: 1500,
            }
      );

      // Add pool error listener to prevent process exit on idle disconnect
      pgPool.on('error', (err) => {
        console.warn('⚠️ PostgreSQL idle client error (will reconnect on next query):', err.message);
      });

      // Test connection
      const client = await pgPool.connect();
      try {
        await client.query('SELECT 1');
        isPostgresActive = true;
        console.log(`✅ [Attempt ${attempt}/${maxRetries}] PostgreSQL connected successfully to database '${cfg.database}'!`);
        await setupPostgresSchema(client);
        isConnecting = false;
        return true;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn(`⏳ [Attempt ${attempt}/${maxRetries}] Waiting for PostgreSQL at ${cfg.host || 'URL'}... (${err.message})`);
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  isConnecting = false;
  console.warn('⚠️ Could not connect to PostgreSQL after multiple retries. Safe fallback to Persistent File Store is active.');
  isPostgresActive = false;
  return false;
}

// Lazy reconnection helper if connection was lost
async function ensurePostgres(): Promise<boolean> {
  if (isPostgresActive && pgPool) {
    return true;
  }
  const cfg = getPostgresConfig();
  if (cfg.connectionString || (cfg.host && cfg.user)) {
    return await initPostgres(2, 1000);
  }
  return false;
}

async function setupPostgresSchema(client: any) {
  // Read and apply schema
  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await client.query(schemaSql);
  }

  // Check if system has been seeded before
  const res = await client.query("SELECT value FROM system_meta WHERE key = 'seeded'");
  if (res.rows.length === 0) {
    console.log('🌱 First-time PostgreSQL initialization: Seeding initial data...');

    // Fetch any previously recorded deleted IDs to prevent reviving them
    const deletedRes = await client.query('SELECT id FROM deleted_items_log');
    const deletedIds = new Set(deletedRes.rows.map((r: any) => r.id));

    // Seed default categories
    const defaultCategories = [
      'Pendidikan & Pelatihan',
      'Bakti Sosial & Lingkungan',
      'Seminar & Riset',
      'Ekspedisi & Lapangan',
      'Organisasi & Tata Kelola'
    ];
    for (const cat of defaultCategories) {
      await client.query('INSERT INTO program_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
    }

    // Seed default programs (only if not previously deleted)
    for (const p of FLAGSHIP_PROGRAMS) {
      if (!deletedIds.has(p.id)) {
        await client.query(
          `INSERT INTO flagship_programs (id, code, title, category, data)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [p.id, p.code, p.title, p.category, JSON.stringify(p)]
        );
      }
    }

    // Seed default publications (only if not previously deleted)
    for (const pub of INITIAL_PUBLICATIONS) {
      if (!deletedIds.has(pub.id)) {
        await client.query(
          `INSERT INTO publications (id, title, category, status, date, data)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [pub.id, pub.title, pub.category, pub.status, pub.date, JSON.stringify(pub)]
        );
      }
    }

    // Seed default instagram photos (only if not previously deleted)
    for (const photo of INITIAL_INSTAGRAM_PHOTOS) {
      if (!deletedIds.has(photo.id)) {
        await client.query(
          `INSERT INTO instagram_photos (id, title, category, date, data)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [photo.id, photo.title, photo.category, photo.date, JSON.stringify(photo)]
        );
      }
    }

    // Mark as seeded permanently!
    await client.query(
      "INSERT INTO system_meta (key, value) VALUES ('seeded', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'"
    );
    console.log('✅ Initial data seeded into PostgreSQL. All deletions, edits, and additions are now permanent!');
  } else {
    console.log('ℹ️ PostgreSQL database was previously seeded. User deletions and additions are preserved permanently.');
  }
}

// -----------------------------------------------------------------------------
// File-based Storage (Persistent Fallback Engine)
// -----------------------------------------------------------------------------
function readJsonDb(): DatabaseState {
  if (!fs.existsSync(JSON_DB_FILE)) {
    const initialState: DatabaseState = {
      seeded: true,
      deletedIds: [],
      publications: INITIAL_PUBLICATIONS,
      programs: FLAGSHIP_PROGRAMS,
      categories: [
        'Pendidikan & Pelatihan',
        'Bakti Sosial & Lingkungan',
        'Seminar & Riset',
        'Ekspedisi & Lapangan',
        'Organisasi & Tata Kelola'
      ],
      instagramPhotos: INITIAL_INSTAGRAM_PHOTOS,
    };
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify(initialState, null, 2), 'utf-8');
    return initialState;
  }

  try {
    const content = fs.readFileSync(JSON_DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && parsed.seeded === true) {
      return {
        seeded: true,
        deletedIds: parsed.deletedIds || [],
        publications: parsed.publications || [],
        programs: parsed.programs || [],
        categories: parsed.categories || [],
        instagramPhotos: parsed.instagramPhotos || [],
      };
    }
  } catch (e) {
    console.error('Error reading JSON DB:', e);
  }

  const fresh: DatabaseState = {
    seeded: true,
    deletedIds: [],
    publications: INITIAL_PUBLICATIONS,
    programs: FLAGSHIP_PROGRAMS,
    categories: [
      'Pendidikan & Pelatihan',
      'Bakti Sosial & Lingkungan',
      'Seminar & Riset',
      'Ekspedisi & Lapangan',
      'Organisasi & Tata Kelola'
    ],
    instagramPhotos: INITIAL_INSTAGRAM_PHOTOS,
  };
  fs.writeFileSync(JSON_DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
  return fresh;
}

function writeJsonDb(data: Partial<DatabaseState>) {
  const current = readJsonDb();
  const updated: DatabaseState = {
    ...current,
    ...data,
    seeded: true,
  };
  fs.writeFileSync(JSON_DB_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// -----------------------------------------------------------------------------
// Database Operations (Dual Engine: PostgreSQL Native + File Fallback)
// -----------------------------------------------------------------------------

export async function getDbStatus() {
  const cfg = getPostgresConfig();
  const active = await ensurePostgres();

  return {
    engine: active ? 'PostgreSQL (Connected & Active)' : 'Persistent File Storage (PostgreSQL Ready)',
    isPostgres: active,
    storageLocation: active
      ? (cfg.connectionString ? 'PostgreSQL Remote URI' : `${cfg.host}:${cfg.port}/${cfg.database}`)
      : JSON_DB_FILE,
    host: cfg.host || (cfg.connectionString ? 'configured' : 'none'),
    database: cfg.database,
    persistence: 'Permanent. Deleted items and modifications will never revert.',
  };
}

// Publications
export async function getAllPublications(): Promise<Publication[]> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('SELECT data FROM publications ORDER BY date DESC, created_at DESC');
      return res.rows.map((row) => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data));
    } catch (e: any) {
      console.error('PostgreSQL query error in getAllPublications:', e.message);
    }
  }
  return readJsonDb().publications;
}

export async function upsertPublication(pub: Publication): Promise<Publication> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const query = `
        INSERT INTO publications (id, title, category, status, date, data, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          status = EXCLUDED.status,
          date = EXCLUDED.date,
          data = EXCLUDED.data,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      await pgPool.query(query, [
        pub.id,
        pub.title,
        pub.category,
        pub.status,
        pub.date,
        JSON.stringify(pub),
      ]);
      // Remove from deleted_items_log if it was re-created
      await pgPool.query('DELETE FROM deleted_items_log WHERE id = $1', [pub.id]);
      return pub;
    } catch (e: any) {
      console.error('PostgreSQL upsert error in upsertPublication:', e.message);
    }
  }

  const db = readJsonDb();
  const index = db.publications.findIndex((p) => p.id === pub.id);
  if (index >= 0) {
    db.publications[index] = pub;
  } else {
    db.publications.unshift(pub);
  }
  const deletedIds = (db.deletedIds || []).filter((id) => id !== pub.id);
  writeJsonDb({ publications: db.publications, deletedIds });
  return pub;
}

export async function deletePublicationById(id: string): Promise<boolean> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('DELETE FROM publications WHERE id = $1', [id]);
      // Record in permanent deletion log so it is never re-seeded
      await pgPool.query(
        'INSERT INTO deleted_items_log (id, entity_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [id, 'publication']
      );
      return (res.rowCount || 0) > 0;
    } catch (e: any) {
      console.error('PostgreSQL delete error in deletePublicationById:', e.message);
    }
  }

  const db = readJsonDb();
  const filtered = db.publications.filter((p) => p.id !== id);
  const deletedIds = Array.from(new Set([...(db.deletedIds || []), id]));
  writeJsonDb({ publications: filtered, deletedIds });
  return true;
}

// Flagship Programs
export async function getAllPrograms(): Promise<FlagshipProgram[]> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('SELECT data FROM flagship_programs ORDER BY created_at ASC');
      return res.rows.map((row) => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data));
    } catch (e: any) {
      console.error('PostgreSQL query error in getAllPrograms:', e.message);
    }
  }
  return readJsonDb().programs;
}

export async function upsertProgram(prog: FlagshipProgram): Promise<FlagshipProgram> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const query = `
        INSERT INTO flagship_programs (id, code, title, category, data, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          data = EXCLUDED.data,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      await pgPool.query(query, [
        prog.id,
        prog.code,
        prog.title,
        prog.category,
        JSON.stringify(prog),
      ]);
      await pgPool.query('DELETE FROM deleted_items_log WHERE id = $1', [prog.id]);
      return prog;
    } catch (e: any) {
      console.error('PostgreSQL upsert error in upsertProgram:', e.message);
    }
  }

  const db = readJsonDb();
  const index = db.programs.findIndex((p) => p.id === prog.id);
  if (index >= 0) {
    db.programs[index] = prog;
  } else {
    db.programs.push(prog);
  }
  const deletedIds = (db.deletedIds || []).filter((id) => id !== prog.id);
  writeJsonDb({ programs: db.programs, deletedIds });
  return prog;
}

export async function deleteProgramById(id: string): Promise<boolean> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('DELETE FROM flagship_programs WHERE id = $1', [id]);
      await pgPool.query(
        'INSERT INTO deleted_items_log (id, entity_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [id, 'program']
      );
      return (res.rowCount || 0) > 0;
    } catch (e: any) {
      console.error('PostgreSQL delete error in deleteProgramById:', e.message);
    }
  }

  const db = readJsonDb();
  const filtered = db.programs.filter((p) => p.id !== id);
  const deletedIds = Array.from(new Set([...(db.deletedIds || []), id]));
  writeJsonDb({ programs: filtered, deletedIds });
  return true;
}

// Categories
export async function getAllCategories(): Promise<string[]> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('SELECT name FROM program_categories ORDER BY created_at ASC');
      return res.rows.map((r) => r.name);
    } catch (e: any) {
      console.error('PostgreSQL query error in getAllCategories:', e.message);
    }
  }
  return readJsonDb().categories;
}

export async function saveCategoriesList(categories: string[]): Promise<string[]> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM program_categories');
        for (const cat of categories) {
          await client.query('INSERT INTO program_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
        }
        await client.query('COMMIT');
        return categories;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error('PostgreSQL transaction error in saveCategoriesList:', e.message);
    }
  }

  writeJsonDb({ categories });
  return categories;
}

// Instagram Photos
export async function getAllInstagramPhotos(): Promise<InstagramPhotoItem[]> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('SELECT data FROM instagram_photos ORDER BY date DESC, created_at DESC');
      return res.rows.map((row) => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data));
    } catch (e: any) {
      console.error('PostgreSQL query error in getAllInstagramPhotos:', e.message);
    }
  }
  return readJsonDb().instagramPhotos;
}

export async function upsertInstagramPhoto(photo: InstagramPhotoItem): Promise<InstagramPhotoItem> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const query = `
        INSERT INTO instagram_photos (id, title, category, date, data, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          date = EXCLUDED.date,
          data = EXCLUDED.data,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      await pgPool.query(query, [
        photo.id,
        photo.title,
        photo.category,
        photo.date,
        JSON.stringify(photo),
      ]);
      await pgPool.query('DELETE FROM deleted_items_log WHERE id = $1', [photo.id]);
      return photo;
    } catch (e: any) {
      console.error('PostgreSQL upsert error in upsertInstagramPhoto:', e.message);
    }
  }

  const db = readJsonDb();
  const index = db.instagramPhotos.findIndex((p) => p.id === photo.id);
  if (index >= 0) {
    db.instagramPhotos[index] = photo;
  } else {
    db.instagramPhotos.unshift(photo);
  }
  const deletedIds = (db.deletedIds || []).filter((id) => id !== photo.id);
  writeJsonDb({ instagramPhotos: db.instagramPhotos, deletedIds });
  return photo;
}

export async function deleteInstagramPhotoById(id: string): Promise<boolean> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const res = await pgPool.query('DELETE FROM instagram_photos WHERE id = $1', [id]);
      await pgPool.query(
        'INSERT INTO deleted_items_log (id, entity_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [id, 'instagram_photo']
      );
      return (res.rowCount || 0) > 0;
    } catch (e: any) {
      console.error('PostgreSQL delete error in deleteInstagramPhotoById:', e.message);
    }
  }

  const db = readJsonDb();
  const filtered = db.instagramPhotos.filter((p) => p.id !== id);
  const deletedIds = Array.from(new Set([...(db.deletedIds || []), id]));
  writeJsonDb({ instagramPhotos: filtered, deletedIds });
  return true;
}

// Reset data (only when explicitly requested by user)
export async function resetSystemData(): Promise<boolean> {
  const active = await ensurePostgres();
  if (active && pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM publications');
        await client.query('DELETE FROM flagship_programs');
        await client.query('DELETE FROM program_categories');
        await client.query('DELETE FROM instagram_photos');
        await client.query('DELETE FROM deleted_items_log');
        await client.query('DELETE FROM system_meta');
        await setupPostgresSchema(client);
        await client.query('COMMIT');
        return true;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error('PostgreSQL error in resetSystemData:', e.message);
    }
  }

  const resetState: DatabaseState = {
    seeded: true,
    deletedIds: [],
    publications: INITIAL_PUBLICATIONS,
    programs: FLAGSHIP_PROGRAMS,
    categories: [
      'Pendidikan & Pelatihan',
      'Bakti Sosial & Lingkungan',
      'Seminar & Riset',
      'Ekspedisi & Lapangan',
      'Organisasi & Tata Kelola'
    ],
    instagramPhotos: INITIAL_INSTAGRAM_PHOTOS,
  };
  fs.writeFileSync(JSON_DB_FILE, JSON.stringify(resetState, null, 2), 'utf-8');
  return true;
}
