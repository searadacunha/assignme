// netlify/functions/france-travail-formations.js
// Récupération des formations via l'API France Travail

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
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', formations: [] }) };
    }

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis', formations: [] }) };
    }

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.log('Erreur authentification formations');
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, formations: fallbackFormations(candidateProfile) }) };
    }

    // Recherche des formations
    const formationsResults = await searchFormations(tokenResponse.token, candidateProfile);
    if (!formationsResults.success) {
      console.log('Erreur recherche formations, utilisation fallback');
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, formations: fallbackFormations(candidateProfile) }) };
    }

    // Transformation des formations
    const transformedFormations = transformFormationsForAssignme(formationsResults.formations, candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        formations: transformedFormations,
        metadata: { source: 'France Travail Formations', total_found: formationsResults.total, timestamp: new Date().toISOString() }
      })
    };

  } catch (error) {
    console.error('Erreur fonction formations:', error);
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ success: false, formations: fallbackFormations(candidateProfile || {}) }) 
    };
  }
};

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_formations api_offresdemploiv2'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: params.toString()
    });

    if (!response.ok) return { success: false, error: `Auth failed: ${response.status}` };
    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'No token' };

    console.log('Authentification formations reussie');
    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function searchFormations(token, candidateProfile) {
  try {
    const keywords = buildFormationKeywords(candidateProfile);
    const location = extractLocation(candidateProfile.location);
    
    console.log('Mots-cles formations:', keywords);
    console.log('Localisation formations:', location);

    // Paramètres de recherche formations
    const searchParams = new URLSearchParams({
      motsCles: keywords,
      codePostal: location || '75001',
      distance: '50', // Plus large pour les formations
      typeFormation: 'all',
      niveauFormation: getNiveauFormation(candidateProfile),
      sort: '0',
      range: '0-19'
    });

    const response = await fetch(`https://api.francetravail.io/partenaire/formations/v1/search?${searchParams}`, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json', 
        'User-Agent': 'ASSIGNME/1.0' 
      }
    });

    console.log('Statut reponse formations:', response.status);
    if (!response.ok) return { success: false, error: `Formations search failed: ${response.status}` };

    const responseText = await response.text();
    if (!responseText.trim()) return { success: true, formations: [], total: 0 };

    const data = JSON.parse(responseText);
    console.log(`${data.resultats?.length || 0} formations trouvees`);
    return { success: true, formations: data.resultats || [], total: data.resultats?.length || 0 };

  } catch (error) {
    console.error('Erreur recherche formations:', error);
    return { success: false, error: error.message };
  }
}

