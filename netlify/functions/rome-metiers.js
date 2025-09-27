// netlify/functions/rome-metiers.js
// Enrichissement des offres d'emploi avec les fiches métiers ROME officielles

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
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant' }) };
    }

    const { jobTitle, candidateProfile } = JSON.parse(event.body || '{}');
    if (!jobTitle) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Titre du poste requis' }) };
    }

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.log('Erreur authentification ROME');
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Auth failed' }) };
    }

    // Recherche du code ROME correspondant au titre du poste
    const romeCode = await findRomeCode(tokenResponse.token, jobTitle);
    if (!romeCode) {
      console.log(`Aucun code ROME trouvé pour: ${jobTitle}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Code ROME non trouvé' }) };
    }

    // Récupération de la fiche métier détaillée
    const metierDetails = await getMetierDetails(tokenResponse.token, romeCode);
    if (!metierDetails) {
      console.log(`Détails métier non trouvés pour code ROME: ${romeCode}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Détails métier non trouvés' }) };
    }

    // Enrichissement des données pour ASSIGNME
    const enrichedData = enrichForAssignme(metierDetails, candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        rome_code: romeCode,
        metier: enrichedData,
        metadata: { 
          source: 'ROME 4.0 Métiers', 
          timestamp: new Date().toISOString() 
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction ROME métiers:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Erreur interne', success: false }) 
    };
  }
};

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_rome-metiersv1 api_offresdemploiv2'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: params.toString()
    });

    if (!response.ok) return { success: false, error: `Auth failed: ${response.status}` };
    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'No token' };

    console.log('Authentification ROME réussie');
    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function findRomeCode(token, jobTitle) {
  try {
    // Recherche par mots-clés dans les métiers ROME
    const searchParams = new URLSearchParams({
      motsCles: jobTitle.toLowerCase(),
      champs: 'codeRome,libelleRome,definition'
    });

    const response = await fetch(`https://api.francetravail.io/partenaire/rome/v1/metier/recherche?${searchParams}`, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Erreur recherche ROME: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      console.log(`Code ROME trouvé: ${data[0].codeRome} pour "${jobTitle}"`);
      return data[0].codeRome;
    }

    return null;
  } catch (error) {
    console.error('Erreur recherche code ROME:', error);
    return null;
  }
}

async function getMetierDetails(token, romeCode) {
  try {
    const response = await fetch(`https://api.francetravail.io/partenaire/rome/v1/metier/${romeCode}`, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Erreur détails métier: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`Détails métier récupérés pour ROME: ${romeCode}`);
    return data;
  } catch (error) {
    console.error('Erreur récupération détails métier:', error);
    return null;
  }
}

function enrichForAssignme(metierData, candidateProfile) {
  // Extraction des informations utiles depuis la fiche ROME
  const metier = {
    code_rome: metierData.codeRome,
    libelle: metierData.libelleRome,
    definition: cleanText(metierData.definition),
    
    // Compétences requises
    competences_requises: extractCompetences(metierData.competences || []),
    
    // Conditions d'exercice
    conditions_exercice: extractConditions(metierData.conditionsExercice || []),
    
    // Formations recommandées
    formations_recommandees: extractFormations(metierData.formationsAssociees || []),
    
    // Évolutions possibles
    evolutions_metier: extractEvolutions(metierData.mobilites || []),
    
    // Environnements de travail
    environnements: extractEnvironnements(metierData.environnementsTravail || []),
    
    // Analyse de compatibilité avec le profil candidat
    compatibilite_profil: analyzeCompatibility(metierData, candidateProfile)
  };

  return metier;
}

function extractCompetences(competences) {
  return competences.slice(0, 8).map(comp => ({
    libelle: comp.libelle || comp.nom,
    niveau_requis: comp.niveauMaitrise || 'Non spécifié',
    type: comp.typeCompetence || 'Compétence professionnelle'
  }));
}

function extractConditions(conditions) {
  return conditions.slice(0, 5).map(cond => ({
    libelle: cond.libelle,
    description: cleanText(cond.definition || '')
  }));
}

function extractFormations(formations) {
  return formations.slice(0, 5).map(form => ({
    libelle: form.libelle,
    niveau: form.niveauFormation || 'Tout niveau',
    commentaire: cleanText(form.commentaire || '')
  }));
}

function extractEvolutions(mobilites) {
  return mobilites.slice(0, 5).map(mob => ({
    code_rome: mob.codeRome,
    libelle_metier: mob.libelleMetier,
    type_evolution: mob.typeMobilite || 'Évolution'
  }));
}

