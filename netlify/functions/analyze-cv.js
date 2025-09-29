// netlify/functions/analyze-cv.js - Version Mistral AI optimisée (Medium)
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
    // Récupération de l'API key Mistral depuis les variables d'environnement
    const apiKey = process.env.MISTRAL_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Mistral API key not configured' })
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

    // Prompt système simplifié pour rapidité
    const systemPrompt = `Tu es un expert en recrutement français. Analyse ce CV et réponds en JSON français strict.

FORMAT JSON OBLIGATOIRE :
{
  "candidate_analysis": {
    "name": "nom_complet",
    "location": "ville_pays", 
    "mobility": "locale|nationale|internationale",
    "education_level": "niveau_diplôme",
    "education_details": "détails_formation",
    "total_experience_years": nombre_années,
    "current_position": "poste_actuel",
    "key_sectors": ["secteur1", "secteur2"],
    "technical_skills": ["compétence1", "compétence2"],
    "soft_skills": ["qualité1", "qualité2"],
    "career_aspirations": "objectifs_détectés",
    "constraints": "contraintes_exprimées",
    "psychological_profile": "analyse_motivation",
    "recommended_work_environment": "environnement_adapté",
    "supervision_needs": "autonome|supervision_légère|supervision_directe",
    "location_message": "",
    "jobs_available_in_france": true
  },
  "training_suggestions": [
    {
      "title": "Formation adaptée",
      "description": "Description et débouchés",
      "duration": "durée",
      "relevance": "pourquoi adaptée",
      "funding": "financement possible",
      "immediate_employment": "true|false"
    }
  ],
  "reconversion_paths": [
    {
      "target_field": "secteur possible",
      "feasibility": "facile|modérée|difficile",
      "required_steps": ["étape1", "étape2"],
      "timeline": "durée estimée",
      "psychological_compatibility": "justification"
    }
  ]
}

IMPORTANT :
- Si localisation hors France (Canada, USA, etc.) : jobs_available_in_france = false
- Analyse honnête et constructive
- 3-5 formations adaptées au niveau réel
- JSON valide uniquement`;

    const userPrompt = `Analyse ce CV français et propose formations + reconversions adaptées.

CV :
${cvText}

RÉPONDS UNIQUEMENT EN JSON FRANÇAIS VALIDE.`;

    // Préparation de la requête vers Mistral AI (version optimisée)
    const requestData = {
      model: "mistral-medium-latest",  // Plus rapide que large
      messages: [
        {
          role: "system", 
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 2000,  // Réduit pour rapidité
      temperature: 0.2
    };

    console.log('Appel Mistral API...');

    // Appel à l'API Mistral AI
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    console.log(`Réponse Mistral: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Mistral AI API error:', response.status, errorData);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `Mistral AI API error: ${response.status}`,
          details: errorData.message || 'Unknown error'
        })
      };
    }

    const data = await response.json();
    console.log('Tokens utilisés:', data.usage?.total_tokens);
    
    // Traitement de la réponse Mistral AI
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

    // Enrichissement avec ROMEO (optionnel, rapide)
    let enrichedProfile = analysisResult.candidate_analysis;
    try {
      console.log('Tentative enrichissement ROMEO...');
      const romeoResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/romeo-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cvText: cvText,
          candidateProfile: analysisResult.candidate_analysis 
        }),
        timeout: 5000  // Timeout court
      });
      
      if (romeoResponse.ok) {
        const romeoData = await romeoResponse.json();
        if (romeoData.success && romeoData.enriched_profile) {
          enrichedProfile = romeoData.enriched_profile;
          console.log('Profil enrichi avec ROMEO');
        }
      }
    } catch (error) {
      console.log('ROMEO skip:', error.message);
    }

    // Vérification géographique pour les offres d'emploi
    let realJobs = [];
    let franceTravailError = null;
    
    const candidateProfile = enrichedProfile;
    
    // Détection si candidat à l'étranger
    const location = candidateProfile.location?.toLowerCase() || "";
    const isAbroad = !location.includes('paris') && !location.includes('france') && (
      location.includes('canada') || location.includes('usa') || location.includes('australie') || 
      location.includes('toronto') || location.includes('lisbonne') || location.includes('miami') || 
      location.includes('rio') || location.includes('new york') || location.includes('sydney') ||
      candidateProfile.jobs_available_in_france === false
    );
    
    console.log(`Localisation: ${location}, À l'étranger: ${isAbroad}`);

    // Recherche offres France Travail (seulement si en France)
    if (!isAbroad) {
      try {
        console.log('Recherche France Travail...');
        
        const jobsResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/france-travail-jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            candidateProfile: {
              ...candidateProfile,
              psychological_profile: candidateProfile.psychological_profile,
              supervision_needs: candidateProfile.supervision_needs,
              recommended_work_environment: candidateProfile.recommended_work_environment,
              romeo_analysis: candidateProfile.romeo_analysis || null
            }
          }),
          timeout: 8000  // Timeout court
        });

        if (jobsResponse.ok) {
          const jobsData = await jobsResponse.json();
          
          if (jobsData.success && jobsData.jobs) {
            realJobs = jobsData.jobs;
            console.log(`${realJobs.length} offres trouvées`);
          }
        } else {
          const errorData = await jobsResponse.json();
          franceTravailError = errorData.error || 'Erreur API';
          console.log('France Travail erreur:', franceTravailError);
        }

      } catch (error) {
        franceTravailError = error.message;
        console.log('France Travail timeout/erreur:', error.message);
      }
    } else {
      console.log('Candidat étranger - pas de recherche emploi France');
    }

    // Construction de la réponse finale
    const finalResult = {
      candidate_analysis: {
        ...candidateProfile
      },
      recommendations: realJobs.slice(0, 8),
      training_suggestions: analysisResult.training_suggestions || [],
      reconversion_paths: analysisResult.reconversion_paths || [],
      ai_metadata: {
        provider: 'ASSIGNME IA (Mistral AI) + France Travail',
        model: 'mistral-medium-latest',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1000) * 0.000003).toFixed(6),
        confidence: 'Élevée',
        real_jobs_count: realJobs.length,
        france_travail_error: franceTravailError,
        psychological_analysis: true,
        geographic_filtering: true,
        candidate_abroad: isAbroad,
        romeo_enrichment: candidateProfile.romeo_analysis ? true : false
      }
    };

    console.log('Analyse terminée avec succès');

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
