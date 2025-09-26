// netlify/functions/france-travail-jobs.js
// Version corrigée pour le secteur social + géolocalisation stricte

const communeMapping = {
  "paris": "75001",
  "pantin": "93055",
  "montreuil": "93048",
  "saint-denis": "93066",
  "aubervilliers": "93001",
  "bobigny": "93008",
  "noisy-le-sec": "93053",
  "romainville": "93063",
  "les lilas": "93045",
  "bagnolet": "93006",
  "vincennes": "94080",
  "neuilly-sur-seine": "92051",
  "levallois-perret": "92044",
  "boulogne-billancourt": "92012",
  "issy-les-moulineaux": "92040",
  "lyon": "69381",
  "marseille": "13055",
  "toulouse": "31555",
  "lille": "59350",
  "bordeaux": "33063",
  "nantes": "44109",
  "strasbourg": "67482",
  "montpellier": "34172",
  "rennes": "35238",
  "nice": "06088"
};

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const CLIENT_ID = 'PAR_assignme_706e20eb9f90ae0ed2dfd8e9feec3048f8612e02f616083c21c028a9f8a769f8';
    const CLIENT_SECRET = process.env.FRANCE_TRAVAIL_SECRET;

    console.log('=== DEBUT FRANCE TRAVAIL ===');
    console.log('CLIENT_SECRET present:', !!CLIENT_SECRET);

    if (!CLIENT_SECRET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };
    }

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };
    }

    console.log('Profil candidat recu:', JSON.stringify(candidateProfile, null, 2));

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur authentification', fallback: true }) };
    }

    // Recherche des offres
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    if (!searchResults.success) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: searchResults.error, fallback: true, jobs: mockJobs(candidateProfile) }) };
    }

    // Transformation des résultats
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobs: transformedJobs,
        metadata: {
          source: 'France Travail',
          total_found: searchResults.total,
          timestamp: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction France Travail:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur interne', fallback: true, jobs: mockJobs({}) }) };
  }
};

async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_offresdemploiv2 o2dsoffre'
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: `Authentification echouee: ${response.status} - ${errorData}` };
    }

    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'Token absent' };

    console.log('Authentification reussie');
    return { success: true, token: data.access_token };

  } catch (error) {
    return { success: false, error: `Erreur auth: ${error.message}` };
  }
}

async function searchJobs(token, candidateProfile) {
  try {
    const keywords = buildKeywords(candidateProfile);
    const location = extractLocation(candidateProfile.location);
    
    console.log('Mots-cles construits:', keywords);
    console.log('Localisation extraite:', location);

    const searchParams = new URLSearchParams({
      motsCles: keywords || "emploi",
      codePostal: location || '75001',
      distance: '10',
      sort: '0',
      range: '0-19'
    });

    if (candidateProfile.total_experience_years >= 5) {
      searchParams.append('experience', '2');
    } else if (candidateProfile.total_experience_years >= 2) {
      searchParams.append('experience', '1');
    }

    const response = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'ASSIGNME/1.0' }
    });

    console.log('Statut reponse recherche:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: `Recherche echouee: ${response.status} - ${errorData}` };
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return { success: true, jobs: [], total: 0 };
    }

    const data = JSON.parse(responseText);
    console.log(`${data.resultats?.length || 0} offres trouvees`);

    return { success: true, jobs: data.resultats || [], total: data.resultats?.length || 0 };

  } catch (error) {
    return { success: false, error: `Erreur recherche: ${error.message}` };
  }
}

