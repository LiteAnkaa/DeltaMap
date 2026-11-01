
const KEY = 'deltamap:published-statuses';

const REGIONS = new Set([
  'Вінницька область', 'Волинська область',
  'Дніпропетровська область', 'Донецька область',
  'Житомирська область', 'Закарпатська область',
  'Запорізька область', 'Івано-Франківська область',
  'Київська область', 'Кіровоградська область',
  'Луганська область', 'Львівська область',
  'Миколаївська область', 'Одеська область',
  'Полтавська область', 'Рівненська область',
  'Сумська область', 'Тернопільська область',
  'Харківська область', 'Херсонська область',
  'Хмельницька область', 'Черкаська область',
  'Чернівецька область', 'Чернігівська область',
  'АР Крим', 'м. Київ', 'м. Севастополь'
]);

const LEVELS = new Set([
  'red', 'yellow', 'radiation', 'chemical', 'clashes'
]);

function send(res, code, data) {
  return res.status(code).json(data);
}

async function redis(command) {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ''
  ).replace(/\/+$/, '');

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error('UPSTASH_ENV_MISSING');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command),
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('Upstash error:', data.error || response.status);
    throw new Error('UPSTASH_REQUEST_FAILED');
  }

  return data.result;
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, max-age=0'
  );

  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', KEY]);
      let statuses = {};

      if (raw) {
        try {
          statuses = JSON.parse(raw);
        } catch {
          statuses = {};
        }
      }

      return send(res, 200, { statuses });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'Method not allowed' });
    }

    const expected = process.env.ADMIN_PASSWORD;
    const supplied = req.headers['x-admin-password'];

    if (
      !expected ||
      typeof supplied !== 'string' ||
      supplied !== expected
    ) {
      return send(res, 401, {
        error: 'Невірний пароль адміністратора'
      });
    }

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return send(res, 400, { error: 'Invalid JSON' });
      }
    }

    const changes = body && body.changes;

    if (
      !changes ||
      typeof changes !== 'object' ||
      Array.isArray(changes) ||
      Object.keys(changes).length < 1 ||
      Object.keys(changes).length > 27
    ) {
      return send(res, 400, { error: 'Invalid changes' });
    }

    for (const [region, level] of Object.entries(changes)) {
      if (
        !REGIONS.has(region) ||
        (level !== null && !LEVELS.has(level))
      ) {
        return send(res, 400, {
          error: 'Invalid region or status level'
        });
      }
    }

    const raw = await redis(['GET', KEY]);
    let statuses = {};

    if (raw) {
      try {
        statuses = JSON.parse(raw);
      } catch {
        statuses = {};
      }
    }

    for (const [region, level] of Object.entries(changes)) {
      if (level === null) {
        delete statuses[region];
      } else {
        statuses[region] = level;
      }
    }

    await redis(['SET', KEY, JSON.stringify(statuses)]);

    return send(res, 200, {
      ok: true,
      statuses
    });

  } catch (error) {
    console.error('DeltaMap API error:', error.message);

    if (error.message === 'UPSTASH_ENV_MISSING') {
      return send(res, 503, {
        error: 'Не налаштована база Upstash у Vercel'
      });
    }

    return send(res, 503, {
      error: 'Помилка підключення до бази даних Upstash'
    });
  }
}
