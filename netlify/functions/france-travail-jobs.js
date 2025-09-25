// netlify/functions/france-travail-jobs.js
// Fonction pour récupérer les vraies offres d'emploi de France Travail

exports.handler = async (event, context) => {
  // Configuration CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Gestion de la requête OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Configuration API France Travail
    const CLIENT_ID = 'PAR_assignme_706e20eb9f90ae0ed2dfd8e9feec3048f8612e02f616083c21c028a9f8a769f8';
    const CLIENT_SECRET = process.env.FRANCE_TRAVAIL_SECRET; // Votre nouvelle clé sécurisée
    
    if (!CLIENT_SECRET) {
      console.error('FRANCE_TRAVAIL_SECRET manquant');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Configuration API France Travail manquante',
          fallback: true
        })
      };
    }

    // Parse du body de la requête
    const { candidateProfile } = JSON.parse(event.body || '{}');
    
    if (!candidateProfile) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Profil candidat requis' })
      };
    }

    // Étape 1: Obtenir le token d'authentification
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    
    if (!tokenResponse.success) {
      console.error('Erreur token:', tokenResponse.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Erreur authentification France Travail',
          fallback: true
        })
      };
    }

    // Étape 2: Rechercher les offres d'emploi
    const searchResults = await searchJobs(tokenResponse.token, candidateProfile);
    
    if (!searchResults.success) {
      console.error('Erreur recherche:', searchResults.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Erreur recherche France Travail',
          fallback: true
        })
      };
    }

    // Étape 3: Transformer les résultats pour ASSIGNME
    const transformedJobs = transformJobsForAssignme(searchResults.jobs, candidateProfile);

    // Retourner les offres réelles
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
        fallback: true,
        details: error.message
      })
    };
  }
};

// Fonction pour obtenir le token d'accès France Travail
async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': clientId,
      'client_secret': clientSecret,
      'scope': 'api_offresdemploiv2 o2dsoffre'
    });

    const response = await fetch('https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        error: `Authentification échouée: ${response.status} - ${errorData}`
      };
    }

    const data = await response.json();
    
    if (!data.access_token) {
      return {
        success: false,
        error: 'Token d\'accès non reçu'
      };
    }

    return {
      success: true,
      token: data.access_token
    };

  } catch (error) {
    return {
      success: false,
      error: `Erreur réseau authentification: ${error.message}`
    };
  }
}

// Fonction pour rechercher des offres d'emploi
async function searchJobs(token, candidateProfile) {
  try {
    // Construction de la requête de recherche basée sur le profil
    const searchParams = new URLSearchParams({
      motsCles: buildKeywords(candidateProfile),
      commune: extractLocation(candidateProfile.location) || '75001', // Paris par défaut
      distance: '50', // 50km de rayon
      sort: '0', // Tri par pertinence
      range: '0-19' // 20 premiers résultats
    });

    // Ajout de filtres basés sur le profil
    if (candidateProfile.total_experience_years >= 5) {
      searchParams.append('experience', '2'); // Expérimenté
    } else if (candidateProfile.total_experience_years >= 2) {
      searchParams.append('experience', '1'); // Débutant accepté
    }

    const response = await fetch(`https://api.pole-emploi.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        error: `Recherche échouée: ${response.status} - ${errorData}`
      };
    }

    const data = await response.json();
    
    return {
      success: true,
      jobs: data.resultats || [],
      total: data.resultats?.length || 0,
      query: searchParams.toString()
    };

  } catch (error) {
    return {
      success: false,
      error: `Erreur réseau recherche: ${error.message}`
    };
  }
}

// Construction des mots-clés de recherche basés sur le profil
function buildKeywords(candidateProfile) {
  const keywords = [];
  
  // Compétences techniques prioritaires
  if (candidateProfile.technical_skills && candidateProfile.technical_skills.length > 0) {
    keywords.push(...candidateProfile.technical_skills.slice(0, 3));
  }
  
  // Poste actuel ou aspirations
  if (candidateProfile.current_position && candidateProfile.current_position !== 'Sans emploi') {
    keywords.push(candidateProfile.current_position);
  }
  
  if (candidateProfile.career_aspirations) {
    keywords.push(candidateProfile.career_aspirations);
  }
  
  // Secteurs d'activité
  if (candidateProfile.key_sectors && candidateProfile.key_sectors.length > 0) {
    keywords.push(...candidateProfile.key_sectors.slice(0, 2));
  }
  
  // Retourne les 5 premiers mots-clés les plus pertinents
  return keywords.slice(0, 5).join(' ');
}

// Extraction de la localisation (code postal ou ville)
function extractLocation(location) {
  if (!location) return null;
  
  // Correspondance des villes principales avec codes postaux
  const cityToPostal = {
    'paris': '75001',
    'lyon': '69001',
    'marseille': '13001',
    'toulouse': '31000',
    'lille': '59000',
    'bordeaux': '33000',
    'nantes': '44000',
    'strasbourg': '67000',
    'montpellier': '34000',
    'rennes': '35000'
  };
  
  const locationLower = location.toLowerCase();
  
  // Recherche directe du code postal
  const postalMatch = location.match(/\b(\d{5})\b/);
  if (postalMatch) {
    return postalMatch[1];
  }
  
  // Recherche par nom de ville
  for (const [city, postal] of Object.entries(cityToPostal)) {
    if (locationLower.includes(city)) {
      return postal;
    }
  }
  
  return '75001'; // Paris par défaut
}

// Transformation des offres France Travail pour le format ASSIGNME
function transformJobsForAssignme(jobs, candidateProfile) {
  return jobs.map(job => {
    const matchScore = calculateMatchScore(job, candidateProfile);
    
    return {
      // ID et métadonnées
      id: job.id,
      source: 'France Travail',
      is_real_offer: true,
      
      // Informations principales
      job_title: job.intitule || 'Poste non spécifié',
      company: job.entreprise?.nom || 'Entreprise non communiquée',
      location: formatLocation(job.lieuTravail),
      
      // Détails du poste
      description: cleanDescription(job.description),
      contract_type: formatContractType(job.typeContrat),
      sector: job.secteurActivite || 'Secteur non spécifié',
      
      // Rémunération
      salary_display: job.salaire?.libelle || 'Salaire non communiqué',
      salary_min: extractSalaryMin(job.salaire?.libelle),
      salary_max: extractSalaryMax(job.salaire?.libelle),
      
      // Exigences
      experience_required: formatExperience(job.experienceExige),
      qualification_required: job.qualificationLibelle || 'Non spécifié',
      
      // Informations temporelles
      date_creation: job.dateCreation,
      date_actualisation: job.dateActualisation,
      
      // Matching ASSIGNME
      match_score: matchScore,
      match_justification: generateMatchJustification(job, candidateProfile, matchScore),
      
      // Liens
      france_travail_url: `https://candidat.pole-emploi.fr/offres/recherche/detail/${job.id}`,
      
      // Champs compatibles ASSIGNME
      required_skills: extractSkillsFromJob(job),
      company_types: [job.entreprise?.adaptee ? 'Entreprise adaptée' : 'Standard'],
      evolution_potential: 'À définir avec l\'employeur'
    };
  });
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
    score += 15; // Débutant accepté
  } else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) {
    score += 15; // Expérience souhaité
  } else if (job.experienceExige === 'E' && candidateProfile.total_experience_years >= 5) {
    score += 15; // Expérience exigée
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
  
  // Correspondance géographique (bonus si même région)
  if (candidateProfile.location && job.lieuTravail?.libelle) {
    const candidateLocation = candidateProfile.location.toLowerCase();
    const jobLocation = job.lieuTravail.libelle.toLowerCase();
    
    if (jobLocation.includes(candidateLocation) || candidateLocation.includes(jobLocation)) {
      score += 8;
    }
  }
  
  return Math.min(Math.max(score, 25), 95); // Entre 25 et 95%
}

