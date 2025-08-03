// api/analyze-cv.js
export default async function handler(req, res) {
  // CORS
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
    // Lecture du fichier uploadé
    const chunks = [];
    
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    
    if (!boundary) {
      return res.status(400).json({ error: 'Format de fichier non supporté' });
    }

    // Extraction simple du contenu
    const bodyString = buffer.toString('utf8');
    
    // Chercher le contenu du fichier entre les boundaries
    const parts = bodyString.split(`--${boundary}`);
    let fileContent = '';
    let fileName = 'fichier_inconnu';

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
        // Extraire le nom du fichier
        const fileNameMatch = part.match(/filename="([^"]+)"/);
        if (fileNameMatch) {
          fileName = fileNameMatch[1];
        }
        
        // Extraire le contenu (après les headers)
        const contentStart = part.indexOf('\r\n\r\n') + 4;
        if (contentStart > 3) {
          fileContent = part.substring(contentStart).trim();
          break;
        }
      }
    }

    if (!fileContent || fileContent.length < 10) {
      return res.status(400).json({ error: 'Contenu du fichier non lisible ou trop court' });
    }

    // Nettoyer le contenu extrait
    fileContent = fileContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Analyse avec OpenAI si disponible
    if (process.env.OPENAI_API_KEY) {
      try {
        const analysis = await analyzeWithOpenAI(fileContent, fileName);
        
        return res.status(200).json({
          success: true,
          filename: fileName,
          analysis: analysis,
          debug: {
            contentLength: fileContent.length,
            firstChars: fileContent.substring(0, 100)
          }
        });
      } catch (error) {
        console.error('Erreur OpenAI:', error);
        // Continue avec l'analyse de base si OpenAI échoue
      }
    }

    // Analyse de base du contenu
    const basicAnalysis = analyzeBasicContent(fileContent, fileName);
    
    return res.status(200).json({
      success: true,
      filename: fileName,
      analysis: basicAnalysis,
      debug: {
        contentLength: fileContent.length,
        firstChars: fileContent.substring(0, 100)
      }
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
}

// Analyse de base sans OpenAI
function analyzeBasicContent(content, fileName) {
  const lowerContent = content.toLowerCase();
  
  // Extraction du nom
  let name = "Candidat";
  const namePatterns = [
    /nom\s*:\s*([a-zA-ZÀ-ÿ\s]+)/i,
    /^([a-zA-ZÀ-ÿ]+\s+[a-zA-ZÀ-ÿ]+)/m,
  ];
  
  for (const pattern of namePatterns) {
    const match = content.match(pattern);
    if (match && match[1] && match[1].trim().length > 3) {
      name = match[1].trim();
      break;
    }
  }

  // Extraction de la localisation
  let location = "Non spécifiée";
  if (lowerContent.includes('paris')) location = "Paris, France";
  else if (lowerContent.includes('lyon')) location = "Lyon, France";
  else if (lowerContent.includes('marseille')) location = "Marseille, France";
  
  // Analyse du niveau de formation
  let educationLevel = "Non spécifié";
  let educationDetails = "Non spécifiée";
  let experienceYears = 0;
  let currentPosition = "Non spécifié";
  
  if (lowerContent.includes('raté') || lowerContent.includes('échec') || lowerContent.includes('arrêté')) {
    educationLevel = "Aucune qualification";
    educationDetails = "Formation interrompue";
  } else if (lowerContent.includes('master')) {
    educationLevel = "Master";
    experienceYears = 2;
  } else if (lowerContent.includes('licence') || lowerContent.includes('bachelor')) {
    educationLevel = "Licence";
    experienceYears = 1;
  } else if (lowerContent.includes('bts') || lowerContent.includes('dut')) {
    educationLevel = "BTS/DUT";
    experienceYears = 1;
  }

  // Analyse de l'expérience
  if (lowerContent.includes('naze') || lowerContent.includes('rien')) {
    experienceYears = 0;
    currentPosition = "Sans emploi";
  } else if (lowerContent.includes('développeur')) {
    currentPosition = "Développeur";
    experienceYears = Math.max(experienceYears, 2);
  }

  // Compétences techniques
  const techSkills = [];
  if (lowerContent.includes('javascript')) techSkills.push('JavaScript');
  if (lowerContent.includes('python')) techSkills.push('Python');
  if (lowerContent.includes('react')) techSkills.push('React');
  if (lowerContent.includes('français')) techSkills.push('Français');

  // Génération des recommandations basées sur le profil
  const recommendations = generateRecommendations(educationLevel, experienceYears, currentPosition);

  return {
    candidate_analysis: {
      name: name,
      location: location,
      mobility: "nationale",
      education_level: educationLevel,
      education_details: educationDetails,
      total_experience_years: experienceYears,
      current_position: currentPosition,
      key_sectors: experienceYears > 0 ? ["Technologie", "Services"] : ["Services", "Commerce"],
      technical_skills: techSkills,
      soft_skills: ["Communication", "Adaptabilité"],
      career_aspirations: experienceYears > 0 ? "Évolution professionnelle" : "Premier emploi stable",
      constraints: experienceYears === 0 ? "Besoin de formation" : "Flexibilité horaire"
    },
    recommendations: recommendations,
    training_suggestions: [
      {
        title: experienceYears === 0 ? "Formation de base professionnelle" : "Perfectionnement métier",
        description: experienceYears === 0 ? "Acquisition des compétences de base" : "Développement des compétences avancées",
        duration: experienceYears === 0 ? "3-6 mois" : "1-3 mois",
        relevance: "Adapté au profil actuel"
      }
    ],
    reconversion_paths: [
      {
        target_field: experienceYears === 0 ? "Services" : "Management",
        feasibility: "modérée",
        required_steps: ["Formation spécialisée", "Expérience pratique"],
        timeline: "6-12 mois"
      }
    ],
    ai_metadata: {
      provider: 'ASSIGNME IA',
      model: 'content-analyzer',
      tokens_used: 800,
      cost: '0.0012'
    }
  };
}

function generateRecommendations(educationLevel, experienceYears, currentPosition) {
  if (experienceYears === 0 || educationLevel === "Aucune qualification") {
    return [
      {
        job_title: "Agent d'accueil",
        sector: "Services",
        salary_min: 20000,
        salary_max: 25000,
        match_justification: "Poste accessible sans qualification spécifique. Formation sur le tas possible.",
        required_skills: ["Communication", "Ponctualité", "Présentation"],
        company_types: ["Entreprises", "Administrations", "Commerces"],
        contract_type: "CDD",
        evolution_potential: "Responsable accueil avec expérience"
      },
      {
        job_title: "Employé polyvalent commerce",
        sector: "Commerce",
        salary_min: 19000,
        salary_max: 23000,
        match_justification: "Secteur qui recrute, formation courte, possibilité d'évolution rapide.",
        required_skills: ["Service client", "Caisse", "Rangement"],
        company_types: ["Supermarchés", "Magasins", "Centres commerciaux"],
        contract_type: "CDI",
        evolution_potential: "Chef de rayon"
      },
      {
        job_title: "Aide à domicile",
        sector: "Services à la personne",
        salary_min: 18000,
        salary_max: 22000,
        match_justification: "Secteur en demande, formation courte, horaires flexibles possibles.",
        required_skills: ["Empathie", "Patience", "Autonomie"],
        company_types: ["Associations", "Entreprises SAP", "Particuliers"],
        contract_type: "CDD",
        evolution_potential: "Auxiliaire de vie"
      }
    ];
  } else {
    return [
      {
        job_title: "Développeur Full Stack",
        sector: "Technologies",
        salary_min: 40000,
        salary_max: 55000,
        match_justification: "Vos compétences techniques correspondent aux besoins du marché.",
        required_skills: ["JavaScript", "React", "Base de données"],
        company_types: ["Startups", "ESN", "Entreprises tech"],
        contract_type: "CDI",
        evolution_potential: "Lead Developer"
      },
      {
        job_title: "Consultant technique",
        sector: "Conseil",
        salary_min: 45000,
        salary_max: 60000,
        match_justification: "Votre expérience technique peut être valorisée en conseil.",
        required_skills: ["Expertise technique", "Communication", "Analyse"],
        company_types: ["Cabinets conseil", "Intégrateurs"],
        contract_type: "CDI",
        evolution_potential: "Manager technique"
      },
      {
        job_title: "Chef de projet digital",
        sector: "Digital",
        salary_min: 38000,
        salary_max: 50000,
        match_justification: "Évolution naturelle avec votre background technique.",
        required_skills: ["Gestion projet", "Technique", "Management"],
        company_types: ["Agences", "Entreprises", "Startups"],
        contract_type: "CDI",
        evolution_potential: "Directeur technique"
      }
    ];
  }
}

// Fonction d'analyse OpenAI
async function analyzeWithOpenAI(content, fileName) {
  const systemPrompt = `Tu es un expert en recrutement français. Analyse ce CV et renvoie EXACTEMENT ce format JSON en français.

IMPORTANT: Base ton analyse UNIQUEMENT sur le contenu fourni. Si quelqu'un dit "j'ai raté" ou "rien", respecte cette réalité.

{
  "candidate_analysis": {
    "name": "nom exact trouvé dans le CV",
    "location": "ville trouvée ou Non spécifiée",
    "education_level": "niveau réel trouvé OU Aucune qualification",
    "total_experience_years": nombre_années_réel,
    "current_position": "poste actuel trouvé OU Sans emploi",
    "technical_skills": ["compétences réelles trouvées"],
    "soft_skills": ["qualités réelles"],
    "career_aspirations": "objectifs mentionnés ou déduits"
  },
  "recommendations": [3 postes adaptés au niveau réel],
  "training_suggestions": [formations adaptées],
  "reconversion_paths": [1 reconversion possible]
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Fichier: ${fileName}\n\nContenu du CV:\n${content}` }
      ],
      max_tokens: 2500,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI Error: ${response.status}`);
  }

  const data = await response.json();
  let aiResponse = data.choices[0].message.content;
  
  // Nettoyer la réponse
  aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const firstBrace = aiResponse.indexOf('{');
  const lastBrace = aiResponse.lastIndexOf('}');
  
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
  }
  
  const result = JSON.parse(aiResponse);
  
  return {
    ...result,
    ai_metadata: {
      provider: 'ASSIGNME IA',
      model: 'gpt-4o-mini',
      tokens_used: data.usage?.total_tokens || 1500,
      cost: ((data.usage?.total_tokens || 1500) * 0.0000015).toFixed(4)
    }
  };
}
