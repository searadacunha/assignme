// api/analyze-cv.js - API finale qui analyse VRAIMENT les CV
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
    console.log('API appelée:', new Date().toISOString());
    
    const { cvText, fileName } = req.body;
    console.log('Fichier reçu:', fileName);
    console.log('Longueur du CV:', cvText?.length);
    console.log('Extrait du CV:', cvText?.substring(0, 200));

    if (!cvText || cvText.trim().length < 50) {
      return res.status(400).json({ error: 'CV trop court ou vide' });
    }

    // Vérification de la clé OpenAI
    if (!process.env.OPENAI_API_KEY) {
      console.error('Clé OpenAI manquante');
      return res.status(500).json({ error: 'Configuration serveur manquante' });
    }

    console.log('Clé OpenAI présente:', process.env.OPENAI_API_KEY.substring(0, 20) + '...');

    // Prompt système pour l'analyse RÉELLE
    const systemPrompt = `Tu es un expert en recrutement et orientation professionnelle français. Tu vas analyser un CV et recommander 3 opportunités professionnelles pertinentes.

IMPORTANT : RÉPONDS UNIQUEMENT EN FRANÇAIS. Toutes tes réponses doivent être dans un français parfait et professionnel.

RÈGLES D'ANALYSE STRICTES :
• Si le candidat dit clairement "rien", "naze", "j'ai raté", "aucune expérience" → NE PAS INVENTER de compétences ou qualités
• Si formation = "j'ai raté le brevet" ou équivalent → education_level = "Aucune qualification"
• Si expérience = "rien" ou "naze" → current_position = "Sans emploi" et total_experience_years = 0
• Si aspirations = "argent facile" → career_aspirations = "Recherche d'emploi rémunérateur"
• ÊTRE HONNÊTE sur le niveau réel du candidat, ne pas embellir
• ANALYSER LE CONTENU RÉEL du CV fourni, ne pas inventer

RÉPONDS UNIQUEMENT EN JSON VALIDE AVEC TOUT LE CONTENU EN FRANÇAIS :

{
  "candidate_analysis": {
    "name": "nom_exact_du_candidat_dans_le_CV",
    "location": "ville_mentionnée_dans_le_CV",
    "mobility": "locale|nationale|internationale",
    "education_level": "niveau_REEL_mentionné_dans_le_CV",
    "education_details": "formation_EXACTE_mentionnée_dans_le_CV",
    "total_experience_years": nombre_années_REEL_calculé,
    "current_position": "poste_REEL_ou_Sans_emploi",
    "key_sectors": ["secteurs_REELS_du_CV"],
    "technical_skills": ["compétences_REELLES_du_CV"],
    "soft_skills": ["qualités_REELLES_déduites_du_CV"],
    "career_aspirations": "objectifs_REELS_mentionnés_dans_le_CV",
    "constraints": "contraintes_REELLES_mentionnées"
  },
  "recommendations": [
    {
      "job_title": "Poste adapté au niveau REEL",
      "sector": "Secteur approprié",
      "salary_min": montant_REALISTE_pour_le_niveau,
      "salary_max": montant_REALISTE_pour_le_niveau,
      "match_justification": "Justification basée sur le CV REEL",
      "required_skills": ["compétences_nécessaires"],
      "company_types": ["types_entreprises"],
      "contract_type": "CDI|CDD|Stage",
      "evolution_potential": "évolution_possible"
    },
    {
      "job_title": "2ème recommandation adaptée",
      "sector": "Secteur",
      "salary_min": montant_min,
      "salary_max": montant_max,
      "match_justification": "Justification",
      "required_skills": ["compétences"],
      "company_types": ["types"],
      "contract_type": "type",
      "evolution_potential": "évolution"
    },
    {
      "job_title": "3ème recommandation adaptée",
      "sector": "Secteur",
      "salary_min": montant_min,
      "salary_max": montant_max,
      "match_justification": "Justification",
      "required_skills": ["compétences"],
      "company_types": ["types"],
      "contract_type": "type",
      "evolution_potential": "évolution"
    }
  ],
  "training_suggestions": [
    {
      "title": "Formation adaptée au niveau REEL",
      "description": "Description",
      "duration": "durée",
      "relevance": "utilité"
    }
  ]
}`;

    // Requête à OpenAI avec le contenu REEL du CV
    const requestData = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `ANALYSE CE CV EXACTEMENT COMME IL EST ÉCRIT. Ne pas inventer ou embellir. Utilise uniquement les informations présentes dans ce CV :

${cvText}

Analyse ce CV et donne des recommandations adaptées au niveau RÉEL du candidat.`
        }
      ],
      max_tokens: 3000,
      temperature: 0.1  // Température basse pour plus de précision
    };

    console.log('Envoi à OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    console.log('Réponse OpenAI status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Erreur OpenAI:', errorData);
      
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
    console.log('Tokens utilisés:', data.usage?.total_tokens);
    
    let aiResponse = data.choices[0].message.content;
    console.log('Réponse IA reçue, longueur:', aiResponse.length);
    console.log('Début de la réponse:', aiResponse.substring(0, 300));
    
    // Nettoyer la réponse JSON
    aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }
    
    console.log('Parsing JSON...');
    const result = JSON.parse(aiResponse);
    console.log('Nom analysé:', result.candidate_analysis?.name);
    console.log('Niveau détecté:', result.candidate_analysis?.education_level);
    
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
    
    console.log('Analyse terminée avec succès');
    
    return res.status(200).json({
      success: true,
      filename: fileName,
      analysis: finalResult
    });

  } catch (error) {
    console.error('Erreur complète:', error);
    
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
      error: 'Erreur serveur interne: ' + error.message 
    });
  }
}
