// netlify/functions/france-travail-jobs.js
// Version avec analyse psychologique, dédoublonnage et DEBUG complet

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

    console.log('=== DEBUT FRANCE TRAVAIL JOBS ===');
    if (!CLIENT_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };

    console.log('=== PROFIL CANDIDAT RECU ===');
    console.log('Location:', candidateProfile.location);
    console.log('Education:', candidateProfile.education_level);
    console.log('Position:', candidateProfile.current_position);
    console.log('Aspirations:', candidateProfile.career_aspirations);
    console.log('Psychological profile:', candidateProfile.psychological_profile);

    // Authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.log('ERREUR AUTHENTIFICATION');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur authentification', fallback: true }) };
    }

    // Recherche des offres
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    if (!searchResults.success) {
      console.log('ERREUR RECHERCHE OFFRES');
      return { statusCode: 200, headers, body: JSON.stringify({ 
        success: false, error: searchResults.error, fallback: true, jobs: mockJobs(candidateProfile) 
      }) };
    }

    console.log(`=== RESULTATS BRUTS: ${searchResults.jobs.length} offres trouvees ===`);

    // Transformation des résultats avec logs détaillés
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);

    console.log(`=== RESULTATS FINAUX: ${transformedJobs.length} offres apres filtrage ===`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobs: transformedJobs,
        metadata: { 
          source: 'France Travail', 
          total_found: searchResults.total, 
          final_count: transformedJobs.length,
          timestamp: new Date().toISOString() 
        }
      })
    };

  } catch (error) {
    console.error('ERREUR FONCTION FRANCE TRAVAIL:', error);
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

    if (!response.ok) return { success: false, error: `Auth failed: ${response.status}` };
    const data = await response.json();
    if (!data.access_token) return { success: false, error: 'No token' };

    console.log('AUTH: Token obtenu avec succes');
    return { success: true, token: data.access_token };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function searchJobs(token, candidateProfile) {
  try {
    const keywords = buildKeywords(candidateProfile);
    const location = extractLocation(candidateProfile.location);
    
    console.log('=== PARAMETRES RECHERCHE ===');
    console.log('Mots-cles:', keywords);
    console.log('Code postal:', location);

    const searchParams = new URLSearchParams({
      motsCles: keywords || "emploi", 
      codePostal: location || '75001', 
      distance: getSearchDistance(candidateProfile.location),
      sort: '0', 
      range: '0-19'
    });

    if (candidateProfile.total_experience_years >= 5) searchParams.append('experience', '2');
    else if (candidateProfile.total_experience_years >= 2) searchParams.append('experience', '1');

    console.log('URL recherche:', `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`);

    const response = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'ASSIGNME/1.0' }
    });

    console.log('RECHERCHE: Statut reponse', response.status);
    if (!response.ok) return { success: false, error: `Search failed: ${response.status}` };

    const responseText = await response.text();
    if (!responseText.trim()) return { success: true, jobs: [], total: 0 };

    const data = JSON.parse(responseText);
    const jobCount = data.resultats?.length || 0;
    console.log(`RECHERCHE: ${jobCount} offres trouvees sur France Travail`);
    
    // Log des titres d'offres pour debug
    if (data.resultats && data.resultats.length > 0) {
      console.log('TITRES OFFRES:');
      data.resultats.slice(0, 5).forEach((job, i) => {
        console.log(`  ${i+1}. ${job.intitule} - ${job.lieuTravail?.libelle}`);
      });
    }

    return { success: true, jobs: data.resultats || [], total: jobCount };

  } catch (error) {
    console.error('ERREUR RECHERCHE:', error);
    return { success: false, error: error.message };
  }
}

