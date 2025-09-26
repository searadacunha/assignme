// netlify/functions/france-travail-jobs.js
// Version finale avec formations recommandées intégrées

const communeMapping = {
  // Région parisienne
  "paris": "75001", "pantin": "93055", "montreuil": "93048", "saint-denis": "93066", "aubervilliers": "93001",
  "bobigny": "93008", "vincennes": "94080", "neuilly-sur-seine": "92051", "levallois-perret": "92044",
  "boulogne-billancourt": "92012", "issy-les-moulineaux": "92040",
  
  // Auvergne-Rhône-Alpes
  "lyon": "69381", "villeurbanne": "69266", "annecy": "74010", "seynod": "74257", "cran-gevrier": "74096",
  "chambery": "73065", "grenoble": "38185", "fontaine": "38169", "saint-martin-dheres": "38421",
  "clermont-ferrand": "63113", "saint-etienne": "42218",
  
  // Autres grandes villes
  "marseille": "13055", "toulouse": "31555", "lille": "59350", "bordeaux": "33063", "nantes": "44109",
  "strasbourg": "67482", "montpellier": "34172", "rennes": "35238", "nice": "06088", "nancy": "54395",
  "metz": "57463", "dijon": "21231", "besancon": "25056", "mulhouse": "68224"
};

