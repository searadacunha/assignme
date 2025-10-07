// netlify/functions/auto-apply.js
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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const { candidateProfile, selectedJobs } = JSON.parse(event.body);
    
    if (!candidateProfile || !selectedJobs || selectedJobs.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Profil candidat et jobs requis' })
      };
    }

    console.log(`Génération de ${selectedJobs.length} candidatures...`);

    const applications = await Promise.all(
      selectedJobs.map(async (job) => {
        try {
          const coverLetter = await generateCoverLetter(apiKey, candidateProfile, job);
          const screeningAnswers = await generateScreeningAnswers(apiKey, candidateProfile, job);
          const adaptedCV = adaptCV(candidateProfile, job);
          
          return {
            job_id: job.id,
            company: job.company,
            position: job.job_title,
            location: job.location,
            cover_letter: coverLetter,
            adapted_cv: adaptedCV,
            screening_answers: screeningAnswers,
            application_url: job.france_travail_url || '#',
            ready_to_send: true,
            generated_at: new Date().toISOString(),
            status: 'draft'
          };
          
        } catch (error) {
          console.error(`Erreur génération pour ${job.job_title}:`, error);
          return {
            job_id: job.id,
            company: job.company,
            position: job.job_title,
            error: error.message,
            ready_to_send: false
          };
        }
      })
    );

    const successCount = applications.filter(a => a.ready_to_send).length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        applications: applications,
        summary: {
          total: selectedJobs.length,
          generated: successCount,
          failed: selectedJobs.length - successCount
        },
        message: `${successCount} candidatures générées avec succès`
      })
    };

  } catch (error) {
    console.error('Erreur fonction auto-apply:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur interne',
        details: error.message 
      })
    };
  }
};

async function generateCoverLetter(apiKey, candidate, job) {
  const prompt = `Tu es un expert en lettres de motivation professionnelles. Tu dois créer une lettre STRUCTURÉE, CONVAINCANTE et PERSONNALISÉE.

PROFIL CANDIDAT :
- Nom: ${candidate.name}
- Expérience: ${candidate.total_experience_years} ans
- Poste actuel: ${candidate.current_position}
- Compétences clés: ${candidate.technical_skills?.slice(0, 5).join(', ') || 'Non spécifié'}
- Qualités: ${candidate.soft_skills?.slice(0, 3).join(', ') || 'Non spécifié'}
- Formation: ${candidate.education_level}
- Localisation: ${candidate.location}

POSTE VISÉ :
- Titre: ${job.job_title}
- Entreprise: ${job.company}
- Lieu: ${job.location}
- Type contrat: ${job.contract_type}
- Description: ${job.description?.substring(0, 400) || 'Non disponible'}
- Compétences requises: ${job.required_skills?.join(', ') || 'Non spécifié'}

STRUCTURE OBLIGATOIRE :

1. EN-TÊTE :
   ${candidate.name}
   ${candidate.location}
   [Email/Téléphone si disponible]
   
   ${job.company}
   À l'attention du Service Recrutement
   ${job.location}
   
   Objet : Candidature au poste de ${job.job_title}

2. FORMULE D'APPEL :
   "Madame, Monsieur,"

3. CORPS DE LA LETTRE (250-300 mots) :
   
   Premier paragraphe - Accroche (2-3 phrases) :
   - Mentionner le poste exact
   - Expliquer pourquoi cette opportunité vous intéresse
   - Faire le lien avec votre profil
   
   Deuxième paragraphe - Expérience et compétences (3-4 phrases) :
   - Mettre en avant 2-3 expériences/compétences CONCRÈTES qui matchent le poste
   - Utiliser des exemples précis de votre parcours
   - Démontrer la valeur ajoutée que vous apportez
   
   Troisième paragraphe - Motivation et connaissance de l'entreprise (2-3 phrases) :
   - Expliquer pourquoi cette entreprise en particulier
   - Mentionner ce qui vous attire dans leur activité/valeurs/projets
   - Faire le lien avec vos aspirations professionnelles
   
   Paragraphe de clôture (1-2 phrases) :
   - Exprimer votre disponibilité pour un entretien
   - Remercier pour l'attention portée à votre candidature

4. FORMULE DE POLITESSE :
   "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées."

5. SIGNATURE :
   ${candidate.name}

RÈGLES STRICTES :
- Ton professionnel mais humain, pas robotique
- Pas de clichés vides ("dynamique", "motivé" sans contexte)
- Utiliser le "je" de manière équilibrée
- Être spécifique et concret dans les exemples
- Adapter le vocabulaire au secteur d'activité
- Vérifier la cohérence entre profil et poste
- TOUJOURS inclure formule d'appel et formule de politesse

Génère la lettre complète maintenant.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en recrutement français qui rédige des lettres de motivation professionnelles, structurées et convaincantes. Tu respectes toujours les codes de la correspondance professionnelle française."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function generateScreeningAnswers(apiKey, candidate, job) {
  if (!job.screening_questions || job.screening_questions.length === 0) {
    return [];
  }

  const prompt = `Tu réponds aux questions de pré-qualification pour une candidature.

PROFIL : ${candidate.name}, ${candidate.total_experience_years} ans d'expérience en ${candidate.current_position}
Compétences: ${candidate.technical_skills?.join(', ')}

QUESTIONS :
${job.screening_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Réponds de manière CONCISE, PROFESSIONNELLE et HONNÊTE.
Format JSON : [{"question": "...", "answer": "..."}]`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu réponds aux questions de pré-qualification de manière concise et professionnelle."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 400,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return [];
  }
}

function adaptCV(candidate, job) {
  const relevantSkills = (candidate.technical_skills || []).filter(skill => {
    const skillLower = skill.toLowerCase();
    return (job.required_skills || []).some(req => 
      skillLower.includes(req.toLowerCase()) || 
      req.toLowerCase().includes(skillLower)
    );
  });

  const summary = relevantSkills.length > 0
    ? `${candidate.current_position} avec ${candidate.total_experience_years} ans d'expérience, spécialisé(e) en ${relevantSkills.slice(0, 3).join(', ')}`
    : `${candidate.current_position} avec ${candidate.total_experience_years} ans d'expérience`;

  return {
    name: candidate.name,
    location: candidate.location,
    experience_years: candidate.total_experience_years,
    summary: summary,
    skills_highlighted: relevantSkills.length > 0 ? relevantSkills : candidate.technical_skills?.slice(0, 5) || [],
    soft_skills: candidate.soft_skills?.slice(0, 3) || [],
    education: candidate.education_level,
    current_position: candidate.current_position,
    match_explanation: `Profil adapté pour ${job.job_title} chez ${job.company}`
  };
}
