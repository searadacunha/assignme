// netlify/functions/analyze-cv.js - Version sans simulations
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

    // Prompt système
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

    // Récupération des vraies offres France Travail UNIQUEMENT
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
        } else {
          console.log('Aucune offre trouvée via France Travail');
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

    // Construction de la réponse finale - SANS FALLBACK
    const finalResult = {
      candidate_analysis: {
        ...analysisResult.candidate_analysis
      },
      recommendations: realJobs.slice(0, 8), // Seulement les vraies offres ou liste vide
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