function buildKeywords(candidateProfile) {
  const educationLevel = candidateProfile.education_level?.toLowerCase() || '';
  const currentPosition = candidateProfile.current_position?.toLowerCase() || '';
  const technicalSkills = (candidateProfile.technical_skills || []).join(' ').toLowerCase();
  const psychProfile = candidateProfile.psychological_profile?.toLowerCase() || '';
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  
  console.log('=== ANALYSE MOTS-CLES ===');
  console.log('Education:', educationLevel);
  console.log('Position:', currentPosition);
  console.log('Aspirations:', aspirations);
  console.log('Profil psy:', psychProfile);
  
  // PROFILS FAIBLES AVEC MOTIVATION FINANCIÈRE - PRIORITÉ ABSOLUE
  if ((educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') && 
      (aspirations.includes('fric') || aspirations.includes('argent') || psychProfile.includes('financière'))) {
    
    // Utiliser des termes larges qui donnent des résultats
    const broadKeywords = ['emploi', 'agent', 'ouvrier', 'manutention'];
    const keyword = broadKeywords[Math.floor(Math.random() * broadKeywords.length)];
    console.log('PROFIL MOTIVATION FINANCIÈRE + FAIBLE NIVEAU -> LARGE:', keyword);
    return keyword;
  }
  
  // PROFILS TECHNIQUES
  if (educationLevel.includes('electrotechnique') || educationLevel.includes('électrotechnique') || 
      currentPosition.includes('technicien') || currentPosition.includes('maintenance') ||
      technicalSkills.includes('maintenance') || technicalSkills.includes('dépannage')) {
    
    if (educationLevel.includes('electrotechnique') || technicalSkills.includes('installation')) {
      console.log('PROFIL ELECTROTECHNIQUE -> electricien');
      return 'electricien';
    } else if (currentPosition.includes('maintenance') || technicalSkills.includes('maintenance')) {
      console.log('PROFIL MAINTENANCE -> technicien');
      return 'technicien';
    }
  }
  
  // PROFILS CRÉATIFS/CULTURELS
  if (currentPosition.includes('communication') || technicalSkills.includes('création vidéo') || 
      technicalSkills.includes('coordination de projets') || aspirations.includes('culture')) {
    console.log('PROFIL CRÉATIF/CULTUREL -> communication');
    return 'communication';
  }
  
  // PROFILS SOCIAUX
  if (educationLevel.includes('service social') || educationLevel.includes('deass') || currentPosition.includes('social')) {
    console.log('PROFIL SOCIAL -> educateur');
    return 'educateur';
  }
  
  // PROFILS TERTIAIRES
  if (educationLevel.includes('comptab') || educationLevel.includes('gestion') || educationLevel.includes('finance')) {
    console.log('FORMATION COMPTABILITÉ -> comptable');
    return 'comptable';
  }
  
  if (educationLevel.includes('informatique') || educationLevel.includes('développ') || technicalSkills.includes('python')) {
    console.log('FORMATION INFORMATIQUE -> informatique');
    return 'informatique';
  }
  
  if (educationLevel.includes('commercial') || currentPosition.includes('commercial') || currentPosition.includes('adv')) {
    console.log('PROFIL COMMERCIAL -> commercial');
    return 'commercial';
  }
  
  if (educationLevel.includes('droit')) {
    console.log('FORMATION DROIT -> administratif');
    return 'administratif';
  }
  
  // Profil débutant générique - utiliser terme large
  if (candidateProfile.total_experience_years === 0 || educationLevel === 'aucune qualification' || currentPosition === 'sans emploi') {
    console.log('PROFIL DÉBUTANT -> emploi (terme large)');
    return 'emploi';
  }
  
  // Fallback 
  console.log('FALLBACK -> assistant');
  return 'assistant';
}

function getSearchDistance(location) {
  if (!location) return '10';
  
  const locationLower = location.toLowerCase();
  
  // Grandes métropoles : recherche restreinte
  const majorCities = ['paris', 'lyon', 'marseille', 'toulouse', 'lille', 'bordeaux', 'nantes', 'strasbourg', 'montpellier'];
  if (majorCities.some(city => locationLower.includes(city))) {
    console.log('DISTANCE: Grande metropole - 10km');
    return '10';
  }
  
  // Villes moyennes : recherche élargie
  const mediumCities = ['annecy', 'seynod', 'chambery', 'grenoble', 'clermont', 'saint-etienne', 'nancy', 'metz', 'dijon', 'besancon'];
  if (mediumCities.some(city => locationLower.includes(city))) {
    console.log('DISTANCE: Ville moyenne - 50km');
    return '50';
  }
  
  console.log('DISTANCE: Inconnue - 25km');
  return '25';
}

function extractLocation(location) {
  if (!location) return '75001';
  
  console.log('=== EXTRACTION LOCALISATION ===');
  console.log('Input:', location);
  const locationLower = location.toLowerCase().trim();
  
  // Code INSEE direct
  const inseeMatch = location.match(/\b(\d{5})\b/);
  if (inseeMatch) {
    console.log('CODE INSEE detecte:', inseeMatch[1]);
    return inseeMatch[1];
  }
  
  // Recherche par ville
  for (const [city, inseeCode] of Object.entries(communeMapping)) {
    if (locationLower.includes(city)) {
      console.log(`VILLE "${city}" trouvee -> INSEE: ${inseeCode}`);
      return inseeCode;
    }
  }
  
  console.log('VILLE NON RECONNUE -> Paris par defaut (75001)');
  return '75001';
}

function transformJobsForAssignme(jobs, candidateProfile) {
  console.log('=== TRANSFORMATION OFFRES ===');
  console.log(`Offres initiales: ${jobs.length}`);
  
  // 1. Filtrage géographique
  let filteredJobs = filterJobsByLocation(jobs, candidateProfile.location);
  console.log(`Après filtrage géographique: ${filteredJobs.length}`);
  
  // 2. Filtrage psychologique
  filteredJobs = filterJobsByPsychology(filteredJobs, candidateProfile);
  console.log(`Après filtrage psychologique: ${filteredJobs.length}`);
  
  // 3. Dédoublonnage
  filteredJobs = deduplicateJobs(filteredJobs);
  console.log(`Après dédoublonnage: ${filteredJobs.length}`);
  
  // 4. Limitation à 8 offres max
  const finalJobs = filteredJobs.slice(0, 8);
  console.log(`Après limitation: ${finalJobs.length}`);
  
  // 5. Transformation
  return finalJobs.map(job => {
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

function filterJobsByLocation(jobs, candidateLocation) {
  if (!jobs || jobs.length === 0) return [];
  
  console.log('=== FILTRAGE GÉOGRAPHIQUE ===');
  console.log(`Candidat localisation: ${candidateLocation}`);
  
  if (!candidateLocation) {
    console.log('Pas de localisation candidat - pas de filtrage');
    return jobs;
  }
  
  const locationLower = candidateLocation.toLowerCase();
  
  // Exclusions strictes universelles
  const excludedDepartments = ['20', '2A', '2B', '971', '972', '973', '974', '976', '975', '984', '986', '987', '988'];
  
  // Région Île-de-France élargie pour Paris
  const idfDepartments = ['75', '77', '78', '91', '92', '93', '94', '95'];
  
  let allowedDepartments = [];
  
  // Si Paris ou région parisienne
  if (locationLower.includes('paris') || locationLower.includes('pantin') || locationLower.includes('montreuil')) {
    allowedDepartments = idfDepartments;
    console.log('REGION PARISIENNE détectée - départements autorisés:', allowedDepartments);
  } else {
    console.log('Localisation non-parisienne - pas de filtrage strict');
    return jobs.filter(job => {
      const jobLocation = job.lieuTravail?.libelle || '';
      // Juste exclure DOM-TOM
      if (excludedDepartments.some(dept => jobLocation.includes(dept))) {
        console.log(`Offre exclue (DOM-TOM): ${jobLocation}`);
        return false;
      }
      return true;
    });
  }
  
  // Filtrage pour région parisienne
  const filteredJobs = jobs.filter(job => {
    const jobLocation = job.lieuTravail?.libelle || '';
    
    // Exclusions DOM-TOM/Corse
    if (excludedDepartments.some(dept => jobLocation.includes(dept)) || 
        jobLocation.toLowerCase().includes('corse')) {
      console.log(`Offre exclue (DOM-TOM/Corse): ${jobLocation}`);
      return false;
    }
    
    // Extraction département de l'offre
    const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
    if (departmentMatch) {
      const jobDepartment = departmentMatch[1];
      const isAllowed = allowedDepartments.includes(jobDepartment);
      
      if (!isAllowed) {
        console.log(`Offre filtrée (hors IDF): ${job.intitule} à ${jobLocation} (dept ${jobDepartment})`);
      } else {
        console.log(`Offre conservée: ${job.intitule} à ${jobLocation} (dept ${jobDepartment})`);
      }
      return isAllowed;
    }
    
    console.log(`Offre conservée (format lieu atypique): ${jobLocation}`);
    return true;
  });
  
  console.log(`FILTRAGE GEO: ${jobs.length} -> ${filteredJobs.length} offres`);
  return filteredJobs;
}

function filterJobsByPsychology(jobs, candidateProfile) {
  if (!jobs || jobs.length === 0) return [];
  
  console.log('=== FILTRAGE PSYCHOLOGIQUE ===');
  
  const psychProfile = candidateProfile.psychological_profile?.toLowerCase() || '';
  const aspirations = candidateProfile.career_aspirations?.toLowerCase() || '';
  const supervisionNeeds = candidateProfile.supervision_needs || '';
  const educationLevel = candidateProfile.education_level || '';
  
  console.log('Profil psychologique:', psychProfile);
  console.log('Aspirations:', aspirations);
  console.log('Niveau éducation:', educationLevel);
  
  // Pour Mohammed (motivation financière + aucune qualification)
  if ((aspirations.includes('fric') || aspirations.includes('argent')) && 
      educationLevel === 'aucune qualification') {
    
    console.log('PROFIL MOHAMMED détecté: pas de filtrage psychologique strict');
    // Pour ce profil, on garde TOUTES les offres (y compris manutention, agent, etc.)
    console.log(`FILTRAGE PSY: ${jobs.length} -> ${jobs.length} offres (aucun filtrage)`);
    return jobs;
  }
  
  // Métiers interdits pour autres profils
  const incompatibleJobs = [];
  
  // Si besoin encadrement strict
  if (supervisionNeeds === 'encadrement_strict') {
    incompatibleJobs.push('responsable', 'manager', 'chef', 'coordinateur');
    console.log('Encadrement strict - exclusion postes autonomes');
  }
  
  // Si problèmes relationnels
  if (psychProfile.includes('peu relationnel') || psychProfile.includes('introverti')) {
    incompatibleJobs.push('accueil', 'commercial', 'vente', 'relation client');
    console.log('Profil peu relationnel - exclusion métiers contact');
  }
  
  if (incompatibleJobs.length === 0) {
    console.log(`FILTRAGE PSY: ${jobs.length} -> ${jobs.length} offres (aucun filtrage nécessaire)`);
    return jobs;
  }
  
  const filteredJobs = jobs.filter(job => {
    const jobTitle = job.intitule?.toLowerCase() || '';
    const jobDescription = job.description?.toLowerCase() || '';
    const jobText = `${jobTitle} ${jobDescription}`;
    
    const isIncompatible = incompatibleJobs.some(excluded => jobText.includes(excluded));
    
    if (isIncompatible) {
      console.log(`Offre filtrée (incompatible): ${job.intitule}`);
      return false;
    }
    
    return true;
  });
  
  console.log(`FILTRAGE PSY: ${jobs.length} -> ${filteredJobs.length} offres`);
  return filteredJobs;
}

function deduplicateJobs(jobs) {
  if (!jobs || jobs.length === 0) return [];
  
  const uniqueJobs = jobs.filter((job, index, self) => 
    index === self.findIndex(j => 
      j.intitule === job.intitule && 
      j.entreprise?.nom === job.entreprise?.nom &&
      j.lieuTravail?.libelle === job.lieuTravail?.libelle
    )
  );
  
  if (jobs.length !== uniqueJobs.length) {
    console.log(`DEDOUBLONNAGE: ${jobs.length} -> ${uniqueJobs.length} offres uniques`);
  }
  
  return uniqueJobs;
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
  
  // Bonus formations tertiaires
  if (educationLevel.includes('service social') && (jobText.includes('social') || jobText.includes('education'))) score += 25;
  if (educationLevel.includes('comptab') && jobText.includes('comptab')) score += 20;
  
  // Correspondance d'expérience
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

// Fonctions utilitaires
function formatLocation(lieuTravail) { return lieuTravail?.libelle || 'Lieu non specifie'; }
function formatContractType(typeContrat) { 
  const contracts = { CDI: 'CDI', CDD: 'CDD', MIS: 'Mission interim' }; 
  return contracts[typeContrat] || typeContrat || 'Type non specifie'; 
}
function formatExperience(experienceExige) { 
  const experiences = { D: 'Debutant accepte', S: 'Experience souhaitee', E: 'Experience exigee' }; 
  return experiences[experienceExige] || 'Non specifie'; 
}
function cleanDescription(description) { 
  return description ? description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) + (description.length > 500 ? '...' : '') : 'Description non disponible'; 
}
function extractSalaryMin(salaireText) { 
  if (!salaireText) return null; 
  const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/); 
  return match ? parseInt(match[1].replace(/\s/g, '')) : null; 
}
function extractSalaryMax(salaireText) { 
  if (!salaireText) return null; 
  const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/); 
  return matches && matches.length >= 3 ? parseInt(matches[2].replace(/\s/g, '')) : null; 
}
function extractSkillsFromJob(job) { 
  const skills = []; 
  const text = `${job.intitule} ${job.description || ''}`.toLowerCase(); 
  const commonSkills = ['maintenance','electricite','technicien','installation','depannage','social','education','comptabilite'];
  commonSkills.forEach(skill => { 
    if (text.includes(skill)) skills.push(skill.charAt(0).toUpperCase() + skill.slice(1)); 
  }); 
  return skills.slice(0, 5); 
}

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
      salary_min: isElectrotechnique ? 30000 : 25000, 
      salary_max: isElectrotechnique ? 35000 : 30000,
      experience_required: "Experience souhaitee", 
      qualification_required: isElectrotechnique ? "Bac Pro Electrotechnique" : "Bac",
      date_creation: new Date().toISOString(), 
      match_score: 65,
      match_justification: "Fallback adapte au profil", 
      france_travail_url: "#",
      required_skills: isElectrotechnique ? ["Maintenance", "Electricite"] : ["Communication", "Gestion"],
      company_types: ["Standard"], 
      evolution_potential: "Evolution possible"
    }
  ];
}
