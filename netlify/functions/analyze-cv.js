// netlify/functions/analyze-cv.js - Version avec analyse psychologique, gestion géographique et enrichissement ROMEO
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

    // Prompt système avec analyse psychologique et gestion géographique
    const systemPrompt = `
Tu es un expert en recrutement, orientation professionnelle et psychologie du travail en France. 
Ta mission est d'analyser un CV (même partiel ou informel) ET de proposer des pistes réalistes 
d'emploi ou de formation adaptées au niveau réel, aux motivations, aux contraintes personnelles et 
à la localisation du candidat.

⚠️ IMPORTANT : 
- RÉPONDS UNIQUEMENT EN FRANÇAIS, dans un style professionnel et clair.
- RESPECT STRICT DU FORMAT JSON VALIDE ci-dessous.
- NE JAMAIS INVENTER de compétences, diplômes ou expériences non mentionnés.

────────────────────────────────
1. ANALYSE PSYCHOLOGIQUE OBLIGATOIRE
────────────────────────────────
- Détecter la motivation réelle (au-delà des formules polies).
- Évaluer les capacités relationnelles et communicationnelles.
- Identifier autonomie / besoin d'encadrement.
- Déterminer résistance au stress, persévérance et stabilité.
- Repérer traits de personnalité compatibles ou incompatibles avec certains métiers.

────────────────────────────────
2. CONTRÔLES DE COHÉRENCE MÉTIER
────────────────────────────────
- Interdiction : jamais orienter vers métiers d'accueil/enfants/clients si profil non adapté.
- Si motivation = purement financière → éviter métiers de vocation (social, éducation).
- Si niveau scolaire bas → formations courtes, pratiques, débouchant rapidement.
- Si expériences instables → privilégier missions courtes ou encadrées.

────────────────────────────────
3. PRISE EN COMPTE DES CONTRAINTES GÉOGRAPHIQUES
────────────────────────────────
- Si localisation = Canada, USA, Australie ou autre pays → NE PAS proposer d'emplois en France
- Dans ce cas, expliquer pourquoi dans "location_message"
- Proposer UNIQUEMENT des formations pour préparer un éventuel retour ou développement de compétences
- Si en France → proposer emplois ET formations selon le niveau

────────────────────────────────
4. FORMATIONS À PROPOSER
────────────────────────────────
- Toujours 3 à 5 formations adaptées au niveau réel.
- Pour profils faibles : CQP cuisine, permis cariste, sécurité, nettoyage industriel, etc.
- Pour profils diplômés : formations complémentaires réalistes (BTS, BUT, titres RNCP).
- Pour profils à l'étranger : formations de perfectionnement ou préparation au retour
- Lier les formations aux volontés exprimées par le candidat.
- Indiquer durée, débouchés, financement possible, et si emploi immédiat envisageable.

────────────────────────────────
5. RECONVERSION & PROJECTION
────────────────────────────────
- Proposer au moins 1 à 2 pistes de reconversion possibles.
- Indiquer faisabilité (facile/modérée/difficile).
- Détailler étapes concrètes et timeline réaliste.
- Justifier compatibilité psychologique.

────────────────────────────────
6. FORMAT DE SORTIE JSON STRICT
────────────────────────────────
{
  "candidate_analysis": {
    "name": "nom_complet",
    "location": "ville_pays", 
    "mobility": "locale|nationale|internationale",
    "education_level": "niveau_diplôme_ou_aucune_qualification",
    "education_details": "détails_diplôme_et_date_ou_aucune",
    "total_experience_years": nombre_années_total_REEL,
    "current_position": "poste_actuel_ou_sans_emploi",
    "key_sectors": ["secteur1_compatible", "secteur2_compatible"],
    "technical_skills": ["compétence1", "compétence2"],
    "soft_skills": ["qualité1", "qualité2"],
    "career_aspirations": "objectifs_reels_détectés",
    "constraints": "contraintes_personnelles_exprimées",
    "psychological_profile": "analyse_personnalité_et_motivation",
    "recommended_work_environment": "type_environnement_travail_adapté",
    "supervision_needs": "autonome|supervision_légère|supervision_directe|encadrement_strict",
    "location_message": "message_explicatif_si_pas_en_france_ou_vide",
    "jobs_available_in_france": true_ou_false
  },
  "training_suggestions": [
    {
      "title": "Formation courte adaptée",
      "description": "Description précise et débouchés",
      "duration": "durée réaliste",
      "relevance": "pourquoi adaptée au profil",
      "funding": "financement possible",
      "immediate_employment": "true|false"
    }
  ],
  "reconversion_paths": [
    {
      "target_field": "secteur réaliste",
      "feasibility": "facile|modérée|difficile",
      "required_steps": ["étape1", "étape2"],
      "timeline": "durée réaliste",
      "psychological_compatibility": "justification_personnalité"
    }
  ]
}
`;

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
          content: `ANALYSE PSYCHOLOGIQUE ET GÉOGRAPHIQUE APPROFONDIE REQUISE. 

IMPORTANT : Si le candidat réside à l'étranger (Canada, USA, etc.), NE PAS proposer d'emplois en France mais EXPLIQUER pourquoi dans "location_message" et proposer des formations pour un éventuel retour.

Analyse ce CV en respectant les 6 points obligatoires :
1. Psychologie du candidat (motivation réelle, capacités relationnelles)
2. Cohérence métier-personnalité (éviter accueil/enfants si inadapté)
3. Contraintes géographiques (si à l'étranger → pas d'emplois France)
4. Formations adaptées au niveau réel (3-5 propositions)
5. Reconversion possible (1-2 pistes)
6. Format JSON strict avec location_message

CV à analyser :
${cvText}

RÉPONDS EN JSON FRANÇAIS UNIQUEMENT avec analyse brutalement honnête.`
        }
      ],
      max_tokens: 3000,
      temperature: 0.2
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

    // Enrichissement avec ROMEO (nouvelle fonctionnalité)
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
          console.log('Profil enrichi avec ROMEO:', romeoData.romeo_analysis?.detected_metiers?.length || 0, 'métiers détectés');
        }
      }
    } catch (error) {
      console.log('Enrichissement ROMEO non disponible, utilisation profil de base');
    }

    // Vérification géographique pour les offres d'emploi
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
    
    console.log(`Localisation détectée: ${location}`);
    console.log(`Candidat à l'étranger: ${isAbroad}`);

    if (!isAbroad) {
      try {
        console.log('Recherche offres France Travail...');
        
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
    }

    const finalResult = {
      candidate_analysis: {
        ...candidateProfile
      },
      recommendations: realJobs.slice(0, 8),
      training_suggestions: analysisResult.training_suggestions || [],
      reconversion_paths: analysisResult.reconversion_paths || [],
      ai_metadata: {
        provider: 'ASSIGNME IA + France Travail',
        model: 'gpt-4o-mini',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1500) * 0.0000015).toFixed(4),
        confidence: 'Élevée',
        real_jobs_count: realJobs.length,
        france_travail_error: franceTravailError,
        psychological_analysis: true,
        geographic_filtering: true,
        candidate_abroad: isAbroad,
        romeo_enrichment: candidateProfile.romeo_analysis ? true : false
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
