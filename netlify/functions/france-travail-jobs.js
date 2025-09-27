// netlify/functions/france-travail-jobs.js
// Version simplifiée - affichage de toutes les offres adaptées

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

    if (!CLIENT_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur authentification', fallback: true }) };

    // Recherche des offres
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    if (!searchResults.success) return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: searchResults.error, fallback: true, jobs: mockJobs(candidateProfile) }) };

    // Transformation simple
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobs: transformedJobs,
        metadata: { source: 'France Travail', total_found: searchResults.total, timestamp: new Date().toISOString() }
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
      grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,     scope: 'api_offresdemploiv2 o2dsoffre'
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
      motsCles: keywords || "emploi", 
      codePostal: location || '75001', 
      distance: getSearchDistance(candidateProfile.location),
      sort: '0', 
      range: '0-49'
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

// Construction des mots-clés SIMPLIFIÉE
function buildKeywords(candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const technicalSkills = (candidateProfile.technical_skills || []).join(' ').toLowerCase();
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  
  // PROFIL MOHAMMED : motivation financière + aucune qualification
  if ((educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') && 
      aspirations.includes('fric')) {
    console.log('Profil Mohammed detecte -> manutention');
    return 'manutention';
  }
  
  // PROFILS TECHNIQUES
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
  
  // PROFILS CRÉATIFS/CULTURELS
  if (currentPosition.includes('communication') || technicalSkills.includes('création vidéo') || 
      technicalSkills.includes('coordination de projets') || aspirations.includes('culture')) {
    console.log('Profil créatif/culturel detecte -> communication');
    return 'communication';
  }
  
  // PROFILS SOCIAUX
  if (educationLevel.includes('service social') || educationLevel.includes('deass') || currentPosition.includes('social')) {
    console.log('Profil social detecte -> educateur');
    return 'educateur';
  }
  
  // PROFILS TERTIAIRES
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
  
  // Profil débutant générique
  if (candidateProfile.total_experience_years === 0 || educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') {
    console.log('Profil debutant detecte -> agent');
    return 'agent';
  }
  
  // Fallback
  console.log('Mapping generique applique -> assistant');
  return 'assistant';
}

function getSearchDistance(location) {
  if (!location) return '10';
  
  const locationLower = location.toLowerCase();
  
  // Grandes métropoles : recherche restreinte
  const majorCities = ['paris', 'lyon', 'marseille', 'toulouse', 'lille', 'bordeaux', 'nantes', 'strasbourg', 'montpellier'];
  if (majorCities.some(city => locationLower.includes(city))) {
    console.log('Grande metropole detectee - distance 10km');
    return '10';
  }
  
  // Villes moyennes : recherche élargie
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
  
  // Code INSEE direct
  const inseeMatch = location.match(/\b(\d{5})\b/);
  if (inseeMatch) {
    console.log('Code INSEE detecte:', inseeMatch[1]);
    return inseeMatch[1];
  }
  
  // Recherche par ville
  for (const [city, inseeCode] of Object.entries(communeMapping)) {
    if (locationLower.includes(city)) {
      console.log(`Ville "${city}" trouvee, code INSEE: ${inseeCode}`);
      return inseeCode;
    }
  }
  
  console.log('Ville non reconnue - Paris par defaut');
  return '75001';
}

function transformJobsForAssignme(jobs, candidateProfile) {
  // Filtrage géographique simple pour Paris
  let filteredJobs = jobs;
  if (candidateProfile.location?.toLowerCase().includes('paris')) {
    const idfDepartments = ['75', '77', '78', '91', '92', '93', '94', '95'];
    filteredJobs = jobs.filter(job => {
      const jobLocation = job.lieuTravail?.libelle || '';
      const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
      if (departmentMatch) {
        const jobDepartment = departmentMatch[1];
        return idfDepartments.includes(jobDepartment);
      }
      return true;
    });
    console.log(`Filtrage Paris: ${jobs.length} -> ${filteredJobs.length} offres`);
  }
  
  // Dédoublonnage simple
  const uniqueJobs = filteredJobs.filter((job, index, self) => 
    index === self.findIndex(j => 
      j.intitule === job.intitule && 
      j.entreprise?.nom === job.entreprise?.nom
    )
  );
  
  // Afficher toutes les offres filtrées
  const finalJobs = uniqueJobs;
  
  return finalJobs.map(job => {
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
  
  // Bonus formations techniques
  if (educationLevel.includes('electrotechnique') && (jobText.includes('electr') || jobText.includes('technicien'))) score += 25;
  if (currentPosition.includes('technicien') && jobText.includes('technicien')) score += 20;
  if (currentPosition.includes('maintenance') && jobText.includes('maintenance')) score += 25;
  
  // Bonus débutant
  if (job.experienceExige === 'D') score += 15;
  
  return Math.min(Math.max(score, 25), 95);
}

function generateMatchJustification(job, candidateProfile, score) {
  const reasons = [];
  
  if (score >= 80) reasons.push('Excellente correspondance avec votre profil');
  else if (score >= 60) reasons.push('Bonne correspondance avec vos competences');
  else reasons.push('Correspondance acceptable');
  
  if (job.experienceExige === 'D') reasons.push('Ouvert aux debutants');
  
  return reasons.join(' • ');
}

// Fonctions utilitaires
function formatLocation(lieuTravail) { return lieuTravail?.libelle || 'Lieu non specifie'; }
function formatContractType(typeContrat) { const c = { CDI: 'CDI', CDD: 'CDD', MIS: 'Mission interim' }; return c[typeContrat] || typeContrat || 'Type non specifie'; }
function formatExperience(experienceExige) { const e = { D: 'Debutant accepte', S: 'Experience souhaitee', E: 'Experience exigee' }; return e[experienceExige] || 'Non specifie'; }
function cleanDescription(description) { return description ? description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) + (description.length > 500 ? '...' : '') : 'Description non disponible'; }
function extractSalaryMin(salaireText) { if (!salaireText) return null; const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/); return match ? parseInt(match[1].replace(/\s/g, '')) : null; }
function extractSalaryMax(salaireText) { if (!salaireText) return null; const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/); return matches && matches.length >= 3 ? parseInt(matches[2].replace(/\s/g, '')) : null; }
function extractSkillsFromJob(job) { const skills = []; const text = `${job.intitule} ${job.description || ''}`.toLowerCase(); const common = ['maintenance','electricite','technicien','installation','depannage']; common.forEach(s => { if (text.includes(s)) skills.push(s.charAt(0).toUpperCase() + s.slice(1)); }); return skills.slice(0, 5); }

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