// Base de données des formations par secteur et région
const formationsDatabase = {
  // Formations techniques/industrielles
  technique: {
    electricien: [
      {
        title: "Titre professionnel Électricien d'équipement du bâtiment",
        organisme: "AFPA",
        duree: "7 mois",
        niveau: "CAP/BEP",
        financement: "CPF, Pôle emploi, Région",
        prerequis: "Niveau 3ème, aptitudes physiques",
        debouches: "Électricien bâtiment, installateur électrique",
        salaire_apres: "1800-2500€",
        lieux: {
          "auvergne-rhone-alpes": ["Annecy", "Lyon", "Grenoble", "Chambéry"],
          "ile-de-france": ["Paris", "Nanterre", "Créteil", "Saint-Denis"],
          "provence-alpes-cote-azur": ["Marseille", "Nice", "Toulon"]
        }
      },
      {
        title: "CAP Électricien",
        organisme: "CFA/Lycées professionnels",
        duree: "2 ans (possible 1 an si reconversion)",
        niveau: "CAP",
        financement: "Apprentissage, CPF, Transition Pro",
        prerequis: "Niveau 3ème minimum",
        debouches: "Électricien, technicien maintenance",
        salaire_apres: "1600-2200€",
        lieux: {
          "auvergne-rhone-alpes": ["Annecy", "Lyon", "Saint-Étienne"],
          "ile-de-france": ["Paris", "Argenteuil", "Meaux"],
          "hauts-de-france": ["Lille", "Amiens", "Valenciennes"]
        }
      },
      {
        title: "Habilitation électrique B1V B2V BR BC",
        organisme: "Organismes agréés",
        duree: "3-5 jours",
        niveau: "Certification",
        financement: "CPF, employeur",
        prerequis: "Notions électricité de base",
        debouches: "Complément obligatoire pour électriciens",
        salaire_apres: "Évolution +200-400€/mois",
        lieux: {
          "national": ["Toutes grandes villes", "Centres de formation agréés"]
        }
      }
    ],
    technicien: [
      {
        title: "BTS Maintenance des systèmes industriels",
        organisme: "Lycées techniques/IUT",
        duree: "2 ans",
        niveau: "BTS",
        financement: "Apprentissage, CPF, financement personnel",
        prerequis: "Bac (Pro/Techno/Général)",
        debouches: "Technicien maintenance, responsable équipe",
        salaire_apres: "2200-3000€",
        lieux: {
          "auvergne-rhone-alpes": ["Lyon", "Grenoble", "Annecy"],
          "ile-de-france": ["Paris", "Versailles", "Évry"],
          "hauts-de-france": ["Lille", "Valenciennes"]
        }
      },
      {
        title: "Titre professionnel Technicien de maintenance industrielle",
        organisme: "AFPA/GRETA",
        duree: "8-12 mois",
        niveau: "BAC+2",
        financement: "CPF, Pôle emploi, Région",
        prerequis: "Expérience technique ou BAC",
        debouches: "Technicien maintenance, contrôleur qualité",
        salaire_apres: "2000-2800€",
        lieux: {
          "auvergne-rhone-alpes": ["Annecy", "Chambéry", "Lyon"],
          "ile-de-france": ["Montreuil", "Argenteuil"]
        }
      }
    ]
  },
  
  // Formations sociales/éducatives
  social: {
    educateur: [
      {
        title: "DEAES - Diplôme d'État d'Accompagnant Éducatif et Social",
        organisme: "IRTS/Écoles spécialisées",
        duree: "12-24 mois",
        niveau: "Niveau 3 (CAP)",
        financement: "Région, CPF, employeur, Pôle emploi",
        prerequis: "Aucun diplôme requis",
        debouches: "Accompagnant personnes âgées/handicapées",
        salaire_apres: "1600-1900€",
        lieux: {
          "auvergne-rhone-alpes": ["Lyon", "Grenoble", "Chambéry"],
          "ile-de-france": ["Paris", "Créteil", "Versailles"],
          "provence-alpes-cote-azur": ["Marseille", "Nice"]
        }
      },
      {
        title: "DEEJE - Diplôme d'État d'Éducateur de Jeunes Enfants",
        organisme: "IRTS",
        duree: "3 ans",
        niveau: "BAC+3",
        financement: "Région, employeur, CPF",
        prerequis: "Bac ou équivalent",
        debouches: "Éducateur petite enfance, crèches",
        salaire_apres: "1800-2400€",
        lieux: {
          "ile-de-france": ["Paris", "Saint-Denis"],
          "auvergne-rhone-alpes": ["Lyon", "Grenoble"]
        }
      }
    ],
    accompagnement: [
      {
        title: "CQP Animateur de loisir sportif",
        organisme: "Fédérations sportives",
        duree: "6 mois",
        niveau: "CQP",
        financement: "CPF, Région",
        prerequis: "18 ans minimum",
        debouches: "Animateur sportif, centres de loisirs",
        salaire_apres: "1500-2000€",
        lieux: {
          "national": ["Toutes régions", "Centres de formation agréés"]
        }
      }
    ]
  },
  
  // Formations tertiaires
  tertiaire: {
    comptable: [
      {
        title: "DCG - Diplôme de Comptabilité et Gestion",
        organisme: "Lycées/IUT/Écoles privées",
        duree: "3 ans",
        niveau: "BAC+3",
        financement: "Formation initiale, apprentissage, CPF",
        prerequis: "Bac",
        debouches: "Comptable, gestionnaire paie, contrôleur",
        salaire_apres: "2000-2800€",
        lieux: {
          "ile-de-france": ["Paris", "Versailles", "Créteil"],
          "auvergne-rhone-alpes": ["Lyon", "Grenoble"]
        }
      },
      {
        title: "Titre professionnel Comptable assistant",
        organisme: "AFPA/GRETA",
        duree: "7 mois",
        niveau: "BAC",
        financement: "CPF, Pôle emploi",
        prerequis: "Niveau BAC ou expérience",
        debouches: "Assistant comptable, aide comptable",
        salaire_apres: "1700-2300€",
        lieux: {
          "auvergne-rhone-alpes": ["Annecy", "Lyon", "Chambéry"],
          "ile-de-france": ["Paris", "Montreuil"]
        }
      }
    ],
    commercial: [
      {
        title: "BTS Commerce international",
        organisme: "Lycées techniques",
        duree: "2 ans",
        niveau: "BTS",
        financement: "Apprentissage, financement personnel",
        prerequis: "Bac",
        debouches: "Commercial export, assistant commercial",
        salaire_apres: "2000-3500€",
        lieux: {
          "ile-de-france": ["Paris", "Versailles"],
          "auvergne-rhone-alpes": ["Lyon"]
        }
      }
    ],
    informatique: [
      {
        title: "Titre professionnel Développeur web et web mobile",
        organisme: "AFPA/Écoles spécialisées",
        duree: "6-8 mois",
        niveau: "BAC+2",
        financement: "CPF, Pôle emploi, bootcamp",
        prerequis: "Logique, bases informatiques",
        debouches: "Développeur web, intégrateur",
        salaire_apres: "2200-3500€",
        lieux: {
          "national": ["Toutes grandes villes", "Formation à distance possible"]
        }
      }
    ]
  }
};

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

    console.log('=== DEBUT FRANCE TRAVAIL ===');
    if (!CLIENT_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };

    console.log('Profil candidat recu:', JSON.stringify(candidateProfile, null, 2));

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur authentification', fallback: true }) };

    // Recherche des offres
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    if (!searchResults.success) return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: searchResults.error, fallback: true, jobs: mockJobs(candidateProfile) }) };

    // Transformation des résultats
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);
    
    // Génération des formations recommandées
    const recommendedFormations = generateFormationRecommendations(candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobs: transformedJobs,
        formations: recommendedFormations,
        metadata: { 
          source: 'France Travail', 
          total_found: searchResults.total, 
          formations_count: recommendedFormations.length,
          timestamp: new Date().toISOString() 
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction France Travail:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur interne', fallback: true, jobs: mockJobs({}), formations: [] }) };
  }
};

