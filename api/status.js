// Shared DeltaMap informational statuses stored in Upstash Redis.
const KEY = 'deltamap:published-statuses';
const REGIONS = new Set([
  'Вінницька область','Волинська область','Дніпропетровська область','Донецька область',
  'Житомирська область','Закарпатська область','Запорізька область','Івано-Франківська область',
  'Київська область','Кіровоградська область','Луганська область','Львівська область',
  'Миколаївська область','Одеська область','Полтавська область','Рівненська область',
  'Сумська область','Тернопільська область','Харківська область','Херсонська область',
  'Хмельницька область','Черкаська область','Чернівецька область','Чернігівська область',
  'АР Крим','м. Київ','м. Севастополь'
]);
const LEVELS = new Set(['red','yellow','radiation','chemical','clashes']);
function env(name, fallback) { return process.env[name] || process.env[fallback]; }
async function redis(command) {
  const url = env('KV_REST_API_URL','UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN','UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) throw new Error('Database is not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Database request failed');
  const payload = await response.json();
  if (payload.error) throw new Error('Database request failed');
  return payload.result;
}
function send(res, code, body) { return res.status(code).json(body); }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', KEY]);
      let statuses = {};
      if (raw) { try { statuses = JSON.parse(raw); } catch { statuses = {}; } }
      return send(res, 200, { statuses });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const expected = process.env.DELTAMAP_ADMIN_PASSWORD;
    const supplied = req.headers['x-admin-password'];
    if (!expected || typeof supplied !== 'string' || supplied !== expected) {
      return send(res, 401, { error: 'Невірний пароль адміністратора' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON' }); } }
    const changes = body && body.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length < 1 || Object.keys(changes).length > 27) {
      return send(res, 400, { error: 'Invalid changes' });
    }
    for (const [region, level] of Object.entries(changes)) {
      if (!REGIONS.has(region) || (level !== null && !LEVELS.has(level))) {
        return send(res, 400, { error: 'Invalid region or status level' });
      }
    }
    const raw = await redis(['GET', KEY]);
    let statuses = {};
    if (raw) { try { statuses = JSON.parse(raw); } catch { statuses = {}; } }
    for (const [region, level] of Object.entries(changes)) {
      if (level === null) delete statuses[region];
      else statuses[region] = level;
    }
    await redis(['SET', KEY, JSON.stringify(statuses)]);
    return send(res, 200, { ok: true, statuses });
  } catch (error) {
    const message = error.message === 'Database is not configured'
      ? 'База даних не підключена: додайте змінні Upstash у Vercel.'
      : 'Сервіс статусів тимчасово недоступний.';
    return send(res, 503, { error: message });
  }
  }