function extractEnvironnements(environnements) {
  return environnements.slice(0, 6).map(env => env.libelle);
}

function analyzeCompatibility(metierData, candidateProfile) {
  const analysis = {
    score_compatibilite: 50, // Score de base
    points_forts: [],
    points_attention: [],
    recommandations: []
  };

  // Analyse basée sur le niveau de formation requis
  const formationsRequises = metierData.formationsAssociees || [];
  const niveauCandidat = candidateProfile.education_level?.toLowerCase() || '';
  
  if (niveauCandidat === 'aucune qualification') {
    const formationFacile = formationsRequises.some(f => 
      f.libelle?.toLowerCase().includes('sans diplôme') || 
      f.libelle?.toLowerCase().includes('cqp') ||
      f.niveauFormation === 'V'
    );
    
    if (formationFacile) {
      analysis.score_compatibilite += 20;
      analysis.points_forts.push('Métier accessible sans qualification préalable');
    } else {
      analysis.points_attention.push('Formation préalable recommandée');
      analysis.recommandations.push('Envisager une formation courte avant candidature');
    }
  }

  // Analyse des compétences techniques
  const competencesTechniques = metierData.competences || [];
  const competencesCandidat = candidateProfile.technical_skills || [];
  
  const matchCompetences = competencesTechniques.filter(compTech => 
    competencesCandidat.some(compCand => 
      compCand.toLowerCase().includes(compTech.libelle?.toLowerCase().substring(0, 6) || '')
    )
  );

  if (matchCompetences.length > 0) {
    analysis.score_compatibilite += 15;
    analysis.points_forts.push(`${matchCompetences.length} compétence(s) déjà acquise(s)`);
  }

  // Analyse environnement de travail vs profil psychologique
  const environnements = metierData.environnementsTravail || [];
  const profilPsy = candidateProfile.psychological_profile?.toLowerCase() || '';
  
  const environnementRelationnel = environnements.some(env => 
    env.libelle?.toLowerCase().includes('client') || 
    env.libelle?.toLowerCase().includes('équipe') ||
    env.libelle?.toLowerCase().includes('public')
  );

  if (environnementRelationnel && profilPsy.includes('peu relationnel')) {
    analysis.score_compatibilite -= 15;
    analysis.points_attention.push('Métier nécessitant des compétences relationnelles');
  }

  return analysis;
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 300);
}// netlify/functions/rome-metiers.js
// Enrichissement des offres d'emploi avec les fiches métiers ROME officielles

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
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant' }) };
    }

    const { jobTitle, candidateProfile } = JSON.parse(event.body || '{}');
    if (!jobTitle) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Titre du poste requis' }) };
    }

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.log('Erreur authentification ROME');
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Auth failed' }) };
    }

    // Recherche du code ROME correspondant au titre du poste
    const romeCode = await findRomeCode(tokenResponse.token, jobTitle);
    if (!romeCode) {
      console.log(`Aucun code ROME trouvé pour: ${jobTitle}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Code ROME non trouvé' }) };
    }

    // Récupération de la fiche métier détaillée
    const metierDetails = await getMetierDetails(tokenResponse.token, romeCode);
    if (!metierDetails) {
      console.log(`Détails métier non trouvés pour code ROME: ${romeCode}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Détails métier non trouvés' }) };
    }

    // Enrichissement des données pour ASSIGNME
    const enrichedData = enrichForAssignme(metierDetails, candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        rome_code: romeCode,
        metier: enrichedData,
        metadata: { 
          source: 'ROME 4.0 Métiers', 
          timestamp: new Date().toISOString() 
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction ROME métiers:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Erreur interne', success: false }) 
    };
  }
};

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_rome-metiersv1 api_offresdemploiv2'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: params.toString()
    });

    if (!response.ok) return { success: false, error: `Auth failed: ${response.status}` };
    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'No token' };

    console.log('Authentification ROME réussie');
    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function findRomeCode(token, jobTitle) {
  try {
    // Recherche par mots-clés dans les métiers ROME
    const searchParams = new URLSearchParams({
      motsCles: jobTitle.toLowerCase(),
      champs: 'codeRome,libelleRome,definition'
    });

    const response = await fetch(`https://api.francetravail.io/partenaire/rome/v1/metier/recherche?${searchParams}`, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Erreur recherche ROME: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      console.log(`Code ROME trouvé: ${data[0].codeRome} pour "${jobTitle}"`);
      return data[0].codeRome;
    }

    return null;
  } catch (error) {
    console.error('Erreur recherche code ROME:', error);
    return null;
  }
}