// Génération des recommandations de formation basées sur le profil
function generateFormationRecommendations(candidateProfile) {
  const formations = [];
  const location = candidateProfile.location || '';
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const experienceYears = candidateProfile.total_experience_years || 0;
  const technicalSkills = (candidateProfile.technical_skills || []).join(' ').toLowerCase();
  
  // Déterminer la région du candidat
  const candidateRegion = detectCandidateRegion(location);
  
  console.log(`Analyse formation pour: niveau=${educationLevel}, poste=${currentPosition}, experience=${experienceYears}ans`);
  
  // PROFILS TECHNIQUES
  if (educationLevel.includes('electrotechnique') || currentPosition.includes('technicien') || 
      currentPosition.includes('maintenance') || technicalSkills.includes('maintenance')) {
    
    // Formations d'évolution pour électrotechniciens expérimentés
    if (experienceYears >= 3 && educationLevel.includes('electrotechnique')) {
      addFormationsForProfile(formations, 'technique', 'technicien', candidateRegion, {
        priority: 'evolution',
        current_level: 'bac_pro'
      });
    }
    
    // Formations électricien de base
    addFormationsForProfile(formations, 'technique', 'electricien', candidateRegion, {
      priority: 'reconversion',
      current_level: educationLevel.includes('bac') ? 'bac' : 'cap'
    });
  }
  
  // PROFILS SOCIAUX
  else if (educationLevel.includes('service social') || educationLevel.includes('deass') || 
           currentPosition.includes('social') || currentPosition.includes('assistant')) {
    
    addFormationsForProfile(formations, 'social', 'educateur', candidateRegion, {
      priority: 'specialisation',
      current_level: educationLevel.includes('deass') ? 'deass' : 'debutant'
    });
    
    addFormationsForProfile(formations, 'social', 'accompagnement', candidateRegion, {
      priority: 'complement'
    });
  }
  
  // PROFILS TERTIAIRES
  else if (educationLevel.includes('comptab') || educationLevel.includes('gestion') || 
           currentPosition.includes('administratif') || currentPosition.includes('comptab')) {
    
    addFormationsForProfile(formations, 'tertiaire', 'comptable', candidateRegion, {
      priority: experienceYears >= 2 ? 'evolution' : 'reconversion',
      current_level: educationLevel.includes('bac') ? 'bac' : 'debutant'
    });
  }
  
  else if (educationLevel.includes('commercial') || currentPosition.includes('commercial')) {
    addFormationsForProfile(formations, 'tertiaire', 'commercial', candidateRegion, {
      priority: 'specialisation'
    });
  }
  
  else if (educationLevel.includes('informatique') || technicalSkills.includes('python') || 
           technicalSkills.includes('web')) {
    addFormationsForProfile(formations, 'tertiaire', 'informatique', candidateRegion, {
      priority: 'reconversion'
    });
  }
  
  // PROFILS DEBUTANTS - formations d'insertion
  else if (experienceYears === 0 || educationLevel === 'aucune qualification' || 
           currentPosition === 'sans emploi') {
    
    // Formations courtes d'insertion
    addFormationsForProfile(formations, 'social', 'accompagnement', candidateRegion, {
      priority: 'insertion'
    });
    
    // Formations techniques accessibles
    addFormationsForProfile(formations, 'technique', 'electricien', candidateRegion, {
      priority: 'insertion',
      filter: 'courtes'
    });
  }
  
  console.log(`${formations.length} formations recommandees pour ${candidateRegion}`);
  return formations.slice(0, 6); // Limiter à 6 formations max
}

