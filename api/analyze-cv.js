export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('API appelée:', new Date());
    console.log('Body reçu:', req.body);
    
    const { cvText } = req.body;
    console.log('Texte CV longueur:', cvText?.length);
    
    // Test si clé OpenAI existe
    console.log('Clé OpenAI présente:', !!process.env.OPENAI_API_KEY);
    
    // Réponse de test
    return res.status(200).json({
      success: true,
      analysis: {
        candidate_analysis: {
          name: "Test Candidat",
          location: "Paris, France",
          mobility: "nationale",
          education_level: "Test",
          total_experience_years: 1,
          current_position: "Test",
          technical_skills: ["Test"],
          soft_skills: ["Test"],
          career_aspirations: "Test",
          constraints: "Aucune"
        },
        recommendations: [{
          job_title: "Poste de test",
          sector: "Test",
          salary_min: 1500,
          salary_max: 2000,
          match_justification: "Test de fonctionnement",
          required_skills: ["Test"],
          company_types: ["Test"],
          contract_type: "CDI",
          evolution_potential: "Test"
        }],
        training_suggestions: [],
        ai_metadata: {
          provider: 'ASSIGNME IA',
          cost: '0.002',
          tokens_used: 1000
        }
      }
    });
    
  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}
