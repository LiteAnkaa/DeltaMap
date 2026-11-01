// DeltaMap API endpoint for Vercel.
// Live Alerts.in.ua integration will be added after the API token is issued.
// Never put the token in browser-side files.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({
    configured: false,
    alerts: [],
    message: 'Alerts.in.ua API is not connected yet.'
  });
}
