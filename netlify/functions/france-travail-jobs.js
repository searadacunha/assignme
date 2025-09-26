// netlify/functions/france-travail-jobs.js
// Fonction corrigée avec codes INSEE et logs détaillés

// Mapping des villes vers codes INSEE (intégré directement)
const communeMapping = {
  "paris": "75001",
  "paris 1": "75101",
  "paris 2": "75102",
  "paris 3": "75103",
  "paris 4": "75104",
  "paris 5": "75105",
  "paris 6": "75106",
  "paris 7": "75107",
  "paris 8": "75108",
  "paris 9": "75109",
  "paris 10": "75110",
  "paris 11": "75111",
  "paris 12": "75112",
  "paris 13": "75113",
  "paris 14": "75114",
  "paris 15": "75115",
  "paris 16": "75116",
  "paris 17": "75117",
  "paris 18": "75118",
  "paris 19": "75119",
  "paris 20": "75120",
  "lyon": "69381",
  "marseille": "13055",
  "toulouse": "31555",
  "lille": "59350",
  "bordeaux": "33063",
  "nantes": "44109",
  "strasbourg": "67482",
  "montpellier": "34172",
  "rennes": "35238",
  "nice": "06088",
  "toulon": "83137",
  "grenoble": "38185",
  "dijon": "21231",
  "angers": "49007",
  "le havre": "76351",
  "reims": "51454",
  "clermont-ferrand": "63113",
  "saint-etienne": "42218",
  "metz": "57463",
  "rouen": "76540",
  "perpignan": "66136",
  "amiens": "80021",
  "caen": "14118",
  "nancy": "54395",
  "orleans": "45234",
  "avignon": "84007",
  "pau": "64445",
  "tourcoing": "59599",
  "villeurbanne": "69266",
  "versailles": "78646",
  "cannes": "06029",
  "antibes": "06004",
  "colmar": "68066",
  "mulhouse": "68224",
  "poitiers": "86194",
  "limoges": "87085",
  "troyes": "10387",
  "chartres": "28085",
  "blois": "41018",
  "saint-denis": "93066",
  "argenteuil": "95018",
  "courbevoie": "92026",
  "nanterre": "92050",
  "boulogne-billancourt": "92012",
  "montreuil": "93048",
  "asnieres-sur-seine": "92004",
  "colombes": "92025",
  "aix-en-provence": "13001"
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
    console.log('CLIENT_ID:', CLIENT_ID);
    console.log('CLIENT_SECRET present:', !!CLIENT_SECRET);
    console.log('CLIENT_SECRET length:', CLIENT_SECRET ? CLIENT_SECRET.length : 0);

    if (!CLIENT_SECRET) {
      console.error('FRANCE_TRAVAIL_SECRET manquant');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };
    }

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };
    }

    console.log('Profil candidat recu:', JSON.stringify(candidateProfile, null, 2));

    // Étape 1: Authentification
    console.log('--- ETAPE 1: AUTHENTIFICATION ---');
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    
    if (!tokenResponse.success) {
      console.error('Erreur authentification:', tokenResponse.error);
      return { 
        statusCode: 500, 
        headers, 
        body: JSON.stringify({ 
          error: 'Erreur authentification France Travail', 
          details: tokenResponse.error, 
          fallback: true 
        }) 
      };
    }

    console.log('Authentification reussie!');

    // Étape 2: Recherche des offres
    console.log('--- ETAPE 2: RECHERCHE OFFRES ---');
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    
    if (!searchResults.success) {
      console.error('Erreur recherche:', searchResults.error);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: searchResults.error,
          raw: searchResults.raw || null,
          fallback: true,
          jobs: mockJobs(candidateProfile)
        })
      };
    }

    console.log(`${searchResults.jobs.length} offres trouvees!`);

    // Étape 3: Transformation des résultats
    console.log('--- ETAPE 3: TRANSFORMATION ---');
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);
    console.log('Jobs transformes:', transformedJobs.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobs: transformedJobs,
        metadata: {
          source: 'France Travail',
          total_found: searchResults.total,
          query_used: searchResults.query,
          timestamp: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction France Travail:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        error: 'Erreur interne', 
        details: error.message, 
        fallback: true, 
        jobs: mockJobs({}) 
      }) 
    };
  }
};

