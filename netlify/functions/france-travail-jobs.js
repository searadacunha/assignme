// netlify/functions/france-travail-jobs.js
// Fonction Netlify pour récupérer les vraies offres d'emploi France Travail

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

    if (!CLIENT_SECRET) {
      console.error('FRANCE_TRAVAIL_SECRET manquant');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Secret API manquant', fallback: true }) };
    }

    const { candidateProfile } = JSON.parse(event.body || '{}');
    if (!candidateProfile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Profil candidat requis' }) };
    }

    // Étape 1: Auth
    const tokenResponse = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!tokenResponse.success) {
      console.error('Erreur token:', tokenResponse.error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur authentification France Travail', details: tokenResponse.error, fallback: true }) };
    }

    // Étape 2: Recherche
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

    // Étape 3: Transformation
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
          query_used: searchResults.query,
          timestamp: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Erreur fonction France Travail:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur interne', details: error.message, fallback: true, jobs: mockJobs({}) }) };
  }
};

// ---- Authentification ----
async function getAccessToken(clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api_offresdemploiv2 o2dsoffre' // ✅ scope corrigé
    });

    const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: `Authentification échouée: ${response.status} - ${errorData}` };
    }

    const data = await response.json();
    if (!data.access_token) return { success: false, error: "Token d'accès non reçu" };

    console.info("✅ Token récupéré (début):", data.access_token.substring(0, 10));
    return { success: true, token: data.access_token };

  } catch (error) {
    return { success: false, error: `Erreur réseau authentification: ${error.message}` };
  }
}

// ---- Recherche ----
async function searchJobs(token, candidateProfile) {
  try {
    const searchParams = new URLSearchParams({
      motsCles: buildKeywords(candidateProfile) || "developpeur",
      codePostal: extractLocation(candidateProfile.location) || '75001', // ✅ codePostal au lieu de commune
      distance: '50',
      sort: '0',
      range: '0-19'
    });

    if (candidateProfile.total_experience_years >= 5) {
      searchParams.append('experience', '2');
    } else if (candidateProfile.total_experience_years >= 2) {
      searchParams.append('experience', '1');
    }

    const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${searchParams}`;
    console.info("🌐 URL appelée:", url);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });

    const rawText = await response.text(); // ✅ réponse brute
    console.info("📥 Réponse brute:", rawText);

    if (!response.ok) {
      return { success: false, error: `Recherche échouée: ${response.status} - ${rawText}`, raw: rawText };
    }

    let data;
    try {
      data = JSON.parse(rawText); // ✅ parse manuel
    } catch (parseErr) {
      return { success: false, error: `Réponse non JSON: ${parseErr.message}`, raw: rawText };
    }

    return { success: true, jobs: data.resultats || [], total: data.resultats?.length || 0, query: searchParams.toString() };

  } catch (error) {
    return { success: false, error: `Erreur réseau recherche: ${error.message}` };
  }
}

// ---- Helpers ----
function buildKeywords(candidateProfile) {
  const keywords = [];
  if (candidateProfile.technical_skills?.length) keywords.push(...candidateProfile.technical_skills.slice(0, 3));
  if (candidateProfile.current_position && candidateProfile.current_position !== 'Sans emploi') keywords.push(candidateProfile.current_position);
  if (candidateProfile.career_aspirations) keywords.push(candidateProfile.career_aspirations);
  if (candidateProfile.key_sectors?.length) keywords.push(...candidateProfile.key_sectors.slice(0, 2));
  return keywords.slice(0, 5).join(' ');
}

function extractLocation(location) {
  if (!location) return null;
  const cityToPostal = { paris: '75001', lyon: '69001', marseille: '13001', toulouse: '31000', lille: '59000', bordeaux: '33000', nantes: '44000', strasbourg: '67000', montpellier: '34000', rennes: '35000' };
  const locationLower = location.toLowerCase();
  const postalMatch = location.match(/\b(\d{5})\b/);
  if (postalMatch) return postalMatch[1];
  for (const [city, postal] of Object.entries(cityToPostal)) if (locationLower.includes(city)) return postal;
  return '75001';
}

function transformJobsForAssignme(jobs, candidateProfile) {
  return jobs.map(job => {
    const matchScore = calculateMatchScore(job, candidateProfile);
    return {
      id: job.id,
      source: 'France Travail',
      is_real_offer: true,
      job_title: job.intitule || 'Poste non spécifié',
      company: job.entreprise?.nom || 'Entreprise non communiquée',
      location: formatLocation(job.lieuTravail),
      description: cleanDescription(job.description),
      contract_type: formatContractType(job.typeContrat),
      sector: job.secteurActivite || 'Secteur non spécifié',
      salary_display: job.salaire?.libelle || 'Salaire non communiqué',
      salary_min: extractSalaryMin(job.salaire?.libelle),
      salary_max: extractSalaryMax(job.salaire?.libelle),
      experience_required: formatExperience(job.experienceExige),
      qualification_required: job.qualificationLibelle || 'Non spécifié',
      date_creation: job.dateCreation,
      date_actualisation: job.dateActualisation,
      match_score: matchScore,
      match_justification: generateMatchJustification(job, candidateProfile, matchScore),
      france_travail_url: `https://candidat.pole-emploi.fr/offres/recherche/detail/${job.id}`,
      required_skills: extractSkillsFromJob(job),
      company_types: [job.entreprise?.adaptee ? 'Entreprise adaptée' : 'Standard'],
      evolution_potential: "À définir avec l'employeur"
    };
  });
}

