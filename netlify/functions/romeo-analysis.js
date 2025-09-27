// netlify/functions/romeo-analysis.js
// Enrichissement du profil candidat avec l'API ROMEO v2 France Travail
// Analyse automatique du texte CV pour identifier les métiers ROME correspondants

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const CLIENT_ID = 'PAR_assignme_706e20eb9f90ae0ed2dfd8e9feec3048f8612e02f616083c21c028a9f8a769f8';
    const CLIENT_SECRET = process.env.FRANCE_TRAVAIL_SECRET;

    if (!CLIENT_SECRET) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Secret API manquant',
          fallback: true
        })
      };
    }

    const { cvText, candidateProfile } = JSON.parse(event.body || '{}');
    
    if (!cvText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Texte CV requis pour analyse ROMEO' })
      };
    }

    console.log('Démarrage analyse ROMEO pour CV...');

    // Authentification avec scope ROMEO
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.log('Erreur authentification ROMEO:', tokenResponse.error);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Erreur authentification ROMEO',
          fallback: true
        })
      };
    }

    // Analyse ROMEO du CV complet
    const romeoResults = await analyzeWithRomeo(tokenResponse.token, cvText);
    
    if (!romeoResults.success) {
      console.log('Erreur analyse ROMEO:', romeoResults.error);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: romeoResults.error,
          fallback: true
        })
      };
    }

    // Enrichissement des données candidat avec ROMEO
    const enrichedProfile = enrichProfileWithRomeo(candidateProfile, romeoResults.data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        enriched_profile: enrichedProfile,
        romeo_analysis: romeoResults.data,
        metadata: {
          source: 'France Travail ROMEO v2',
          timestamp: new Date().toISOString(),
          cv_length: cvText.length
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction ROMEO:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Erreur interne ROMEO',
        fallback: true
      })
    };
  }
};

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_romeov2'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      return { success: false, error: `Auth ROMEO failed: ${response.status}` };
    }

    const data = await response.json();
    if (!data.access_token) {
      return { success: false, error: 'No ROMEO token' };
    }

    console.log('Authentification ROMEO réussie');
    return { success: true, token: data.access_token };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function analyzeWithRomeo(token, cvText) {
  try {
    // Préparation du texte CV pour ROMEO (limite ~2000 caractères)
    const cleanText = prepareTextForRomeo(cvText);
    
    console.log(`Envoi de ${cleanText.length} caractères à ROMEO`);

    const requestBody = {
      texte: cleanText,
      // Options d'analyse ROMEO
      nb_suggestions: 5,  // Top 5 métiers détectés
      score_min: 0.3      // Score minimum de confiance
    };

    const response = await fetch('https://api.francetravail.io/partenaire/romeo/v2/suggest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Statut réponse ROMEO: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Erreur ROMEO:', errorText);
      return { 
        success: false, 
        error: `ROMEO analysis failed: ${response.status}` 
      };
    }

    const data = await response.json();
    console.log(`ROMEO a trouvé ${data?.suggestions?.length || 0} suggestions métiers`);

    return {
      success: true,
      data: data
    };

  } catch (error) {
    console.error('Erreur appel ROMEO:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

function prepareTextForRomeo(cvText) {
  // Nettoyage et optimisation du texte pour l'analyse ROMEO
  let cleanText = cvText
    .replace(/\s+/g, ' ')  // Normaliser les espaces
    .replace(/[^\w\sÀ-ÿ.,;:()\-]/g, '')  // Garder seulement caractères utiles
    .trim();

  // Limiter à 2000 caractères en gardant les parties les plus importantes
  if (cleanText.length > 2000) {
    // Prioriser le début (formation/expérience) et milieu (compétences)
    const firstPart = cleanText.substring(0, 1000);
    const lastPart = cleanText.substring(cleanText.length - 1000);
    cleanText = firstPart + ' ... ' + lastPart;
  }

  return cleanText;
}

function enrichProfileWithRomeo(candidateProfile, romeoData) {
  if (!romeoData?.suggestions?.length) {
    return candidateProfile;
  }

  // Extraction des meilleurs métiers détectés par ROMEO
  const topSuggestions = romeoData.suggestions
    .filter(s => s.score >= 0.4)  // Seulement les suggestions avec bon score
    .slice(0, 3)  // Top 3 métiers
    .map(suggestion => ({
      rome_code: suggestion.codeRome,
      metier_label: suggestion.libelleMetier,
      score: suggestion.score,
      competences: suggestion.competences || []
    }));

  // Enrichissement du profil candidat
  const enrichedProfile = {
    ...candidateProfile,
    romeo_analysis: {
      detected_metiers: topSuggestions,
      primary_rome_code: topSuggestions[0]?.rome_code || null,
      primary_metier: topSuggestions[0]?.metier_label || null,
      confidence_score: topSuggestions[0]?.score || 0,
      total_suggestions: romeoData.suggestions.length
    }
  };

  // Mise à jour des secteurs d'activité basés sur ROMEO
  if (topSuggestions.length > 0) {
    const romeoSectors = topSuggestions
      .map(s => extractSectorFromRomeCode(s.rome_code))
      .filter(Boolean);
    
    if (romeoSectors.length > 0) {
      enrichedProfile.key_sectors = [
        ...new Set([...romeoSectors, ...(candidateProfile.key_sectors || [])])
      ].slice(0, 4);  // Limiter à 4 secteurs max
    }
  }

  // Enrichissement des compétences techniques avec ROMEO
  const romeoSkills = topSuggestions
    .flatMap(s => s.competences || [])
    .map(comp => comp.libelle || comp)
    .filter(Boolean)
    .slice(0, 5);  // Top 5 compétences ROMEO

  if (romeoSkills.length > 0) {
    enrichedProfile.technical_skills = [
      ...new Set([...romeoSkills, ...(candidateProfile.technical_skills || [])])
    ].slice(0, 8);  // Limiter à 8 compétences max
  }

  console.log(`Profil enrichi avec ROMEO: ${topSuggestions.length} métiers détectés`);
  return enrichedProfile;
}

function extractSectorFromRomeCode(romeCode) {
  if (!romeCode) return null;
  
  // Mapping des codes ROME vers secteurs d'activité
  const sectorMapping = {
    'A': 'Agriculture',
    'B': 'Arts et spectacles', 
    'C': 'Banque et assurances',
    'D': 'Commerce',
    'E': 'Communication',
    'F': 'BTP et second œuvre',
    'G': 'Hôtellerie-restauration',
    'H': 'Industrie',
    'I': 'Installation et maintenance',
    'J': 'Santé',
    'K': 'Services aux entreprises',
    'L': 'Services aux particuliers',
    'M': 'Support à l'entreprise',
    'N': 'Transport et logistique'
  };

  const firstLetter = romeCode.charAt(0).toUpperCase();
  return sectorMapping[firstLetter] || null;
}

// Fonction utilitaire pour mapper les métiers ROMEO aux mots-clés de recherche
function getSearchKeywordFromRomeo(romeoCode, metierLabel) {
  // Mapping intelligent ROME → mots-clés recherche offres
  const romeToKeywords = {
    // Technique et maintenance
    'I1309': 'maintenance',
    'I1302': 'electricien',
    'I1304': 'technicien',
    'F1602': 'electricien',
    
    // Logistique et manutention
    'N1103': 'manutention',
    'N1101': 'logistique',
    'N1105': 'magasinier',
    
    // Commerce et vente
    'D1502': 'commercial',
    'D1403': 'vendeur',
    'D1406': 'caissier',
    
    // Support et administration
    'M1602': 'administratif',
    'M1203': 'comptable',
    'M1501': 'assistant',
    
    // Services aux personnes
    'K1302': 'aide soignant',
    'K1303': 'educateur',
    'K1204': 'agent service'
  };

  // Recherche directe par code ROME
  if (romeToKeywords[romeoCode]) {
    return romeToKeywords[romeoCode];
  }

  // Recherche par analyse du libellé métier
  const metierLower = (metierLabel || '').toLowerCase();
  
  if (metierLower.includes('électr') || metierLower.includes('electr')) return 'electricien';
  if (metierLower.includes('maintenance')) return 'maintenance';
  if (metierLower.includes('manutent')) return 'manutention';
  if (metierLower.includes('commercial')) return 'commercial';
  if (metierLower.includes('technicien')) return 'technicien';
  if (metierLower.includes('logistique')) return 'logistique';
  if (metierLower.includes('administratif')) return 'administratif';
  if (metierLower.includes('comptab')) return 'comptable';
  
  // Fallback générique
  return 'emploi';
}