// Génération de la justification du match
function generateMatchJustification(job, candidateProfile, score) {
  const reasons = [];
  
  if (score >= 80) {
    reasons.push('Excellente correspondance avec votre profil');
  } else if (score >= 60) {
    reasons.push('Bonne correspondance avec vos compétences');
  } else if (score >= 40) {
    reasons.push('Correspondance acceptable');
  }
  
  // Analyse des compétences
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  if (candidateProfile.technical_skills) {
    const matchingSkills = candidateProfile.technical_skills.filter(skill =>
      jobText.includes(skill.toLowerCase())
    );
    
    if (matchingSkills.length > 0) {
      reasons.push(`Compétences en commun: ${matchingSkills.slice(0, 3).join(', ')}`);
    }
  }
  
  // Analyse de l'expérience
  if (job.experienceExige === 'D') {
    reasons.push('Ouvert aux débutants');
  } else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) {
    reasons.push('Expérience compatible');
  }
  
  return reasons.length > 0 ? reasons.join(' • ') : 'Offre à étudier selon vos critères';
}

// Fonctions utilitaires pour le formatage
function formatLocation(lieuTravail) {
  if (!lieuTravail) return 'Lieu non spécifié';
  return lieuTravail.libelle || 'Lieu non spécifié';
}

function formatContractType(typeContrat) {
  const contractTypes = {
    'CDI': 'CDI',
    'CDD': 'CDD',
    'MIS': 'Mission intérim',
    'SAI': 'Saisonnier',
    'IND': 'Indépendant'
  };
  
  return contractTypes[typeContrat] || typeContrat || 'Type non spécifié';
}

function formatExperience(experienceExige) {
  const experienceLabels = {
    'D': 'Débutant accepté',
    'S': 'Expérience souhaitée',
    'E': 'Expérience exigée'
  };
  
  return experienceLabels[experienceExige] || 'Non spécifié';
}

function cleanDescription(description) {
  if (!description) return 'Description non disponible';
  
  // Nettoyage basique du HTML et formatage
  return description
    .replace(/<[^>]*>/g, '') // Supprime HTML
    .replace(/\s+/g, ' ') // Normalise les espaces
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
  
  // Cherche deux montants (fourchette)
  const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/);
  if (matches && matches.length >= 3) {
    return parseInt(matches[2].replace(/\s/g, ''));
  }
  
  // Sinon retourne le montant unique
  return extractSalaryMin(salaireText);
}

function extractSkillsFromJob(job) {
  const skills = [];
  const text = `${job.intitule} ${job.description || ''}`.toLowerCase();
  
  // Liste des compétences courantes à détecter
  const commonSkills = [
    'excel', 'word', 'powerpoint', 'office',
    'javascript', 'python', 'java', 'php', 'sql',
    'marketing', 'communication', 'vente', 'commerce',
    'gestion', 'comptabilité', 'finance',
    'anglais', 'allemand', 'espagnol'
  ];
  
  commonSkills.forEach(skill => {
    if (text.includes(skill)) {
      skills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  });
  
  return skills.slice(0, 5); // Max 5 compétences
}