// ---- Matching ----
function calculateMatchScore(job, candidateProfile) {
  let score = 40;
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  if (candidateProfile.technical_skills) {
    const matchingSkills = candidateProfile.technical_skills.filter(skill => jobText.includes(skill.toLowerCase()));
    score += Math.min(matchingSkills.length * 8, 32);
  }
  if (job.experienceExige === 'D' && candidateProfile.total_experience_years >= 0) score += 15;
  else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) score += 15;
  else if (job.experienceExige === 'E' && candidateProfile.total_experience_years >= 5) score += 15;
  if (candidateProfile.key_sectors) {
    const hasMatchingSector = candidateProfile.key_sectors.some(sector => job.secteurActivite?.toLowerCase().includes(sector.toLowerCase()));
    if (hasMatchingSector) score += 10;
  }
  if (candidateProfile.location && job.lieuTravail?.libelle) {
    const candidateLocation = candidateProfile.location.toLowerCase();
    const jobLocation = job.lieuTravail.libelle.toLowerCase();
    if (jobLocation.includes(candidateLocation) || candidateLocation.includes(jobLocation)) score += 8;
  }
  return Math.min(Math.max(score, 25), 95);
}

function generateMatchJustification(job, candidateProfile, score) {
  const reasons = [];
  if (score >= 80) reasons.push('Excellente correspondance avec votre profil');
  else if (score >= 60) reasons.push('Bonne correspondance avec vos compétences');
  else if (score >= 40) reasons.push('Correspondance acceptable');
  const jobText = `${job.intitule} ${job.description || ''}`.toLowerCase();
  if (candidateProfile.technical_skills) {
    const matchingSkills = candidateProfile.technical_skills.filter(skill => jobText.includes(skill.toLowerCase()));
    if (matchingSkills.length > 0) reasons.push(`Compétences en commun: ${matchingSkills.slice(0, 3).join(', ')}`);
  }
  if (job.experienceExige === 'D') reasons.push('Ouvert aux débutants');
  else if (job.experienceExige === 'S' && candidateProfile.total_experience_years >= 2) reasons.push('Expérience compatible');
  return reasons.length > 0 ? reasons.join(' • ') : 'Offre à étudier selon vos critères';
}

// ---- Formatage ----
function formatLocation(lieuTravail) { return lieuTravail?.libelle || 'Lieu non spécifié'; }
function formatContractType(typeContrat) { const c = { CDI: 'CDI', CDD: 'CDD', MIS: 'Mission intérim', SAI: 'Saisonnier', IND: 'Indépendant' }; return c[typeContrat] || typeContrat || 'Type non spécifié'; }
function formatExperience(experienceExige) { const e = { D: 'Débutant accepté', S: 'Expérience souhaitée', E: 'Expérience exigée' }; return e[experienceExige] || 'Non spécifié'; }
function cleanDescription(description) { if (!description) return 'Description non disponible'; return description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) + (description.length > 500 ? '...' : ''); }
function extractSalaryMin(salaireText) { if (!salaireText) return null; const match = salaireText.match(/(\d+(?:\s?\d+)*)\s*€/); return match ? parseInt(match[1].replace(/\s/g, '')) : null; }
function extractSalaryMax(salaireText) { if (!salaireText) return null; const matches = salaireText.match(/(\d+(?:\s?\d+)*)\s*€.*?(\d+(?:\s?\d+)*)\s*€/); return matches && matches.length >= 3 ? parseInt(matches[2].replace(/\s/g, '')) : extractSalaryMin(salaireText); }
function extractSkillsFromJob(job) { const skills = []; const text = `${job.intitule} ${job.description || ''}`.toLowerCase(); const common = ['excel','word','powerpoint','office','javascript','python','java','php','sql','marketing','communication','vente','commerce','gestion','comptabilité','finance','anglais','allemand','espagnol']; common.forEach(s => { if (text.includes(s)) skills.push(s.charAt(0).toUpperCase() + s.slice(1)); }); return skills.slice(0, 5); }

// ---- Fallback ----
function mockJobs(candidateProfile) {
  return [
    {
      id: "fake-1",
      source: "Mock",
      is_real_offer: false,
      job_title: "Développeur Fullstack (exemple)",
      company: "Startup Innovante",
      location: "Paris (75001)",
      description: "Exemple d'offre utilisée en fallback quand France Travail est indisponible.",
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
      match_justification: "Fallback automatique",
      france_travail_url: "#",
      required_skills: ["JavaScript", "Node.js", "React"],
      company_types: ["Standard"],
      evolution_potential: "Rapide évolution possible"
    }
  ];
}