function detectCandidateRegion(location) {
  if (!location) return 'ile-de-france';
  
  const locationLower = location.toLowerCase();
  
  // Mapping ville -> région
  const cityToRegion = {
    'paris': 'ile-de-france', 'pantin': 'ile-de-france', 'montreuil': 'ile-de-france',
    'lyon': 'auvergne-rhone-alpes', 'annecy': 'auvergne-rhone-alpes', 'seynod': 'auvergne-rhone-alpes',
    'chambery': 'auvergne-rhone-alpes', 'grenoble': 'auvergne-rhone-alpes',
    'marseille': 'provence-alpes-cote-azur', 'nice': 'provence-alpes-cote-azur',
    'toulouse': 'occitanie', 'montpellier': 'occitanie',
    'bordeaux': 'nouvelle-aquitaine', 'nantes': 'pays-de-la-loire',
    'lille': 'hauts-de-france', 'strasbourg': 'grand-est', 'nancy': 'grand-est'
  };
  
  for (const [city, region] of Object.entries(cityToRegion)) {
    if (locationLower.includes(city)) {
      return region;
    }
  }
  
  return 'national'; // Fallback
}

function addFormationsForProfile(formations, secteur, type, region, options = {}) {
  const formationsOfType = formationsDatabase[secteur]?.[type] || [];
  
  formationsOfType.forEach(formation => {
    // Vérifier si la formation est disponible dans la région
    const lieux = formation.lieux[region] || formation.lieux['national'] || [];
    if (lieux.length === 0) return;
    
    // Filtrer selon les options
    if (options.filter === 'courtes' && !formation.duree.includes('mois')) return;
    if (options.current_level === 'bac_pro' && formation.niveau === 'CAP') return;
    
    // Calculer la pertinence
    let pertinence = 70;
    if (options.priority === 'evolution') pertinence += 20;
    else if (options.priority === 'specialisation') pertinence += 15;
    else if (options.priority === 'reconversion') pertinence += 10;
    else if (options.priority === 'insertion') pertinence += 5;
    
    // Ajouter bonus géographique
    if (region !== 'national') pertinence += 10;
    
    formations.push({
      ...formation,
      secteur,
      type,
      pertinence,
      lieux_proches: lieux.slice(0, 3), // Max 3 lieux les plus proches
      region: region,
      justification: generateFormationJustification(formation, options),
      url_info: generateFormationURL(formation, region),
      contact: generateFormationContact(formation, region)
    });
  });
}

function generateFormationJustification(formation, options) {
  const reasons = [];
  
  if (options.priority === 'evolution') {
    reasons.push('Formation d\'évolution professionnelle adaptée à votre expérience');
  } else if (options.priority === 'reconversion') {
    reasons.push('Formation de reconversion dans un secteur porteur');
  } else if (options.priority === 'specialisation') {
    reasons.push('Spécialisation pour renforcer vos compétences actuelles');
  } else if (options.priority === 'insertion') {
    reasons.push('Formation d\'insertion pour accéder rapidement à l\'emploi');
  }
  
  if (formation.financement.includes('CPF')) {
    reasons.push('Éligible au financement CPF');
  }
  
  if (formation.financement.includes('Pôle emploi')) {
    reasons.push('Financement Pôle emploi possible');
  }
  
  return reasons.join(' • ');
}

