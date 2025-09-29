// netlify/functions/analyze-cv.js - Version OpenAI
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
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'OpenAI API key not configured' }) };
    }

    const { cvText } = JSON.parse(event.body);
    
    if (!cvText) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'CV text is required' }) };
    }

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

    const requestData = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.2
    };

    console.log('Appel OpenAI API...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    console.log(`Réponse OpenAI: ${response.status}`);

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
    console.log('Tokens utilisés:', data.usage?.total_tokens);
    
    let aiResponse = data.choices[0].message.content;
    
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }

    const analysisResult = JSON.parse(aiResponse);

    let enrichedProfile = analysisResult.candidate_analysis;
    try {
      console.log('Tentative enrichissement ROMEO...');
      const romeoResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/romeo-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cvText: cvText,
          candidateProfile: analysisResult.candidate_analysis 
        })
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

    let realJobs = [];
    let franceTravailError = null;
    
    const candidateProfile = enrichedProfile;
    
    const location = candidateProfile.location?.toLowerCase() || "";
    const isAbroad = !location.includes('paris') && !location.includes('france') && (
      location.includes('canada') || location.includes('usa') || location.includes('australie') || 
      location.includes('toronto') || location.includes('lisbonne') || location.includes('miami') || 
      location.includes('rio') || location.includes('new york') || location.includes('sydney') ||
      candidateProfile.jobs_available_in_france === false
    );
    
    console.log(`Localisation: ${location}, À l'étranger: ${isAbroad}`);

    if (!isAbroad) {
      try {
        console.log('Recherche France Travail...');
        
        const jobsResponse = await fetch(`${process.env.URL || 'https://assignme.fr'}/.netlify/functions/france-travail-jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateProfile: {
              ...candidateProfile,
              psychological_profile: candidateProfile.psychological_profile,
              supervision_needs: candidateProfile.supervision_needs,
              recommended_work_environment: candidateProfile.recommended_work_environment,
              romeo_analysis: candidateProfile.romeo_analysis || null
            }
          })
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

    const finalResult = {
      candidate_analysis: {
        ...candidateProfile
      },
      recommendations: realJobs.slice(0, 8),
      training_suggestions: analysisResult.training_suggestions || [],
      reconversion_paths: analysisResult.reconversion_paths || [],
      ai_metadata: {
        provider: 'ASSIGNME IA (OpenAI GPT-4) + France Travail',
        model: 'gpt-4o-mini',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1000) * 0.00000015).toFixed(6),
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
