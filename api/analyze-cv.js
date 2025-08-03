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

  // Pour l'instant, renvoie des données de test
  // TODO: Implémenter la vraie analyse avec OpenAI
  try {
    const mockAnalysis = {
      candidate_analysis: {
        name: "Candidat Test",
        location: "Paris, France",
        mobility: "nationale",
        education_level: "Master",
        education_details: "Master en Informatique - 2023",
        total_experience_years: 3,
        current_position: "Développeur Web",
        key_sectors: ["Technologie", "Développement Web"],
        technical_skills: ["JavaScript", "React", "Node.js", "Python"],
        soft_skills: ["Communication", "Travail en équipe", "Résolution de problèmes"],
        career_aspirations: "Évolution vers un poste de Lead Developer",
        constraints: "Télétravail partiel souhaité"
      },
      recommendations: [
        {
          job_title: "Développeur Full Stack Senior",
          sector: "Technologies de l'information",
          salary_min: 45000,
          salary_max: 55000,
          match_justification: "Votre expérience en JavaScript et React correspond parfaitement aux exigences de ce poste. Votre souhait d'évolution vers un rôle de leadership s'aligne avec les perspectives d'évolution offertes.",
          required_skills: ["JavaScript", "React", "Node.js", "Base de données"],
          company_types: ["Startups", "ESN", "Entreprises tech"],
          contract_type: "CDI",
          evolution_potential: "Lead Developer dans 2-3 ans"
        },
        {
          job_title: "Développeur Frontend React",
          sector: "E-commerce",
          salary_min: 40000,
          salary_max: 50000,
          match_justification: "Votre expertise React est très recherchée dans le secteur e-commerce. Ce poste offre la flexibilité de télétravail que vous recherchez.",
          required_skills: ["React", "JavaScript", "CSS", "Git"],
          company_types: ["E-commerce", "Retail tech"],
          contract_type: "CDI",
          evolution_potential: "Architect Frontend"
        },
        {
          job_title: "Consultant Technique",
          sector: "Conseil en technologies",
          salary_min: 50000,
          salary_max: 60000,
          match_justification: "Vos compétences techniques variées et votre capacité de communication font de vous un excellent candidat pour le conseil technique.",
          required_skills: ["JavaScript", "Python", "Communication client"],
          company_types: ["Cabinets de conseil", "Intégrateurs"],
          contract_type: "CDI",
          evolution_potential: "Manager technique"
        }
      ],
      training_suggestions: [
        {
          title: "Formation DevOps et Cloud",
          description: "Complétez votre profil avec des compétences en déploiement et infrastructure cloud",
          duration: "3-6 mois",
          relevance: "Très demandé pour l'évolution vers des postes seniors"
        },
        {
          title: "Management et Leadership",
          description: "Développez vos compétences managériales pour votre objectif de Lead Developer",
          duration: "2-4 mois",
          relevance: "Essentiel pour l'évolution vers des postes de leadership"
        }
      ],
      reconversion_paths: [
        {
          target_field: "Product Management",
          feasibility: "modérée",
          required_steps: ["Formation Product Management", "Stage dans une équipe produit"],
          timeline: "6-12 mois"
        }
      ],
      ai_metadata: {
        provider: 'ASSIGNME IA',
        model: 'demo-version',
        tokens_used: 1500,
        cost: '0.0023'
      }
    };

    res.status(200).json({
      success: true,
      filename: "CV_test.pdf",
      analysis: mockAnalysis
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
}
