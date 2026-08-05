import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const res = await client.query(`
  SELECT id, type, "rawValue", "validationNote", value
  FROM "ImportedData"
  WHERE "rawValue" LIKE '%images%' OR value::text LIKE '%ingestionStatus%'
  LIMIT 10;
`);

console.log(JSON.stringify(res.rows, null, 2));

const failures = await client.query(`
  SELECT value->>'sourceUrl' as source_url, value->>'ingestionStatus' as status, value->>'errorCode' as error_code, "validationNote"
  FROM "ImportedData"
  WHERE value->>'kind' = 'MEDIA_CANDIDATE'
  LIMIT 20;
`);

console.log('Failures:', JSON.stringify(failures.rows, null, 2));

await client.end();