async function getMetierDetails(token, romeCode) {
  try {
    const response = await fetch(`https://api.francetravail.io/partenaire/rome/v1/metier/${romeCode}`, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Erreur détails métier: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`Détails métier récupérés pour ROME: ${romeCode}`);
    return data;
  } catch (error) {
    console.error('Erreur récupération détails métier:', error);
    return null;
  }
}

function enrichForAssignme(metierData, candidateProfile) {
  // Extraction des informations utiles depuis la fiche ROME
  const metier = {
    code_rome: metierData.codeRome,
    libelle: metierData.libelleRome,
    definition: cleanText(metierData.definition),
    
    // Compétences requises
    competences_requises: extractCompetences(metierData.competences || []),
    
    // Conditions d'exercice
    conditions_exercice: extractConditions(metierData.conditionsExercice || []),
    
    // Formations recommandées
    formations_recommandees: extractFormations(metierData.formationsAssociees || []),
    
    // Évolutions possibles
    evolutions_metier: extractEvolutions(metierData.mobilites || []),
    
    // Environnements de travail
    environnements: extractEnvironnements(metierData.environnementsTravail || []),
    
    // Analyse de compatibilité avec le profil candidat
    compatibilite_profil: analyzeCompatibility(metierData, candidateProfile)
  };

  return metier;
}

function extractCompetences(competences) {
  return competences.slice(0, 8).map(comp => ({
    libelle: comp.libelle || comp.nom,
    niveau_requis: comp.niveauMaitrise || 'Non spécifié',
    type: comp.typeCompetence || 'Compétence professionnelle'
  }));
}

function extractConditions(conditions) {
  return conditions.slice(0, 5).map(cond => ({
    libelle: cond.libelle,
    description: cleanText(cond.definition || '')
  }));
}

function extractFormations(formations) {
  return formations.slice(0, 5).map(form => ({
    libelle: form.libelle,
    niveau: form.niveauFormation || 'Tout niveau',
    commentaire: cleanText(form.commentaire || '')
  }));
}

function extractEvolutions(mobilites) {
  return mobilites.slice(0, 5).map(mob => ({
    code_rome: mob.codeRome,
    libelle_metier: mob.libelleMetier,
    type_evolution: mob.typeMobilite || 'Évolution'
  }));
}

function extractEnvironnements(environnements) {
  return environnements.slice(0, 6).map(env => env.libelle);
}

function analyzeCompatibility(metierData, candidateProfile) {
  const analysis = {
    score_compatibilite: 50, // Score de base
    points_forts: [],
    points_attention: [],
    recommandations: []
  };

  // Analyse basée sur le niveau de formation requis
  const formationsRequises = metierData.formationsAssociees || [];
  const niveauCandidat = candidateProfile.education_level?.toLowerCase() || '';
  
  if (niveauCandidat === 'aucune qualification') {
    const formationFacile = formationsRequises.some(f => 
      f.libelle?.toLowerCase().includes('sans diplôme') || 
      f.libelle?.toLowerCase().includes('cqp') ||
      f.niveauFormation === 'V'
    );
    
    if (formationFacile) {
      analysis.score_compatibilite += 20;
      analysis.points_forts.push('Métier accessible sans qualification préalable');
    } else {
      analysis.points_attention.push('Formation préalable recommandée');
      analysis.recommandations.push('Envisager une formation courte avant candidature');
    }
  }

  // Analyse des compétences techniques
  const competencesTechniques = metierData.competences || [];
  const competencesCandidat = candidateProfile.technical_skills || [];
  
  const matchCompetences = competencesTechniques.filter(compTech => 
    competencesCandidat.some(compCand => 
      compCand.toLowerCase().includes(compTech.libelle?.toLowerCase().substring(0, 6) || '')
    )
  );

  if (matchCompetences.length > 0) {
    analysis.score_compatibilite += 15;
    analysis.points_forts.push(`${matchCompetences.length} compétence(s) déjà acquise(s)`);
  }

  // Analyse environnement de travail vs profil psychologique
  const environnements = metierData.environnementsTravail || [];
  const profilPsy = candidateProfile.psychological_profile?.toLowerCase() || '';
  
  const environnementRelationnel = environnements.some(env => 
    env.libelle?.toLowerCase().includes('client') || 
    env.libelle?.toLowerCase().includes('équipe') ||
    env.libelle?.toLowerCase().includes('public')
  );

  if (environnementRelationnel && profilPsy.includes('peu relationnel')) {
    analysis.score_compatibilite -= 15;
    analysis.points_attention.push('Métier nécessitant des compétences relationnelles');
  }

  return analysis;
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 300);
}