function generateFormationURL(formation, region) {
  // URLs génériques vers les organismes principaux
  if (formation.organisme.includes('AFPA')) {
    return 'https://www.afpa.fr/formation-qualifiante';
  } else if (formation.organisme.includes('GRETA')) {
    return 'https://www.education.gouv.fr/formation-continue-des-adultes-greta-42452';
  } else if (formation.organisme.includes('CFA')) {
    return 'https://www.alternance.emploi.gouv.fr/';
  } else {
    return 'https://www.moncompteformation.gouv.fr/';
  }
}

function generateFormationContact(formation, region) {
  return {
    type: 'Orientation conseillée',
    contact: 'Conseiller Pôle emploi ou CEP (Conseil en Évolution Professionnelle)',
    phone: '3949 (Pôle emploi)',
    online: 'https://candidat.pole-emploi.fr/'
  };
}

// Le reste du code (authentification, recherche emplois, etc.) reste identique...
// [Code précédent pour getAccessToken, searchJobs, buildKeywords, etc.]

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api_offresdemploiv2 o2dsoffre'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: params.toString()
    });

    if (!response.ok) return { success: false, error: `Auth failed: ${response.status}` };
    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'No token' };

    console.log('Authentification reussie');
    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function searchJobs(token, candidateProfile) {
  try {
    const keywords = buildKeywords(candidateProfile);
    const location = extractLocation(candidateProfile.location);
    
    console.log('Mots-cles construits:', keywords);
    console.log('Localisation extraite:', location);

    const searchParams = new URLSearchParams({
      motsCles: keywords || "emploi", codePostal: location || '75001', distance: getSearchDistance(candidateProfile.location),
      sort: '0', range: '0-19'
    });

    if (candidateProfile.total_experience_years >= 5) searchParams.append('experience', '2');
    else if (candidateProfile.total_experience_years >= 2) searchParams.append('experience', '1');

    const response = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'ASSIGNME/1.0' }
    });

    console.log('Statut reponse recherche:', response.status);
    if (!response.ok) return { success: false, error: `Search failed: ${response.status}` };

    const responseText = await response.text();
    if (!responseText.trim()) return { success: true, jobs: [], total: 0 };

    const data = JSON.parse(responseText);
    console.log(`${data.resultats?.length || 0} offres trouvees`);
    return { success: true, jobs: data.resultats || [], total: data.resultats?.length || 0 };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

function buildKeywords(candidateProfile) {
  const entryLevelKeywords = ['agent', 'employe', 'accueil', 'vente', 'caissier', 'preparateur', 'nettoyage'];
  
  if (candidateProfile.total_experience_years === 0 || candidateProfile.education_level === 'Aucune qualification' || candidateProfile.current_position === 'Sans emploi') {
    const keyword = entryLevelKeywords[Math.floor(Math.random() * entryLevelKeywords.length)];
    console.log('Profil debutant detecte');
    return keyword;
  }

  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const technicalSkills = (candidateProfile.technical_skills || []).join(' ').toLowerCase();
  
  if (educationLevel.includes('electrotechnique') || educationLevel.includes('électrotechnique') || 
      currentPosition.includes('technicien') || currentPosition.includes('maintenance') ||
      technicalSkills.includes('maintenance') || technicalSkills.includes('dépannage')) {
    
    if (educationLevel.includes('electrotechnique') || technicalSkills.includes('installation')) {
      console.log('Profil electrotechnique detecte -> electricien');
      return 'electricien';
    } else if (currentPosition.includes('maintenance') || technicalSkills.includes('maintenance')) {
      console.log('Profil maintenance detecte -> technicien');
      return 'technicien';
    }
  }
  
  if (educationLevel.includes('service social') || educationLevel.includes('deass') || currentPosition.includes('social')) {
    const socialKeywords = ['educateur', 'accompagnement', 'mediation', 'social'];
    const keyword = socialKeywords[Math.floor(Math.random() * socialKeywords.length)];
    console.log('Profil social detecte -> secteur social');
    return keyword;
  }
  
  if (educationLevel.includes('comptab') || educationLevel.includes('gestion') || educationLevel.includes('finance')) {
    console.log('Formation comptabilite detecte -> comptable');
    return 'comptable';
  }
  
  if (educationLevel.includes('informatique') || educationLevel.includes('développ') || technicalSkills.includes('python')) {
    console.log('Formation informatique detecte -> informatique');
    return 'informatique';
  }
  
  if (educationLevel.includes('commercial') || currentPosition.includes('commercial') || currentPosition.includes('adv')) {
    console.log('Profil commercial detecte -> commercial');
    return 'commercial';
  }
  
  if (educationLevel.includes('droit')) {
    console.log('Formation droit detecte -> administratif');
    return 'administratif';
  }
  
  console.log('Mapping generique applique -> assistant');
  return 'assistant';
}