// Fonction d'authentification
async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_offresdemploiv2 o2dsoffre'
    });

    console.log('Parametres auth:', params.toString());
    console.log('URL auth: https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire');

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    console.log('Statut reponse auth:', response.status);
    console.log('Headers reponse auth:', JSON.stringify([...response.headers.entries()]));

    const responseText = await response.text();
    console.log('Reponse auth brute:', responseText);

    if (!response.ok) {
      return { 
        success: false, 
        error: `Authentification echouee: ${response.status} - ${responseText}` 
      };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return { 
        success: false, 
        error: `Reponse auth non JSON: ${parseError.message} - ${responseText}` 
      };
    }

    if (!data.access_token) {
      return { 
        success: false, 
        error: `Token absent dans reponse: ${JSON.stringify(data)}` 
      };
    }

    console.log('Token recu (debut):', data.access_token.substring(0, 20) + '...');
    console.log('Token type:', data.token_type);
    console.log('Expires in:', data.expires_in);

    return { 
      success: true, 
      token: data.access_token 
    };

  } catch (error) {
    console.error('Exception auth:', error);
    return { 
      success: false, 
      error: `Erreur reseau authentification: ${error.message}` 
    };
  }
}

// Fonction de recherche d'offres
async function searchJobs(token, candidateProfile) {
  try {
    const keywords = buildKeywords(candidateProfile);
    const location = extractLocation(candidateProfile.location);
    
    console.log('Mots-cles construits:', keywords);
    console.log('Localisation extraite:', location);

    const searchParams = new URLSearchParams({
      motsCles: keywords || "agent",
      codePostal: location || '75001', // Utiliser codePostal au lieu de commune
      distance: '10', // Réduire à 10km au lieu de 50km
      sort: '0',
      range: '0-19'
    });

    // Filtre d'expérience
    if (candidateProfile.total_experience_years >= 5) {
      searchParams.append('experience', '2'); // Expérimenté
      console.log('Filtre experience: Experimente (2)');
    } else if (candidateProfile.total_experience_years >= 2) {
      searchParams.append('experience', '1'); // Débutant accepté
      console.log('Filtre experience: Debutant accepte (1)');
    } else {
      console.log('Pas de filtre experience (tous niveaux)');
    }

    const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`;
    console.log('URL complete API:', url);

    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'ASSIGNME/1.0'
      }
    });

    console.log('Statut reponse recherche:', response.status);
    console.log('Headers reponse recherche:', JSON.stringify([...response.headers.entries()]));

    const responseText = await response.text();
    console.log('Reponse recherche brute (premiers 500 chars):', responseText.substring(0, 500));

    if (!response.ok) {
      return { 
        success: false, 
        error: `Recherche echouee: ${response.status} - ${responseText}`, 
        raw: responseText 
      };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return { 
        success: false, 
        error: `Reponse recherche non JSON: ${parseError.message}`, 
        raw: responseText 
      };
    }

    console.log('Structure reponse:', Object.keys(data));
    console.log('Nombre resultats:', data.resultats ? data.resultats.length : 0);

    if (data.resultats && data.resultats.length > 0) {
      console.log('Premier resultat:', JSON.stringify(data.resultats[0], null, 2));
    }

    return { 
      success: true, 
      jobs: data.resultats || [], 
      total: data.resultats?.length || 0, 
      query: searchParams.toString() 
    };

  } catch (error) {
    console.error('Exception recherche:', error);
    return { 
      success: false, 
      error: `Erreur reseau recherche: ${error.message}` 
    };
  }
}

// Construction des mots-clés
function buildKeywords(candidateProfile) {
  // Mots-clés pour profils sans qualification/expérience
  const entryLevelKeywords = [
    'agent',
    'employe', 
    'accueil',
    'vente',
    'magasin',
    'caissier',
    'preparateur',
    'manutention',
    'nettoyage',
    'restauration',
    'livraison'
  ];
  
  // Mots-clés techniques pour profils qualifiés
  const technicalKeywords = [
    'developpeur',
    'informatique',
    'comptable',
    'commercial',
    'marketing',
    'secretaire'
  ];
  
  let selectedKeyword;
  
  // Si profil sans expérience OU sans qualification, utiliser mots-clés accessibles
  if (candidateProfile.total_experience_years === 0 || 
      candidateProfile.education_level === 'Aucune qualification' ||
      candidateProfile.current_position === 'Sans emploi') {
    
    selectedKeyword = entryLevelKeywords[Math.floor(Math.random() * entryLevelKeywords.length)];
    console.log('Profil debutant detecte, mot-cle generique utilise');
    
  } else if (candidateProfile.technical_skills?.length) {
    // Pour profils techniques expérimentés
    const cleanSkills = candidateProfile.technical_skills
      .filter(skill => !skill.toLowerCase().includes('français') && 
                      !skill.toLowerCase().includes('darija') &&
                      !skill.toLowerCase().includes('anglais'))
      .slice(0, 1);
    
    if (cleanSkills.length > 0) {
      selectedKeyword = cleanSkills[0];
    } else {
      selectedKeyword = technicalKeywords[Math.floor(Math.random() * technicalKeywords.length)];
    }
    
  } else {
    // Fallback générique
    selectedKeyword = entryLevelKeywords[0]; // 'agent'
  }
  
  console.log('Mots-cles generes:', selectedKeyword);
  return selectedKeyword;
}

// Extraction de localisation avec codes INSEE
function extractLocation(location) {
  if (!location) {
    console.log('Pas de localisation fournie, utilisation Paris par defaut');
    return '75001';
  }
  
  console.log('Localisation a analyser:', location);
  
  const locationLower = location.toLowerCase().trim();
  
  // Recherche directe du code INSEE (5 chiffres)
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
  return '75001'; // Paris 1er arrondissement par défaut
}

// Transformation des offres pour ASSIGNME
function transformJobsForAssignme(jobs, candidateProfile) {
  // Filtrer les offres par localisation avant transformation
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

// Nouvelle fonction de filtrage par localisation
function filterJobsByLocation(jobs, candidateLocation) {
  if (!candidateLocation) return jobs;
  
  const locationLower = candidateLocation.toLowerCase();
  
  // Départements de la région parisienne
  const parisianDepartments = ['75', '77', '78', '91', '92', '93', '94', '95'];
  
  // Départements des grandes villes françaises
  const majorCityDepartments = {
    'lyon': ['69'],
    'marseille': ['13'],
    'toulouse': ['31'],
    'lille': ['59'],
    'bordeaux': ['33'],
    'nantes': ['44'],
    'strasbourg': ['67'],
    'montpellier': ['34'],
    'rennes': ['35'],
    'nice': ['06']
  };
  
  let allowedDepartments = [];
  
  // Si candidat parisien, ne garder que la région parisienne
  if (locationLower.includes('paris')) {
    allowedDepartments = parisianDepartments;
    console.log('Filtrage pour candidat parisien - departements autorises:', allowedDepartments);
  } else {
    // Pour autres villes, chercher le département correspondant
    for (const [city, departments] of Object.entries(majorCityDepartments)) {
      if (locationLower.includes(city)) {
        allowedDepartments = departments;
        console.log(`Filtrage pour candidat ${city} - departements autorises:`, allowedDepartments);
        break;
      }
    }
  }
  
  // Si pas de filtrage spécifique, garder toutes les offres
  if (allowedDepartments.length === 0) {
    console.log('Pas de filtrage geographique applique');
    return jobs;
  }
  
  // Filtrer les offres selon les départements autorisés
  const filteredJobs = jobs.filter(job => {
    const jobLocation = job.lieuTravail?.libelle || '';
    const departmentMatch = jobLocation.match(/^(\d{2})\s*-/);
    
    if (departmentMatch) {
      const jobDepartment = departmentMatch[1];
      const isAllowed = allowedDepartments.includes(jobDepartment);
      
      if (!isAllowed) {
        console.log(`Offre filtrée - ${job.intitule} à ${jobLocation} (dept ${jobDepartment} non autorisé)`);
      }
      
      return isAllowed;
    }
    
    // Garder les offres sans département détectable
    return true;
  });
  
  console.log(`Filtrage terminé: ${jobs.length} offres initiales -> ${filteredJobs.length} offres conservées`);
  return filteredJobs;
}

// Calcul du score de correspondance
function calculateMatchScore(job, candidateProfile) {
  let score = 40; // Score de base
  
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  
  // Correspondance des compétences techniques
  if (candidateProfile.technical_skills) {
    const matchingSkills = candidateProfile.technical_skills.filter(skill =>
      jobText.includes(skill.toLowerCase())
    );
    score += Math.min(matchingSkills.length * 8, 32); // Max 32 points
  }
  
  // Correspondance d'expérience
  if (job.experienceExige === 'D' && candidateProfile.total_experience_years >= 0) {
    score += 15;
  } else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) {
    score += 15;
  } else if (job.experienceExige === 'E' && candidateProfile.total_experience_years >= 5) {
    score += 15;
  }
  
  // Correspondance de secteur
  if (candidateProfile.key_sectors) {
    const hasMatchingSector = candidateProfile.key_sectors.some(sector =>
      job.secteurActivite?.toLowerCase().includes(sector.toLowerCase())
    );
    if (hasMatchingSector) {
      score += 10;
    }
  }
  
  // Correspondance géographique
  if (candidateProfile.location && job.lieuTravail?.libelle) {
    const candidateLocation = candidateProfile.location.toLowerCase();
    const jobLocation = job.lieuTravail.libelle.toLowerCase();
    
    if (jobLocation.includes(candidateLocation) || candidateLocation.includes(jobLocation)) {
      score += 8;
    }
  }
  
  return Math.min(Math.max(score, 25), 95);
}

// Génération de justification du match
function generateMatchJustification(job, candidateProfile, score) {
  const reasons = [];
  
  if (score >= 80) {
    reasons.push('Excellente correspondance avec votre profil');
  } else if (score >= 60) {
    reasons.push('Bonne correspondance avec vos competences');
  } else if (score >= 40) {
    reasons.push('Correspondance acceptable');
  }
  
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  if (candidateProfile.technical_skills) {
    const matchingSkills = candidateProfile.technical_skills.filter(skill =>
      jobText.includes(skill.toLowerCase())
    );
    
    if (matchingSkills.length > 0) {
      reasons.push(`Competences en commun: ${matchingSkills.slice(0, 3).join(', ')}`);
    }
  }
  
  if (job.experienceExige === 'D') {
    reasons.push('Ouvert aux debutants');
  } else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) {
    reasons.push('Experience compatible');
  }
  
  return reasons.length > 0 ? reasons.join(' • ') : 'Offre a etudier selon vos criteres';
}

// Fonctions de formatage
function formatLocation(lieuTravail) {
  if (!lieuTravail) return 'Lieu non specifie';
  return lieuTravail.libelle || 'Lieu non specifie';
}

function formatContractType(typeContrat) {
  const contractTypes = {
    'CDI': 'CDI',
    'CDD': 'CDD',
    'MIS': 'Mission interim',
    'SAI': 'Saisonnier',
    'IND': 'Independant'
  };
  
  return contractTypes[typeContrat] || typeContrat || 'Type non specifie';
}

function formatExperience(experienceExige) {
  const experienceLabels = {
    'D': 'Debutant accepte',
    'S': 'Experience souhaitee',
    'E': 'Experience exigee'
  };
  
  return experienceLabels[experienceExige] || 'Non specifie';
}

function cleanDescription(description) {
  if (!description) return 'Description non disponible';
  
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500) + (description.length > 500 ? '...' : '');
}

function extractSalaryMin(salaireText) {
  if (!salaireText) return null;
  
  const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/);
  if (match) {
    return parseInt(match[1].replace(/\s/g, ''));
  }
  
  return null;
}

function extractSalaryMax(salaireText) {
  if (!salaireText) return null;
  
  const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/);
  if (matches && matches.length >= 3) {
    return parseInt(matches[2].replace(/\s/g, ''));
  }
  
  return extractSalaryMin(salaireText);
}

function extractSkillsFromJob(job) {
  const skills = [];
  const text = `${job.intitule} ${job.description || ''}`.toLowerCase();
  
  const commonSkills = [
    'excel', 'word', 'powerpoint', 'office',
    'javascript', 'python', 'java', 'php', 'sql',
    'marketing', 'communication', 'vente', 'commerce',
    'gestion', 'comptabilite', 'finance',
    'anglais', 'allemand', 'espagnol'
  ];
  
  commonSkills.forEach(skill => {
    if (text.includes(skill)) {
      skills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  });
  
  return skills.slice(0, 5);
}

// Jobs de fallback en cas d'échec
function mockJobs(candidateProfile) {
  return [
    {
      id: "fallback-1",
      source: "Mock",
      is_real_offer: false,
      job_title: "Developpeur Fullstack (exemple)",
      company: "Startup Innovante",
      location: "Paris (75001)",
      description: "Exemple d'offre utilisee en fallback quand France Travail est indisponible. Développement d'applications web modernes avec React et Node.js.",
      contract_type: "CDI",
      sector: "Informatique",
      salary_display: "40k-50k €",
      salary_min: 40000,
      salary_max: 50000,
      experience_required: "2 ans",
      qualification_required: "Bac+3 minimum",
      date_creation: new Date().toISOString(),
      date_actualisation: new Date().toISOString(),
      match_score: 70,
      match_justification: "Fallback automatique - France Travail indisponible",
      france_travail_url: "#",
      required_skills: ["JavaScript", "Node.js", "React"],
      company_types: ["Standard"],
      evolution_potential: "Rapide evolution possible"
    },
    {
      id: "fallback-2",
      source: "Mock",
      is_real_offer: false,
      job_title: "Assistant Commercial (exemple)",
      company: "PME Dynamique",
      location: candidateProfile.location || "Lyon (69001)",
      description: "Poste polyvalent en entreprise. Gestion clientèle, prospection, suivi commercial. Formation interne possible.",
      contract_type: "CDI",
      sector: "Commerce",
      salary_display: "28k-35k €",
      salary_min: 28000,
      salary_max: 35000,
      experience_required: "Debutant accepte",
      qualification_required: "Bac minimum",
      date_creation: new Date().toISOString(),
      date_actualisation: new Date().toISOString(),
      match_score: 60,
      match_justification: "Fallback automatique - Poste accessible tous profils",
      france_travail_url: "#",
      required_skills: ["Communication", "Vente", "Office"],
      company_types: ["Standard"],
      evolution_potential: "Evolution vers responsable commercial"
    }
  ];
}
