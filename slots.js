// Vercel serverless function: GET /api/slots?date=YYYY-MM-DD
// Reads the club's public schedule page and returns free slots as JSON.
// Free slot = a link to /book/confirm?date=..&court=..&time=.. on their page.

const BASE = 'https://tennis-lodovyi.up.railway.app';

export default async function handler(req, res) {
  const q = req.query || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : '';
  const url = `${BASE}/book/schedule${date ? `?date=${date}` : ''}`;

  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LodovyiSite/1.0; +https://vercel.com)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'uk-UA,uk;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const html = (await r.text()).replace(/&amp;/g, '&');

    const days = [...new Set(
      [...html.matchAll(/\/book\/schedule\?date=(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])
    )].sort();

    const seen = new Set();
    const free = [];
    for (const m of html.matchAll(/\/book\/confirm\?date=(\d{4}-\d{2}-\d{2})&court=(\d+)&time=(\d{1,2}:\d{2})/g)) {
      const time = m[3].padStart(5, '0');
      const key = `${m[1]}|${m[2]}|${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      free.push({ date: m[1], court: m[2], time });
    }

    const resolved = date || days[0] || (free[0] && free[0].date) || null;

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      date: resolved,
      days,
      free: free.filter((f) => f.date === resolved),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'schedule_unavailable', detail: String((e && e.message) || e) });
  }
}