function getSearchDistance(location) {
  if (!location) return '10';
  
  const locationLower = location.toLowerCase();
  const majorCities = ['paris', 'lyon', 'marseille', 'toulouse', 'lille', 'bordeaux', 'nantes', 'strasbourg', 'montpellier'];
  if (majorCities.some(city => locationLower.includes(city))) {
    console.log('Grande metropole detectee - distance 10km');
    return '10';
  }
  
  const mediumCities = ['annecy', 'seynod', 'chambery', 'grenoble', 'clermont', 'saint-etienne', 'nancy', 'metz', 'dijon', 'besancon'];
  if (mediumCities.some(city => locationLower.includes(city))) {
    console.log('Ville moyenne detectee - distance 50km');
    return '50';
  }
  
  console.log('Localisation inconnue - distance 25km');
  return '25';
}

function extractLocation(location) {
  if (!location) return '75001';
  
  console.log('Localisation a analyser:', location);
  const locationLower = location.toLowerCase().trim();
  
  const inseeMatch = location.match(/\b(\d{5})\b/);
  if (inseeMatch) {
    console.log('Code INSEE detecte:', inseeMatch[1]);
    return inseeMatch[1];
  }
  
  for (const [city, inseeCode] of Object.entries(communeMapping)) {
    if (locationLower.includes(city)) {
      console.log(`Ville "${city}" trouvee, code INSEE: ${inseeCode}`);
      return inseeCode;
    }
  }
  
  console.log('Ville non reconnue - Paris par defaut');
  return '75001';
}

