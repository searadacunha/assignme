// netlify/functions/analyze-cv.js modifié pour intégrer les vraies offres
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
      headers,// netlify/functions/analyze-cv.js - Version complète avec formations
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
    // Récupération de l'API key depuis les variables d'environnement
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Parse du body de la requête
    const { cvText } = JSON.parse(event.body);
    
    if (!cvText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'CV text is required' })
      };
    }

    // Prompt système amélioré pour détecter les passions
    const systemPrompt = `Tu es un expert en recrutement et orientation professionnelle français. Tu vas analyser un CV et extraire les informations du candidat UNIQUEMENT.

IMPORTANT : RÉPONDS UNIQUEMENT EN FRANÇAIS. Toutes tes réponses doivent être dans un français parfait et professionnel.

RÈGLES D'ANALYSE STRICTES :
• Si le candidat dit clairement "rien", "naze", "j'ai raté", "aucune expérience" → NE PAS INVENTER de compétences ou qualités
• Si formation = "j'ai raté le brevet" ou équivalent → education_level = "Aucune qualification"
• Si expérience = "rien" ou "naze" → current_position = "Sans emploi" et total_experience_years = 0
• Si aspirations = "argent facile" → career_aspirations = "Recherche d'emploi rémunérateur"
• ÊTRE HONNÊTE sur le niveau réel du candidat, ne pas embellir
• DÉTECTER LES PASSIONS CACHÉES : cinéma, création, audiovisuel, communication, art, etc.

ANALYSE APPROFONDIE REQUISE :
• Localisation actuelle et mobilités possibles du candidat
• Diplômes et formations (niveau, spécialisation, date d'obtention) - RÉELS UNIQUEMENT
• Expériences professionnelles (intitulés exacts, missions détaillées, durée) - RÉELLES UNIQUEMENT
• Compétences techniques et comportementales - RÉELLES UNIQUEMENT
• PASSIONS et centres d'intérêt détectés (même sans diplôme)
• Aspirations et contraintes (type de contrat, secteur préféré, rythme, reconversion...)

RÉPONDS UNIQUEMENT EN JSON VALIDE AVEC TOUT LE CONTENU EN FRANÇAIS :

{
  "candidate_analysis": {
    "name": "nom_complet",
    "location": "ville_pays", 
    "mobility": "locale|nationale|internationale",
    "education_level": "niveau_diplome_plus_haut_EN_FRANCAIS_OU_AUCUNE_QUALIFICATION",
    "education_details": "formation_exacte_et_date_EN_FRANCAIS_OU_AUCUNE",
    "total_experience_years": nombre_années_total_REEL,
    "current_position": "poste_actuel_EN_FRANCAIS_OU_SANS_EMPLOI",
    "key_sectors": ["secteur1_EN_FRANCAIS", "secteur2_EN_FRANCAIS"],
    "technical_skills": ["compétence1_EN_FRANCAIS_REELLE", "compétence2_EN_FRANCAIS_REELLE"],
    "personal_qualities": ["qualité1_EN_FRANCAIS_REELLE", "qualité2_EN_FRANCAIS_REELLE"],
    "career_aspirations": "objectifs_détectés_EN_FRANCAIS_REELS",
    "constraints": "contraintes_mentionnées_EN_FRANCAIS",
    "detected_passions": ["passion1_EN_FRANCAIS", "passion2_EN_FRANCAIS"]
  },
  "training_suggestions": [
    {
      "title": "Formation recommandée EN FRANÇAIS PRIORITAIRE",
      "description": "Description et objectif EN FRANÇAIS",
      "duration": "durée_estimée_EN_FRANCAIS",
      "relevance": "pourquoi_utile_EN_FRANCAIS"
    }
  ],
  "reconversion_paths": [
    {
      "target_field": "Domaine de reconversion EN FRANÇAIS",
      "feasibility": "facile|modérée|difficile",
      "required_steps": ["étape1_EN_FRANCAIS", "étape2_EN_FRANCAIS"],
      "timeline": "durée_estimée_EN_FRANCAIS"
    }
  ]
}`;

    // Préparation de la requête vers OpenAI
    const requestData = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `IMPORTANT: RÉPONDS UNIQUEMENT EN FRANÇAIS. Analyse ce CV et extrait UNIQUEMENT les informations du candidat (détecte aussi les passions cachées comme cinéma, création, etc.) :

${cvText}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    };

    // Appel à l'API OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `OpenAI API error: ${response.status}`,
          details: errorData.error?.message || 'Unknown error'
        })
      };
    }

    const data = await response.json();
    
    // Traitement de la réponse OpenAI
    let aiResponse = data.choices[0].message.content;
    
    // Nettoyage de la réponse
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }

    // Parse du JSON
    const analysisResult = JSON.parse(aiResponse);

    // NOUVEAU: Récupération des vraies offres + formations France Travail
    let realJobs = [];
    let realFormations = [];
    let franceTravailError = null;

    try {
      console.log('Recherche offres et formations France Travail...');
      
      // Appel à la fonction france-travail-jobs (maintenant avec formations)
      const jobsResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/france-travail-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateProfile: analysisResult.candidate_analysis
        })
      });

      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        
        if (jobsData.success) {
          realJobs = jobsData.jobs || [];
          realFormations = jobsData.formations || [];
          console.log(`${realJobs.length} offres réelles et ${realFormations.length} formations trouvées`);
        }
      } else {
        const errorData = await jobsResponse.json();
        franceTravailError = errorData.error || 'Erreur API France Travail';
        console.error('Erreur France Travail:', franceTravailError);
      }

    } catch (error) {
      franceTravailError = error.message;
      console.error('Erreur connexion France Travail:', error);
    }

    // Fallback avec recommandations génériques si pas d'offres réelles
    let finalJobs = realJobs;
    if (finalJobs.length === 0) {
      console.log('Génération recommandations emploi fallback...');
      finalJobs = generateFallbackRecommendations(analysisResult.candidate_analysis);
    }

    // Fallback formations si pas de formations réelles
    let finalFormations = realFormations;
    if (finalFormations.length === 0) {
      console.log('Génération formations fallback...');
      finalFormations = generateFallbackFormations(analysisResult.candidate_analysis);
    }

    // Construction de la réponse finale
    const finalResult = {
      candidate_analysis: {
        ...analysisResult.candidate_analysis
      },
      recommendations: finalJobs.slice(0, 8), // Max 8 recommandations emploi
      formations: finalFormations.slice(0, 6), // Max 6 formations
      training_suggestions: analysisResult.training_suggestions || [],
      reconversion_paths: analysisResult.reconversion_paths || [],
      ai_metadata: {
        provider: 'ASSIGNME IA + France Travail',
        model: 'gpt-4o-mini',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1500) * 0.0000015).toFixed(4),
        confidence: 'Élevée',
        real_jobs_count: realJobs.length,
        real_formations_count: realFormations.length,
        france_travail_error: franceTravailError
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResult)
    };

  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};

// Génération de recommandations emploi fallback
function generateFallbackRecommendations(candidateProfile) {
  const fallbackJobs = [];
  
  // Recommandations basées sur les passions détectées
  const passions = candidateProfile.detected_passions || [];
  
  if (passions.some(p => ['cinéma', 'audiovisuel', 'création', 'communication'].includes(p.toLowerCase()))) {
    fallbackJobs.push({
      job_title: 'Assistant de production audiovisuelle',
      company: 'Entreprises Créatives',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDD',
      sector: 'Audiovisuel',
      salary_min: 25000,
      salary_max: 35000,
      match_score: 80,
      match_justification: `Votre passion pour ${passions.join(', ')} correspond parfaitement à ce secteur`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
    
    fallbackJobs.push({
      job_title: 'Chargé de communication junior',
      company: 'Agences Communication',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: 'Communication',
      salary_min: 28000,
      salary_max: 38000,
      match_score: 75,
      match_justification: `Vos compétences créatives sont recherchées en communication`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Recommandations basées sur les compétences techniques
  if (candidateProfile.technical_skills && candidateProfile.technical_skills.length > 0) {
    const mainSkill = candidateProfile.technical_skills[0];
    
    if (['JavaScript', 'Python', 'Java', 'PHP', 'Adobe', 'Premiere', 'Photoshop'].some(tech => mainSkill.toLowerCase().includes(tech.toLowerCase()))) {
      fallbackJobs.push({
        job_title: `Spécialiste ${mainSkill}`,
        company: 'Entreprises Tech',
        location: candidateProfile.location || 'Paris',
        contract_type: 'CDI',
        sector: 'Informatique',
        salary_min: 30000 + (candidateProfile.total_experience_years * 3000),
        salary_max: 45000 + (candidateProfile.total_experience_years * 5000),
        match_score: 85,
        match_justification: `Votre expertise en ${mainSkill} est très demandée sur le marché`,
        source: 'ASSIGNME Fallback',
        is_real_offer: false
      });
    }
  }
  
  // Recommandation selon le niveau d'éducation
  if (candidateProfile.education_level && candidateProfile.education_level !== 'Aucune qualification') {
    fallbackJobs.push({
      job_title: `Assistant ${candidateProfile.key_sectors[0] || 'Administratif'}`,
      company: 'PME Locales',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: candidateProfile.key_sectors[0] || 'Services',
      salary_min: 25000 + (candidateProfile.total_experience_years * 2000),
      salary_max: 35000 + (candidateProfile.total_experience_years * 3000),
      match_score: 70,
      match_justification: `Votre formation vous permet d'accéder à des postes d'assistant qualifié`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Recommandations pour profils sans qualification
  if (candidateProfile.education_level === 'Aucune qualification' || candidateProfile.total_experience_years === 0) {
    fallbackJobs.push({
      job_title: 'Agent d\'accueil',
      company: 'Secteur Services',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDD',
      sector: 'Services',
      salary_min: 20000,
      salary_max: 25000,
      match_score: 60,
      match_justification: `Poste accessible sans qualification, formation possible en interne`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
    
    fallbackJobs.push({
      job_title: 'Préparateur de commandes',
      company: 'Logistique & Transport',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: 'Logistique',
      salary_min: 22000,
      salary_max: 28000,
      match_score: 65,
      match_justification: `Secteur qui recrute, formation rapide, évolution possible`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Recommandation basée sur l'expérience
  if (candidateProfile.current_position && candidateProfile.current_position !== 'Sans emploi') {
    fallbackJobs.push({
      job_title: `${candidateProfile.current_position} - Poste similaire`,
      company: `Secteur ${candidateProfile.key_sectors[0] || 'Privé'}`,
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: candidateProfile.key_sectors[0] || 'Services',
      salary_min: 28000 + (candidateProfile.total_experience_years * 2500),
      salary_max: 42000 + (candidateProfile.total_experience_years * 4000),
      match_score: 80,
      match_justification: `Évolution naturelle avec ${candidateProfile.total_experience_years} ans d'expérience`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Assure au moins 3 recommandations
  while (fallbackJobs.length < 3) {
    fallbackJobs.push({
      job_title: 'Employé Polyvalent',
      company: 'Entreprises Locales',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: 'Services',
      salary_min: 24000,
      salary_max: 32000,
      match_score: 55,
      match_justification: `Poste polyvalent adapté à votre profil, possibilité d'évolution`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  return fallbackJobs;
}

// Génération de formations fallback
function generateFallbackFormations(candidateProfile) {
  const fallbackFormations = [];
  
  // Formations basées sur les passions détectées
  const passions = candidateProfile.detected_passions || [];
  
  if (passions.some(p => ['cinéma', 'audiovisuel', 'création'].includes(p.toLowerCase()))) {
    fallbackFormations.push({
      title: "BTS Métiers de l'audiovisuel - Option montage",
      organisme: "Lycées techniques/Écoles spécialisées",
      duree: "2 ans",
      niveau: "BTS",
      financement: "Formation initiale, apprentissage, CPF",
      prerequis: "Bac (toutes filières)",
      debouches: "Monteur vidéo, assistant réalisateur, technicien post-production",
      salaire_apres: "2000-3500€",
      lieux_proches: ["Paris", "Lyon", "Marseille"],
      pertinence: 90,
      justification: "Formation parfaitement adaptée à vos passions détectées • Éligible au financement CPF",
      secteur: "creatif",
      type: "audiovisuel"
    });
    
    fallbackFormations.push({
      title: "Formation Adobe Premiere Pro - Montage vidéo",
      organisme: "Centres de formation agréés",
      duree: "5 jours intensifs",
      niveau: "Certification",
      financement: "CPF, employeur, financement personnel",
      prerequis: "Bases informatiques",
      debouches: "Complément de compétences pour audiovisuel",
      salaire_apres: "Évolution +300-600€/mois",
      lieux_proches: ["Formation en ligne", "Toutes grandes villes"],
      pertinence: 85,
      justification: "Formation courte pour acquérir rapidement des compétences recherchées • Financement CPF possible",
      secteur: "creatif",
      type: "audiovisuel"
    });
  }
  
  if (passions.some(p => ['communication', 'marketing'].includes(p.toLowerCase()))) {
    fallbackFormations.push({
      title: "BTS Communication",
      organisme: "Lycées/Écoles privées",
      duree: "2 ans",
      niveau: "BTS",
      financement: "Formation initiale, apprentissage, CPF",
      prerequis: "Bac (de préférence général ou STMG)",
      debouches: "Chargé de communication, assistant marketing",
      salaire_apres: "2000-2800€",
      lieux_proches: ["Paris", "Lyon", "Marseille"],
      pertinence: 80,
      justification: "Correspond à vos compétences en communication • Formation reconnue par les entreprises",
      secteur: "creatif",
      type: "communication"
    });
  }
  
  // Formations techniques selon profil
  if (candidateProfile.technical_skills && candidateProfile.technical_skills.some(skill => 
      ['électrotechnique', 'maintenance', 'technique'].some(tech => skill.toLowerCase().includes(tech)))) {
    
    fallbackFormations.push({
      title: "Titre professionnel Électricien d'équipement du bâtiment",
      organisme: "AFPA",
      duree: "7 mois",
      niveau: "CAP/BEP",
      financement: "CPF, Pôle emploi, Région",
      prerequis: "Niveau 3ème, aptitudes physiques",
      debouches: "Électricien bâtiment, installateur électrique",
      salaire_apres: "1800-2500€",
      lieux_proches: ["Annecy", "Lyon", "Paris"],
      pertinence: 85,
      justification: "Formation adaptée à vos compétences techniques • Secteur qui recrute",
      secteur: "technique",
      type: "electricien"
    });
  }
  
  // Formations selon niveau d'éducation
  if (candidateProfile.education_level === 'Aucune qualification' || candidateProfile.total_experience_years === 0) {
    fallbackFormations.push({
      title: "DEAES - Diplôme d'État d'Accompagnant Éducatif et Social",
      organisme: "IRTS/Écoles spécialisées",
      duree: "12-24 mois",
      niveau: "Niveau 3 (CAP)",
      financement: "Région, CPF, employeur, Pôle emploi",
      prerequis: "Aucun diplôme requis",
      debouches: "Accompagnant personnes âgées/handicapées",
      salaire_apres: "1600-1900€",
      lieux_proches: ["Lyon", "Paris", "Marseille"],
      pertinence: 70,
      justification: "Formation d'insertion accessible sans prérequis • Secteur qui recrute • Financement possible",
      secteur: "social",
      type: "accompagnement"
    });
    
    fallbackFormations.push({
      title: "CQP Animateur de loisir sportif",
      organisme: "Fédérations sportives",
      duree: "6 mois",
      niveau: "CQP",
      financement: "CPF, Région",
      prerequis: "18 ans minimum",
      debouches: "Animateur sportif, centres de loisirs",
      salaire_apres: "1500-2000€",
      lieux_proches: ["Toutes régions"],
      pertinence: 65,
      justification: "Formation courte et pratique • Accès rapide à l'emploi • Financement CPF",
      secteur: "social",
      type: "accompagnement"
    });
  }
  
  // Formation management pour profils expérimentés
  if (candidateProfile.total_experience_years >= 3) {
    fallbackFormations.push({
      title: "Formation Gestion de projet - Certification PMP",
      organisme: "Centres de formation agréés",
      duree: "5 jours + certification",
      niveau: "Certification",
      financement: "CPF, employeur",
      prerequis: "Expérience gestion de projet",
      debouches: "Chef de projet certifié, consultant",
      salaire_apres: "Évolution +400-800€/mois",
      lieux_proches: ["Toutes grandes villes", "Formation en ligne"],
      pertinence: 75,
      justification: "Valorisation de votre expérience • Certification reconnue internationalement",
      secteur: "tertiaire",
      type: "management"
    });
  }
  
  return fallbackFormations;
}
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
    // Récupération de l'API key depuis les variables d'environnement
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Parse du body de la requête
    const { cvText } = JSON.parse(event.body);
    
    if (!cvText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'CV text is required' })
      };
    }

    // Votre prompt système existant (gardé identique)
    const systemPrompt = `Tu es un expert en recrutement et orientation professionnelle français. Tu vas analyser un CV et extraire les informations du candidat UNIQUEMENT.

IMPORTANT : RÉPONDS UNIQUEMENT EN FRANÇAIS. Toutes tes réponses doivent être dans un français parfait et professionnel.

RÈGLES D'ANALYSE STRICTES :
• Si le candidat dit clairement "rien", "naze", "j'ai raté", "aucune expérience" → NE PAS INVENTER de compétences ou qualités
• Si formation = "j'ai raté le brevet" ou équivalent → education_level = "Aucune qualification"
• Si expérience = "rien" ou "naze" → current_position = "Sans emploi" et total_experience_years = 0
• Si aspirations = "argent facile" → career_aspirations = "Recherche d'emploi rémunérateur"
• ÊTRE HONNÊTE sur le niveau réel du candidat, ne pas embellir
• TOUJOURS proposer des formations adaptées au niveau réel, surtout pour les candidats sans qualification
• Privilégier les formations courtes, pratiques et débouchant sur un emploi rapide

ANALYSE APPROFONDIE REQUISE :
• Localisation actuelle et mobilités possibles du candidat
• Diplômes et formations (niveau, spécialisation, date d'obtention) - RÉELS UNIQUEMENT
• Expériences professionnelles (intitulés exacts, missions détaillées, durée) - RÉELLES UNIQUEMENT
• Compétences techniques et comportementales - RÉELLES UNIQUEMENT
• Aspirations et contraintes (type de contrat, secteur préféré, rythme, reconversion...)

RÉPONDS UNIQUEMENT EN JSON VALIDE AVEC TOUT LE CONTENU EN FRANÇAIS :

{
  "candidate_analysis": {
    "name": "nom_complet",
    "location": "ville_pays", 
    "mobility": "locale|nationale|internationale",
    "education_level": "niveau_diplome_plus_haut_EN_FRANCAIS_OU_AUCUNE_QUALIFICATION",
    "education_details": "formation_exacte_et_date_EN_FRANCAIS_OU_AUCUNE",
    "total_experience_years": nombre_années_total_REEL,
    "current_position": "poste_actuel_EN_FRANCAIS_OU_SANS_EMPLOI",
    "key_sectors": ["secteur1_EN_FRANCAIS", "secteur2_EN_FRANCAIS"],
    "technical_skills": ["compétence1_EN_FRANCAIS_REELLE", "compétence2_EN_FRANCAIS_REELLE"],
    "soft_skills": ["qualité1_EN_FRANCAIS_REELLE", "qualité2_EN_FRANCAIS_REELLE"],
    "career_aspirations": "objectifs_détectés_EN_FRANCAIS_REELS",
    "constraints": "contraintes_mentionnées_EN_FRANCAIS"
  },
  "training_suggestions": [
    {
      "title": "Formation recommandée EN FRANÇAIS PRIORITAIRE",
      "description": "Description et objectif EN FRANÇAIS",
      "duration": "durée_estimée_EN_FRANCAIS",
      "relevance": "pourquoi_utile_EN_FRANCAIS"
    }
  ],
  "reconversion_paths": [
    {
      "target_field": "Domaine de reconversion EN FRANÇAIS",
      "feasibility": "facile|modérée|difficile",
      "required_steps": ["étape1_EN_FRANCAIS", "étape2_EN_FRANCAIS"],
      "timeline": "durée_estimée_EN_FRANCAIS"
    }
  ]
}`;

    // Préparation de la requête vers OpenAI
    const requestData = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `IMPORTANT: RÉPONDS UNIQUEMENT EN FRANÇAIS. Analyse ce CV et extrait UNIQUEMENT les informations du candidat (pas de recommandations d'emploi) :

${cvText}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    };

    // Appel à l'API OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `OpenAI API error: ${response.status}`,
          details: errorData.error?.message || 'Unknown error'
        })
      };
    }

    const data = await response.json();
    
    // Traitement de la réponse OpenAI
    let aiResponse = data.choices[0].message.content;
    
    // Nettoyage de la réponse
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }

    // Parse du JSON
    const analysisResult = JSON.parse(aiResponse);

    // NOUVEAU: Récupération des vraies offres France Travail
    let realJobs = [];
    let franceTravailError = null;

    try {
      console.log('Recherche offres France Travail...');
      
      // Appel à la fonction france-travail-jobs
      const jobsResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/france-travail-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateProfile: analysisResult.candidate_analysis
        })
      });

      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        
        if (jobsData.success && jobsData.jobs) {
          realJobs = jobsData.jobs;
          console.log(`${realJobs.length} offres réelles trouvées`);
        }
      } else {
        const errorData = await jobsResponse.json();
        franceTravailError = errorData.error || 'Erreur API France Travail';
        console.error('Erreur France Travail:', franceTravailError);
      }

    } catch (error) {
      franceTravailError = error.message;
      console.error('Erreur connexion France Travail:', error);
    }

    // Fallback avec recommandations génériques si pas d'offres réelles
    let recommendations = realJobs;

    if (recommendations.length === 0) {
      console.log('Génération recommandations fallback...');
      recommendations = generateFallbackRecommendations(analysisResult.candidate_analysis);
    }

    // Construction de la réponse finale
    const finalResult = {
      candidate_analysis: {
        ...analysisResult.candidate_analysis
      },
      recommendations: recommendations.slice(0, 8), // Max 8 recommandations
      training_suggestions: analysisResult.training_suggestions || [],
      reconversion_paths: analysisResult.reconversion_paths || [],
      ai_metadata: {
        provider: 'ASSIGNME IA + France Travail',
        model: 'gpt-4o-mini',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1500) * 0.0000015).toFixed(4),
        confidence: 'Élevée',
        real_jobs_count: realJobs.length,
        france_travail_error: franceTravailError
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResult)
    };

  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};

// Génération de recommandations fallback si France Travail ne fonctionne pas
function generateFallbackRecommendations(candidateProfile) {
  const fallbackJobs = [];
  
  // Recommandations basées sur les compétences techniques
  if (candidateProfile.technical_skills && candidateProfile.technical_skills.length > 0) {
    const mainSkill = candidateProfile.technical_skills[0];
    
    if (['JavaScript', 'Python', 'Java', 'PHP'].some(tech => mainSkill.toLowerCase().includes(tech.toLowerCase()))) {
      fallbackJobs.push({
        job_title: 'Développeur ' + mainSkill,
        company: 'Entreprises Tech Paris',
        location: candidateProfile.location || 'Paris',
        contract_type: 'CDI',
        sector: 'Informatique',
        salary_min: 35000 + (candidateProfile.total_experience_years * 5000),
        salary_max: 50000 + (candidateProfile.total_experience_years * 8000),
        match_score: 85,
        match_justification: `Votre expérience en ${mainSkill} correspond parfaitement aux besoins du marché`,
        source: 'ASSIGNME Fallback',
        is_real_offer: false
      });
    }
  }
  
  // Recommandation généraliste selon le niveau
  if (candidateProfile.education_level && candidateProfile.education_level !== 'Aucune qualification') {
    fallbackJobs.push({
      job_title: 'Assistant ' + (candidateProfile.key_sectors[0] || 'Administratif'),
      company: 'PME Locales',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: candidateProfile.key_sectors[0] || 'Services',
      salary_min: 25000 + (candidateProfile.total_experience_years * 2000),
      salary_max: 35000 + (candidateProfile.total_experience_years * 3000),
      match_score: 70,
      match_justification: `Votre formation et expérience vous permettent d'accéder à ce type de poste`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Recommandation formation/reconversion pour profils sans qualification
  if (candidateProfile.education_level === 'Aucune qualification' || candidateProfile.total_experience_years === 0) {
    fallbackJobs.push({
      job_title: 'Agent d\'accueil',
      company: 'Secteur Services',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDD',
      sector: 'Services',
      salary_min: 20000,
      salary_max: 25000,
      match_score: 60,
      match_justification: `Poste accessible sans qualification préalable, formation possible en interne`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
    
    fallbackJobs.push({
      job_title: 'Préparateur de commandes',
      company: 'Logistique & Transport',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: 'Logistique',
      salary_min: 22000,
      salary_max: 28000,
      match_score: 65,
      match_justification: `Secteur qui recrute, formation rapide possible, évolution vers responsabilité d'équipe`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Recommandation basée sur l'expérience professionnelle
  if (candidateProfile.current_position && candidateProfile.current_position !== 'Sans emploi') {
    fallbackJobs.push({
      job_title: candidateProfile.current_position + ' Confirmé',
      company: 'Secteur ' + (candidateProfile.key_sectors[0] || 'Privé'),
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: candidateProfile.key_sectors[0] || 'Services',
      salary_min: 30000 + (candidateProfile.total_experience_years * 3000),
      salary_max: 45000 + (candidateProfile.total_experience_years * 4000),
      match_score: 80,
      match_justification: `Évolution naturelle de votre poste actuel avec ${candidateProfile.total_experience_years} ans d'expérience`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  // Assure au moins 3 recommandations
  while (fallbackJobs.length < 3) {
    fallbackJobs.push({
      job_title: 'Employé Polyvalent',
      company: 'Entreprises Locales',
      location: candidateProfile.location || 'Paris',
      contract_type: 'CDI',
      sector: 'Services',
      salary_min: 24000,
      salary_max: 32000,
      match_score: 55,
      match_justification: `Poste polyvalent adapté à votre profil, possibilité d'évolution`,
      source: 'ASSIGNME Fallback',
      is_real_offer: false
    });
  }
  
  return fallbackJobs;
}