function buildFormationKeywords(candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  
  // PROFIL MOHAMMED : motivation financière + aucune qualification
  if ((educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') && 
      aspirations.includes('fric')) {
    console.log('Formations pour profil Mohammed -> logistique cariste');
    return 'logistique cariste';
  }
  
  // PROFILS TECHNIQUES
  if (educationLevel.includes('electrotechnique') || currentPosition.includes('technicien')) {
    console.log('Formations techniques -> maintenance automatisme');
    return 'maintenance automatisme';
  }
  
  // PROFILS CRÉATIFS/CULTURELS
  if (currentPosition.includes('communication') || aspirations.includes('culture')) {
    console.log('Formations créatives -> communication digitale');
    return 'communication digitale';
  }
  
  // PROFILS COMMERCIAUX/ADV
  if (currentPosition.includes('commercial') || currentPosition.includes('adv')) {
    console.log('Formations commerciales -> gestion commercial');
    return 'gestion commercial';
  }
  
  // PROFILS SOCIAUX
  if (educationLevel.includes('service social') || currentPosition.includes('social')) {
    console.log('Formations sociales -> accompagnement social');
    return 'accompagnement social';
  }
  
  // Profil débutant générique
  if (candidateProfile.total_experience_years === 0 || educationLevel === 'aucune qualification') {
    console.log('Formations débutant -> qualification professionnelle');
    return 'qualification professionnelle';
  }
  
  // Fallback
  console.log('Formations génériques -> competences professionnelles');
  return 'competences professionnelles';
}

function getNiveauFormation(candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  
  if (educationLevel === 'aucune qualification' || educationLevel.includes('sans')) return '1'; // Niveau V et infra
  if (educationLevel.includes('cap') || educationLevel.includes('bep')) return '2'; // Niveau V
  if (educationLevel.includes('bac')) return '3'; // Niveau IV
  if (educationLevel.includes('licence') || educationLevel.includes('bts')) return '4'; // Niveau III
  if (educationLevel.includes('master') || educationLevel.includes('ingenieur')) return '5'; // Niveau II et I
  
  return 'all'; // Tous niveaux par défaut
}

function extractLocation(location) {
  if (!location) return '75001';
  
  const locationLower = location.toLowerCase().trim();
  
  // Codes postaux courants
  const locationMapping = {
    'paris': '75001', 'lyon': '69001', 'marseille': '13001',
    'toulouse': '31000', 'lille': '59000', 'bordeaux': '33000',
    'nantes': '44000', 'strasbourg': '67000', 'seynod': '74600'
  };
  
  // Code postal direct
  const postalMatch = location.match(/\b(\d{5})\b/);
  if (postalMatch) return postalMatch[1];
  
  // Recherche par ville
  for (const [city, postal] of Object.entries(locationMapping)) {
    if (locationLower.includes(city)) return postal;
  }
  
  return '75001'; // Paris par défaut
}

function transformFormationsForAssignme(formations, candidateProfile) {
  // Limiter à 5 formations maximum
  const selectedFormations = formations.slice(0, 5);
  
  return selectedFormations.map(formation => {
    return {
      title: formation.intituleFormation || 'Formation professionnelle',
      description: cleanDescription(formation.objectifFormation || formation.contenuFormation || 'Formation adaptée à votre profil'),
      duration: formatDuration(formation.dureeFormation),
      relevance: generateRelevance(formation, candidateProfile),
      funding: 'CPF, Pôle Emploi, Région selon éligibilité',
      immediate_employment: determineImmediateEmployment(formation),
      url: formation.urlFormation || '#',
      organisme: formation.organismeFormateur?.denomination || 'Organisme de formation',
      lieu: formation.lieu?.libelle || candidateProfile.location || 'Lieu à définir',
      certification: formation.certification || 'Attestation de formation'
    };
  });
}

function formatDuration(dureeFormation) {
  if (!dureeFormation) return 'Durée à définir';
  
  // Conversion heures en format lisible
  if (typeof dureeFormation === 'number') {
    if (dureeFormation < 40) return `${dureeFormation} heures`;
    if (dureeFormation < 160) return `${Math.round(dureeFormation / 7)} jours`;
    if (dureeFormation < 600) return `${Math.round(dureeFormation / 35)} semaines`;
    return `${Math.round(dureeFormation / 140)} mois`;
  }
  
  return dureeFormation.toString();
}

function generateRelevance(formation, candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  
  if (educationLevel === 'aucune qualification') {
    return 'Adaptée à votre profil pour acquérir des compétences de base et accéder rapidement à l\'emploi';
  }
  
  if (aspirations.includes('fric')) {
    return 'Formation pratique orientée vers l\'emploi immédiat et la rémunération';
  }
  
  return 'Complète vos compétences actuelles et améliore votre employabilité';
}

function determineImmediateEmployment(formation) {
  const title = formation.intituleFormation?.toLowerCase() || '';
  const quickFormations = ['cariste', 'securite', 'cqp', 'habilitation', 'permis'];
  
  return quickFormations.some(keyword => title.includes(keyword)) ? 'true' : 'false';
}

function cleanDescription(description) {
  if (!description) return 'Formation professionnelle adaptée';
  
  return description
    .replace(/<[^>]*>/g, '') // Supprime HTML
    .replace(/\s+/g, ' ') // Normalise espaces
    .trim()
    .substring(0, 200) + (description.length > 200 ? '...' : '');
}

// Formations de fallback si l'API ne fonctionne pas
function fallbackFormations(candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  
  // Formations pour Mohammed (motivation financière + aucune qualification)
  if ((educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') && 
      aspirations.includes('fric')) {
    return [
      {
        title: 'CQP Agent de propreté et d\'hygiène',
        description: 'Formation pour devenir agent de propreté, débouchant sur des postes dans le nettoyage industriel ou commercial.',
        duration: '3 mois',
        relevance: 'Adaptée au profil car elle ne nécessite pas de qualifications préalables et offre des débouchés rapides.',
        funding: 'CPF, Pôle Emploi, financement possible',
        immediate_employment: 'true',
        url: '#',
        organisme: 'Organisme de formation',
        lieu: candidateProfile.location || 'France',
        certification: 'CQP reconnu'
      },
      {
        title: 'Permis de conduire cariste',
        description: 'Formation pour obtenir le permis de conduire des chariots élévateurs, permettant de travailler dans des entrepôts.',
        duration: '1 mois',
        relevance: 'Formation courte et pratique, avec une forte demande sur le marché du travail.',
        funding: 'CPF, Pôle Emploi selon éligibilité',
        immediate_employment: 'true',
        url: '#',
        organisme: 'Centre de formation agréé',
        lieu: candidateProfile.location || 'France',
        certification: 'CACES R489'
      },
      {
        title: 'Formation en sécurité incendie',
        description: 'Formation pour devenir agent de sécurité incendie, avec des débouchés dans divers secteurs.',
        duration: '2 mois',
        relevance: 'Permet d\'accéder à des postes dans la sécurité, secteur en constante demande.',
        funding: 'CPF, Région, Pôle Emploi',
        immediate_employment: 'true',
        url: '#',
        organisme: 'Organisme de formation sécurité',
        lieu: candidateProfile.location || 'France',
        certification: 'SSIAP 1'
      }
    ];
  }
  
  // Formations pour profils techniques
  if (educationLevel.includes('electrotechnique') || currentPosition.includes('technicien')) {
    return [
      {
        title: 'Formation CQP Technicien de Maintenance',
        description: 'Formation pour approfondir les compétences en maintenance industrielle, avec un accent sur les nouvelles technologies.',
        duration: '6 mois',
        relevance: 'Permet d\'acquérir des compétences supplémentaires et d\'augmenter l\'employabilité dans le secteur.',
        funding: 'CPF, OPCO, entreprise',
        immediate_employment: 'false',
        url: '#',
        organisme: 'Centre de formation technique',
        lieu: candidateProfile.location || 'France',
        certification: 'CQP Maintenance'
      },
      {
        title: 'Formation en Automatisme et Régulation',
        description: 'Formation axée sur les systèmes automatisés et la régulation, très demandée dans le secteur industriel.',
        duration: '1 an',
        relevance: 'Complète les compétences en électrotechnique et ouvre des opportunités dans des secteurs en pleine croissance.',
        funding: 'CPF, Région, OPCO',
        immediate_employment: 'false',
        url: '#',
        organisme: 'Institut technique',
        lieu: candidateProfile.location || 'France',
        certification: 'Titre professionnel'
      }
    ];
  }
  
  // Formations génériques
  return [
    {
      title: 'Formation en gestion de projet',
      description: 'Formation axée sur la gestion de projets complexes, avec un accent sur les outils numériques.',
      duration: '3 mois',
      relevance: 'Adaptée à votre expérience et améliore vos perspectives d\'évolution.',
      funding: 'CPF, employeur selon statut',
      immediate_employment: 'false',
      url: '#',
      organisme: 'Organisme de formation',
      lieu: candidateProfile.location || 'France',
      certification: 'Certification gestion de projet'
    }
  ];
}