function filterJobsByLocation(jobs, candidateLocation) {
  if (!candidateLocation) return jobs;
  
  const locationLower = candidateLocation.toLowerCase();
  
  const localBasins = {
    'annecy-chambery': ['73', '74', '01'],
    'seynod-annecy': ['73', '74', '01'],
    'grenoble': ['38', '73', '26', '05'],
    'lyon': ['69', '01', '42', '71'],
    'clermont-ferrand': ['63', '03', '15', '43'],
    'saint-etienne': ['42', '69', '43', '07'],
    'nancy': ['54', '55', '57', '88'],
    'metz': ['57', '54', '55', '67'],
    'dijon': ['21', '71', '89', '70'],
    'besancon': ['25', '70', '39', '90']
  };
  
  const metropolitanRegions = {
    'ile-de-france': ['75', '77', '78', '91', '92', '93', '94', '95'],
    'provence-alpes-cote-azur': ['04', '05', '06', '13', '83', '84'],
    'occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    'nouvelle-aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    'grand-est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
    'hauts-de-france': ['02', '59', '60', '62', '80'],
    'pays-de-la-loire': ['44', '49', '53', '72', '85'],
    'bretagne': ['22', '29', '35', '56'],
    'bourgogne-franche-comte': ['21', '25', '39', '58', '70', '71', '89', '90'],
    'centre-val-de-loire': ['18', '28', '36', '37', '41', '45'],
    'normandie': ['14', '27', '50', '61', '76']
  };
  
  const excludedDepartments = ['20', '2A', '2B', '971', '972', '973', '974', '976', '975', '984', '986', '987', '988'];
  
  let allowedDepartments = [];
  let isStrictLocal = false;
  
  for (const [basin, departments] of Object.entries(localBasins)) {
    const basinCities = basin.split('-');
    if (basinCities.some(city => locationLower.includes(city))) {
      allowedDepartments = departments;
      isStrictLocal = true;
      console.log(`Bassin local detecte (${basin}) - departements autorises:`, allowedDepartments);
      break;
    }
  }
  
  if (!isStrictLocal) {
    const cityToRegion = {
      'paris': 'ile-de-france', 'pantin': 'ile-de-france', 'montreuil': 'ile-de-france',
      'marseille': 'provence-alpes-cote-azur', 'nice': 'provence-alpes-cote-azur',
      'toulouse': 'occitanie', 'montpellier': 'occitanie',
      'bordeaux': 'nouvelle-aquitaine', 'nantes': 'pays-de-la-loire', 'lille': 'hauts-de-france',
      'strasbourg': 'grand-est', 'rennes': 'bretagne'
    };
    
    for (const [city, region] of Object.entries(cityToRegion)) {
      if (locationLower.includes(city)) {
        allowedDepartments = metropolitanRegions[region];
        console.log(`Metropole detectee (${city}) - region ${region} autorisee:`, allowedDepartments);
        break;
      }
    }
  }
  
  if (allowedDepartments.length === 0) {
    console.log('Localisation non reconnue - pas de filtrage geographique');
    return jobs;
  }
  
  const filteredJobs = jobs.filter(job => {
    const jobLocation = job.lieuTravail?.libelle || '';
    
    if (excludedDepartments.some(dept => jobLocation.includes(dept)) || 
        jobLocation.toLowerCase().includes('corse') ||
        jobLocation.includes('Guadeloupe') || jobLocation.includes('Martinique') ||
        jobLocation.includes('Guyane') || jobLocation.includes('Réunion')) {
      console.log(`Offre exclue (DOM-TOM/Corse): ${jobLocation}`);
      return false;
    }
    
    if (isStrictLocal) {
      const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
      if (departmentMatch) {
        const jobDepartment = departmentMatch[1];
        const isAllowed = allowedDepartments.includes(jobDepartment);
        
        if (!isAllowed) {
          console.log(`Offre filtree (hors bassin local): ${job.intitule} a ${jobLocation} (dept ${jobDepartment})`);
        }
        return isAllowed;
      }
      
      console.log(`Offre filtree (format lieu incorrect): ${jobLocation}`);
      return false;
    }
    
    const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
    if (departmentMatch) {
      const jobDepartment = departmentMatch[1];
      const isAllowed = allowedDepartments.includes(jobDepartment);
      
      if (!isAllowed) {
        console.log(`Offre filtree (hors region): ${job.intitule} a ${jobLocation} (dept ${jobDepartment})`);
      }
      return isAllowed;
    }
    
    return true;
  });
  
  console.log(`Filtrage ${isStrictLocal ? 'strict (bassin local)' : 'regional'}: ${jobs.length} offres -> ${filteredJobs.length} conservees`);
  return filteredJobs;
}

function transformJobsForAssignme(jobs, candidateProfile) {
  const filteredJobs = filterJobsByLocation(jobs, candidateProfile.location);
  
  return filteredJobs.map(job => {
    const matchScore = calculateMatchScore(job, candidateProfile);
    
    return {
      id: job.id, source: 'France Travail', is_real_offer: true,
      job_title: job.intitule || 'Poste non specifie',
      company: job.entreprise?.nom || 'Entreprise non communiquee',
      location: formatLocation(job.lieuTravail),
      description: cleanDescription(job.description),
      contract_type: formatContractType(job.typeContrat),
      sector: job.secteurActivite || 'Secteur non specifie',
      salary_display: job.salaire?.libelle || 'Salaire non communique',
      salary_min: extractSalaryMin(job.salaire?.libelle),
      salary_max: extractSalaryMax(job.salaire?.libelle),
      experience_required: formatExperience(job.experienceExige),
      qualification_required: job.qualificationLibelle || 'Non specifie',
      date_creation: job.dateCreation, date_actualisation: job.dateActualisation,
      match_score: matchScore,
      match_justification: generateMatchJustification(job, candidateProfile, matchScore),
      france_travail_url: `https://candidat.pole-emploi.fr/offres/recherche/detail/${job.id}`,
      required_skills: extractSkillsFromJob(job),
      company_types: [job.entreprise?.adaptee ? 'Entreprise adaptee' : 'Standard'],
      evolution_potential: 'A definir avec employeur'
    };
  });
}

