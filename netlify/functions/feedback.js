// netlify/functions/feedback.js
// Système de tracking des candidatures et feedback

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { 
      candidateId, 
      jobId, 
      feedbackType, 
      data 
    } = JSON.parse(event.body);
    
    // Pour l'instant on log juste (plus tard : stocker dans une BDD)
    console.log('Feedback reçu:', {
      candidate: hashId(candidateId),
      job: jobId,
      type: feedbackType,
      timestamp: new Date().toISOString()
    });

    // TODO: Quand tu auras du budget, ajouter ici :
    // - Stockage dans Supabase (gratuit jusqu'à 500MB)
    // - Ou Google Sheets via sheet.best (gratuit 100 req/mois)
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        message: 'Feedback enregistré'
      })
    };

  } catch (error) {
    console.error('Erreur feedback:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur interne',
        details: error.message 
      })
    };
  }
};

// Hash anonyme pour RGPD
function hashId(id) {
  if (!id) return 'anonymous';
  
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(id + process.env.HASH_SALT || 'assignme-salt')
    .digest('hex')
    .substring(0, 16);
}
