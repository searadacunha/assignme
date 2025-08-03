// api/analyze-cv.js - API serveur pour ASSIGNME
export default async function handler(req, res) {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cvText, fileName } = req.body;

    if (!cvText || cvText.trim().length < 50) {
      return res.status(400).json({ error: 'CV trop court ou vide' });
    }

    // Prompt système pour l'analyse
    const systemPrompt = `Tu es un expert en recrutement et orientation professionnelle français. Tu vas analyser un CV et recommander 3 opportunités professionnelles pertinentes.

IMPORTANT : RÉPONDS UNIQUEMENT EN FRANÇAIS. Toutes tes réponses doivent être dans un français parfait et professionnel.

RÈGLES D'ANALYSE STRICTES :
• Si le candidat dit clairement "rien", "naze", "j'ai raté", "aucune expérience" → NE PAS INVENTER de compétences ou qualités
• Si formation = "j'ai raté le brevet" ou équivalent → education_level = "Aucune qualification"
• Si expérience = "rien" ou "naze" → current_position = "Sans emploi" et total_experience_years = 0
• Si aspirations = "argent facile" → career_aspirations = "Recherche d'emploi rémunérateur"
• ÊTRE HONNÊTE sur le niveau réel du candidat, ne pas embellir
• TOUJOURS proposer des formations adaptées au niveau réel, surtout pour les candidats sans qualification
• Privilégier les formations courtes, pratiques et débouchant sur un emploi rapide

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
  "recommendations": [
    {
      "job_title": "Intitulé exact du poste EN FRANÇAIS ADAPTÉ AU NIVEAU",
      "sector": "Secteur d'activité EN FRANÇAIS",
      "salary_min": montant_euros_minimum_REALISTE,
      "salary_max": montant_euros_maximum_REALISTE,
      "match_justification": "Explication détaillée EN FRANÇAIS pourquoi ce poste convient parfaitement",
      "required_skills": ["compétence1_EN_FRANCAIS", "compétence2_EN_FRANCAIS"],
      "company_types": ["type_entreprise1_EN_FRANCAIS", "type_entreprise2_EN_FRANCAIS"],
      "contract_type": "CDI|CDD|Freelance|Stage",
      "evolution_potential": "perspectives_évolution_EN_FRANCAIS"
    },
    {
      "job_title": "2ème recommandation EN FRANÇAIS",
      "sector": "Secteur EN FRANÇAIS",
      "salary_min": montant_min,
      "salary_max": montant_max,
      "match_justification": "Justification EN FRANÇAIS",
      "required_skills": ["compétences_EN_FRANCAIS"],
      "company_types": ["types_EN_FRANCAIS"],
      "contract_type": "type",
      "evolution_potential": "évolution_EN_FRANCAIS"
    },
    {
      "job_title": "3ème recommandation EN FRANÇAIS",
      "sector": "Secteur EN FRANÇAIS",
      "salary_min": montant_min,
      "salary_max": montant_max,
      "match_justification": "Justification EN FRANÇAIS",
      "required_skills": ["compétences_EN_FRANCAIS"],
      "company_types": ["types_EN_FRANCAIS"],
      "contract_type": "type",
      "evolution_potential": "évolution_EN_FRANCAIS"
    }
  ],
  "training_suggestions": [
    {
      "title": "Formation recommandée EN FRANÇAIS PRIORITAIRE",
      "description": "Description et objectif EN FRANÇAIS",
      "duration": "durée_estimée_EN_FRANCAIS",
      "relevance": "pourquoi_utile_EN_FRANCAIS"
    },
    {
      "title": "2ème formation recommandée EN FRANÇAIS",
      "description": "Description et objectif EN FRANÇAIS", 
      "duration": "durée_estimée_EN_FRANCAIS",
      "relevance": "pourquoi_utile_EN_FRANCAIS"
    },
    {
      "title": "3ème formation recommandée EN FRANÇAIS",
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

    // Requête à OpenAI
    const requestData = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `IMPORTANT: RÉPONDS UNIQUEMENT EN FRANÇAIS. Analyse ce CV et recommande 3 opportunités professionnelles pertinentes:\n\n${cvText}`
        }
      ],
      max_tokens: 3000,
      temperature: 0.3
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new Error('Clé API OpenAI invalide ou expirée');
      }
      if (response.status === 429) {
        throw new Error('Trop de requêtes. Attendez quelques minutes.');
      }
      if (response.status === 403) {
        throw new Error('Accès refusé. Vérifiez vos crédits OpenAI.');
      }
      if (response.status >= 500) {
        throw new Error('Erreur serveur OpenAI. Réessayez plus tard.');
      }
      
      throw new Error(`Erreur OpenAI: ${response.status} - ${errorData.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    let aiResponse = data.choices[0].message.content;
    
    // Nettoyer la réponse JSON
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }
    
    const result = JSON.parse(aiResponse);
    
    // Réponse finale avec métadonnées
    const finalResult = {
      ...result,
      ai_metadata: {
        provider: 'ASSIGNME IA',
        model: 'gpt-4o-mini',
        tokens_used: data.usage?.total_tokens,
        cost: ((data.usage?.total_tokens || 1500) * 0.0000015).toFixed(4),
        confidence: 'Élevée',
        processing_time: new Date().toISOString()
      }
    };
    
    return res.status(200).json({
      success: true,
      filename: fileName,
      analysis: finalResult
    });

  } catch (error) {
    console.error('Erreur API:', error);
    
    // Gestion des erreurs spécifiques
    if (error.message.includes('JSON')) {
      return res.status(502).json({ 
        error: 'Erreur de traitement IA. Réessayez avec un CV plus détaillé.' 
      });
    }
    
    if (error.message.includes('OpenAI')) {
      return res.status(502).json({ 
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: 'Erreur serveur interne. Réessayez plus tard.' 
    });
  }
}