// Construction des mots-clés avec focus secteur social
function buildKeywords(candidateProfile) {
  const entryLevelKeywords = ['agent', 'employe', 'accueil', 'vente', 'magasin', 'caissier', 'preparateur', 'manutention', 'nettoyage', 'restauration'];
  
  let selectedKeyword;
  
  // Si profil débutant
  if (candidateProfile.total_experience_years === 0 || candidateProfile.education_level === 'Aucune qualification' || candidateProfile.current_position === 'Sans emploi') {
    selectedKeyword = entryLevelKeywords[Math.floor(Math.random() * entryLevelKeywords.length)];
    console.log('Profil debutant detecte');
    
  } else {
    const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
    const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
    
    // Mapping spécialisé par secteur avec mots-clés plus précis
    if (educationLevel.includes('service social') || educationLevel.includes('deass') || currentPosition.includes('social')) {
      // Mots-clés spécifiques au secteur social/éducatif
      const socialKeywords = ['educateur', 'accompagnement', 'mediation', 'social'];
      selectedKeyword = socialKeywords[Math.floor(Math.random() * socialKeywords.length)];
      console.log('Profil social detecte -> secteur social/educatif');
      
    } else if (educationLevel.includes('comptab') || educationLevel.includes('gestion') || educationLevel.includes('finance')) {
      selectedKeyword = 'comptable';
      console.log('Formation comptabilite detecte -> comptable');
      
    } else if (educationLevel.includes('informatique') || educationLevel.includes('développ')) {
      selectedKeyword = 'informatique';
      console.log('Formation informatique detecte -> informatique');
      
    } else if (educationLevel.includes('commercial') || educationLevel.includes('vente') || currentPosition.includes('commercial')) {
      selectedKeyword = 'commercial';
      console.log('Profil commercial detecte -> commercial');
      
    } else if (educationLevel.includes('droit') || educationLevel.includes('juridique')) {
      selectedKeyword = 'administratif';
      console.log('Formation droit detecte -> administratif');
      
    } else {
      // Mapping générique basé sur l'expérience
      if (currentPosition.includes('adv') || currentPosition.includes('gestion')) {
        selectedKeyword = 'administratif';
      } else if (currentPosition.includes('responsable') || currentPosition.includes('manager')) {
        selectedKeyword = 'commercial';
      } else {
        selectedKeyword = 'assistant';
      }
      console.log('Mapping generique applique');
    }
  }
  
  console.log('Mots-cles generes:', selectedKeyword);
  return selectedKeyword;
}

// Extraction de localisation avec banlieue parisienne
function extractLocation(location) {
  if (!location) return '75001';
  
  console.log('Localisation a analyser:', location);
  const locationLower = location.toLowerCase().trim();
  
  // Recherche directe du code INSEE
  const inseeMatch = location.match(/\b(\d{5})\b/);
  if (inseeMatch) {
    console.log('Code INSEE detecte:', inseeMatch[1]);
    return inseeMatch[1];
  }
  
  // Recherche par nom de ville
  for (const [city, inseeCode] of Object.entries(communeMapping)) {
    if (locationLower.includes(city)) {
      console.log(`Ville "${city}" trouvee, code INSEE: ${inseeCode}`);
      return inseeCode;
    }
  }
  
  console.log('Aucune correspondance trouvee, utilisation Paris par defaut');
  return '75001';
}

// Filtrage géographique strict avec exclusion DOM-TOM et Corse
function filterJobsByLocation(jobs, candidateLocation) {
  if (!candidateLocation) return jobs;
  
  const locationLower = candidateLocation.toLowerCase();
  
  // Départements région parisienne
  const parisianDepartments = ['75', '77', '78', '91', '92', '93', '94', '95'];
  
  // Départements à exclure complètement
  const excludedDepartments = ['20', '2A', '2B', '971', '972', '973', '974', '976', '975', '984', '986', '987', '988'];
  
  // Départements grandes villes
  const majorCityDepartments = {
    'lyon': ['69'], 'marseille': ['13'], 'toulouse': ['31'], 'lille': ['59'],
    'bordeaux': ['33'], 'nantes': ['44'], 'strasbourg': ['67'], 'montpellier': ['34'],
    'rennes': ['35'], 'nice': ['06']
  };
  
  let allowedDepartments = [];
  
  // Détection candidat parisien (incluant toute la banlieue)
  const parisianCities = ['paris', 'pantin', 'montreuil', 'saint-denis', 'aubervilliers', 'bobigny', 'noisy-le-sec', 'romainville', 'les lilas', 'bagnolet', 'vincennes', 'neuilly', 'levallois', 'boulogne', 'issy'];
  
  const isParisian = parisianCities.some(city => locationLower.includes(city));
  
  if (isParisian) {
    allowedDepartments = parisianDepartments;
    console.log('Candidat parisien detecte - departements autorises:', allowedDepartments);
  } else {
    // Pour autres villes
    for (const [city, departments] of Object.entries(majorCityDepartments)) {
      if (locationLower.includes(city)) {
        allowedDepartments = departments;
        console.log(`Candidat ${city} detecte - departements autorises:`, allowedDepartments);
        break;
      }
    }
  }
  
  if (allowedDepartments.length === 0) {
    console.log('Pas de filtrage geographique applique');
    return jobs;
  }
  
  // Filtrage strict des offres
  const filteredJobs = jobs.filter(job => {
    const jobLocation = job.lieuTravail?.libelle || '';
    
    // Exclure explicitement DOM-TOM et Corse
    if (excludedDepartments.some(dept => jobLocation.includes(dept))) {
      console.log(`Offre DOM-TOM/Corse exclue: ${job.intitule} a ${jobLocation}`);
      return false;
    }
    
    // Exclure si contient "Corse" dans le libellé
    if (jobLocation.toLowerCase().includes('corse')) {
      console.log(`Offre Corse exclue: ${job.intitule} a ${jobLocation}`);
      return false;
    }
    
    const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
    
    if (departmentMatch) {
      const jobDepartment = departmentMatch[1];
      const isAllowed = allowedDepartments.includes(jobDepartment);
      
      if (!isAllowed) {
        console.log(`Offre filtree: ${job.intitule} a ${jobLocation} (dept ${jobDepartment})`);
      }
      
      return isAllowed;
    }
    
    return true;
  });
  
  console.log(`Filtrage: ${jobs.length} offres -> ${filteredJobs.length} conservees`);
  return filteredJobs;
}

