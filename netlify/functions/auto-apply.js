// netlify/functions/auto-apply.js
// Génération automatique de candidatures personnalisées

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

    // Générer les candidatures pour chaque job
    const applications = await Promise.all(
      selectedJobs.map(async (job) => {
        try {
          // 1. Générer lettre de motivation personnalisée
          const coverLetter = await generateCoverLetter(apiKey, candidateProfile, job);
          
          // 2. Générer réponses aux questions de screening
          const screeningAnswers = await generateScreeningAnswers(apiKey, candidateProfile, job);
          
          // 3. Créer CV adapté (highlight compétences pertinentes)
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

// Fonction pour générer une lettre de motivation
async function generateCoverLetter(apiKey, candidate, job) {
  const prompt = `Tu es un expert en lettres de motivation. Tu dois créer une lettre PERSONNALISÉE et CONVAINCANTE.

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

RÈGLES STRICTES :
✅ 200-250 mots maximum
✅ Ton professionnel mais humain
✅ Mentionner 2-3 compétences CONCRÈTES du candidat qui matchent le poste
✅ Expliquer POURQUOI cette entreprise/ce poste (pas juste "je suis motivé")
✅ Montrer que tu as compris les enjeux du poste
✅ Terminer par call-to-action concret
❌ PAS de clichés ("dynamique", "motivé", "polyvalent" sans contexte)
❌ PAS de phrases vides
❌ PAS de fautes d'orthographe

Structure :
1. Accroche percutante (1 phrase qui marque)
2. Pourquoi moi ? (compétences + expérience concrètes)
3. Pourquoi vous ? (ce qui t'attire dans l'entreprise/poste)
4. Call-to-action

Génère UNIQUEMENT la lettre, sans formules d'introduction.`;

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
          content: "Tu es un expert en lettres de motivation qui génère des candidatures qui se démarquent vraiment."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 600,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Fonction pour générer réponses questions de screening
async function generateScreeningAnswers(apiKey, candidate, job) {
  // Si pas de questions, retourner tableau vide
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

// Fonction pour adapter le CV
function adaptCV(candidate, job) {
  // Identifier les compétences pertinentes
  const relevantSkills = (candidate.technical_skills || []).filter(skill => {
    const skillLower = skill.toLowerCase();
    return (job.required_skills || []).some(req => 
      skillLower.includes(req.toLowerCase()) || 
      req.toLowerCase().includes(skillLower)
    );
  });

  // Générer un résumé adapté
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