function calculateMatchScore(job, candidateProfile) {
  let score = 40;
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  
  if (educationLevel.includes('electrotechnique') && (jobText.includes('electr') || jobText.includes('technicien'))) score += 25;
  if (currentPosition.includes('technicien') && jobText.includes('technicien')) score += 20;
  if (currentPosition.includes('maintenance') && jobText.includes('maintenance')) score += 25;
  
  if (educationLevel.includes('service social') && (jobText.includes('social') || jobText.includes('education'))) score += 25;
  if (educationLevel.includes('comptab') && jobText.includes('comptab')) score += 20;
  
  if (job.experienceExige === 'D') score += 15;
  else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) score += 15;
  else if (job.experienceExige === 'E' && candidateProfile.total_experience_years >= 5) score += 15;
  
  return Math.min(Math.max(score, 25), 95);
}

function generateMatchJustification(job, candidateProfile, score) {
  const reasons = [];
  
  if (score >= 80) reasons.push('Excellente correspondance avec votre profil');
  else if (score >= 60) reasons.push('Bonne correspondance avec vos competences');
  else reasons.push('Correspondance acceptable');
  
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  
  if (educationLevel.includes('electrotechnique') && jobText.includes('electr')) reasons.push('Correspond a votre formation electrotechnique');
  if (educationLevel.includes('service social') && jobText.includes('social')) reasons.push('Correspond a votre formation sociale');
  if (job.experienceExige === 'D') reasons.push('Ouvert aux debutants');
  
  return reasons.join(' • ');
}

function formatLocation(lieuTravail) { return lieuTravail?.libelle || 'Lieu non specifie'; }
function formatContractType(typeContrat) { const c = { CDI: 'CDI', CDD: 'CDD', MIS: 'Mission interim' }; return c[typeContrat] || typeContrat || 'Type non specifie'; }
function formatExperience(experienceExige) { const e = { D: 'Debutant accepte', S: 'Experience souhaitee', E: 'Experience exigee' }; return e[experienceExige] || 'Non specifie'; }
function cleanDescription(description) { return description ? description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) + (description.length > 500 ? '...' : '') : 'Description non disponible'; }
function extractSalaryMin(salaireText) { if (!salaireText) return null; const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/); return match ? parseInt(match[1].replace(/\s/g, '')) : null; }
function extractSalaryMax(salaireText) { if (!salaireText) return null; const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/); return matches && matches.length >= 3 ? parseInt(matches[2].replace(/\s/g, '')) : extractSalaryMin(salaireText); }
function extractSkillsFromJob(job) { const skills = []; const text = `${job.intitule} ${job.description || ''}`.toLowerCase(); const common = ['maintenance','electricite','technicien','installation','depannage','social','education','comptabilite']; common.forEach(s => { if (text.includes(s)) skills.push(s.charAt(0).toUpperCase() + s.slice(1)); }); return skills.slice(0, 5); }

function mockJobs(candidateProfile) {
  const location = candidateProfile.location || "France";
  const isElectrotechnique = candidateProfile.education_level?.toLowerCase().includes('electrotechnique');
  
  return [
    {
      id: "fallback-1", source: "Mock", is_real_offer: false,
      job_title: isElectrotechnique ? "Technicien maintenance (exemple)" : "Assistant administratif (exemple)",
      company: "Entreprise locale", location: location,
      description: isElectrotechnique ? "Maintenance equipements industriels, depannage electrique" : "Gestion administrative et support",
      contract_type: "CDI", sector: isElectrotechnique ? "Industrie" : "Administratif",
      salary_display: isElectrotechnique ? "30k-35k €" : "25k-30k €",
      salary_min: isElectrotechnique ? 30000 : 25000, salary_max: isElectrotechnique ? 35000 : 30000,
      experience_required: "Experience souhaitee", qualification_required: isElectrotechnique ? "Bac Pro Electrotechnique" : "Bac",
      date_creation: new Date().toISOString(), match_score: 65,
      match_justification: "Fallback adapte au profil", france_travail_url: "#",
      required_skills: isElectrotechnique ? ["Maintenance", "Electricite"] : ["Communication", "Gestion"],
      company_types: ["Standard"], evolution_potential: "Evolution possible"
    }
  ];
}