function transformJobsForAssignme(jobs, candidateProfile) {
  const filteredJobs = filterJobsByLocation(jobs, candidateProfile.location);
  
  return filteredJobs.map(job => {
    const matchScore = calculateMatchScore(job, candidateProfile);
    
    return {
      id: job.id,
      source: 'France Travail',
      is_real_offer: true,
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
      date_creation: job.dateCreation,
      date_actualisation: job.dateActualisation,
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
  
  // Bonus forte correspondance formation/secteur
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  if (educationLevel.includes('service social') || educationLevel.includes('deass')) {
    if (jobText.includes('social') || jobText.includes('educateur') || jobText.includes('accompagnement') || jobText.includes('mediation')) {
      score += 25; // Bonus important pour secteur social
    }
  }
  
  if (educationLevel.includes('comptab') && jobText.includes('comptab')) score += 20;
  if (educationLevel.includes('droit') && (jobText.includes('juridique') || jobText.includes('administratif'))) score += 15;
  
  // Correspondance d'expérience
  if (job.experienceExige === 'D' && candidateProfile.total_experience_years >= 0) score += 15;
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
  
  if (educationLevel.includes('service social') || educationLevel.includes('deass')) {
    if (jobText.includes('social') || jobText.includes('education') || jobText.includes('accompagnement')) {
      reasons.push('Correspond a votre formation en service social');
    }
  }
  
  if (job.experienceExige === 'D') reasons.push('Ouvert aux debutants');
  else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) reasons.push('Experience compatible');
  
  return reasons.join(' • ');
}

// Fonctions utilitaires
function formatLocation(lieuTravail) { return lieuTravail?.libelle || 'Lieu non specifie'; }
function formatContractType(typeContrat) { const c = { CDI: 'CDI', CDD: 'CDD', MIS: 'Mission interim' }; return c[typeContrat] || typeContrat || 'Type non specifie'; }
function formatExperience(experienceExige) { const e = { D: 'Debutant accepte', S: 'Experience souhaitee', E: 'Experience exigee' }; return e[experienceExige] || 'Non specifie'; }
function cleanDescription(description) { return description ? description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) + (description.length > 500 ? '...' : '') : 'Description non disponible'; }
function extractSalaryMin(salaireText) { if (!salaireText) return null; const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/); return match ? parseInt(match[1].replace(/\s/g, '')) : null; }
function extractSalaryMax(salaireText) { if (!salaireText) return null; const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/); return matches && matches.length >= 3 ? parseInt(matches[2].replace(/\s/g, '')) : extractSalaryMin(salaireText); }
function extractSkillsFromJob(job) { const skills = []; const text = `${job.intitule} ${job.description || ''}`.toLowerCase(); const common = ['communication','gestion','mediation','accompagnement','social','education']; common.forEach(s => { if (text.includes(s)) skills.push(s.charAt(0).toUpperCase() + s.slice(1)); }); return skills.slice(0, 5); }

function mockJobs(candidateProfile) {
  return [
    {
      id: "fallback-1", source: "Mock", is_real_offer: false,
      job_title: "Assistant social (exemple)", company: "Service public local",
      location: candidateProfile.location || "Paris", description: "Poste de fallback - accompagnement social et mediation familiale",
      contract_type: "CDI", sector: "Social", salary_display: "28k-32k €",
      salary_min: 28000, salary_max: 32000, experience_required: "Experience souhaitee",
      qualification_required: "DEASS requis", date_creation: new Date().toISOString(),
      match_score: 75, match_justification: "Fallback adapte au profil social", france_travail_url: "#",
      required_skills: ["Accompagnement", "Mediation", "Social"], company_types: ["Public"], evolution_potential: "Evolution vers coordinateur"
    }
  ];
}
