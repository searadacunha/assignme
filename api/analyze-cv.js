export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test simple sans dépendances
    res.status(200).json({
      success: true,
      message: "API fonctionne !",
      test: true
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
}
