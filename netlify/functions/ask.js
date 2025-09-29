// netlify/functions/ask.js
// Q&A via GPT basÃ© sur assignme.pdf (RAG avec TF-IDF)
// NÃ©cessite: OPENAI_API_KEY dans les variables d'environnement
// Place assignme.pdf Ã  la racine du site (Ã  cÃ´tÃ© d'index.html)

const pdfParse = require('pdf-parse');

// Cache entre les invocations
let INDEX = null; // { blocks:[{text, tf:Map}], idf:Map, N:int, builtFrom:string }

function normalizeText(s){
  return s
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tokenize(s){
  const noAccents = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokens = noAccents.toLowerCase().match(/[a-z0-9]+/g) || [];
  return tokens;
}

function splitBlocks(text){
  const raw = text.split(/\n{2,}/g).map(b => b.trim()).filter(Boolean);
  const blocks = [];
  for (let i=0; i<raw.length; i++){
    const b = raw[i];
    if (b.length < 60 && i+1 < raw.length){
      blocks.push((b + '\n' + raw[i+1]).trim());
      i++;
    } else {
      blocks.push(b);
    }
  }
  return blocks;
}

function scoreBlock(block, qTokens, idf){
  let s = 0;
  for (const t of qTokens){
    const tf = block.tf.get(t) || 0;
    const w = idf.get(t) || 0;
    s += tf * w;
  }
  return s;
}

function uniq(arr){ return [...new Set(arr)] }

async function fetchPdfBuffer(baseUrl){
  const pdfUrl = `${baseUrl}/assignme.pdf`;
  const resp = await fetch(pdfUrl);
  if (!resp.ok) throw new Error(`Impossible de rÃ©cupÃ©rer le PDF ASSIGNME: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function buildIndexFrom(baseUrl){
  const buf = await fetchPdfBuffer(baseUrl);
  const pdf = await pdfParse(buf);
  const text = normalizeText(pdf.text || '');
  
  const blocks = splitBlocks(text).map(t => {
    const tf = new Map();
    for (const tok of tokenize(t)) tf.set(tok, (tf.get(tok)||0)+1);
    return { text: t, tf };
  });
  
  const df = new Map();
  for (const b of blocks){
    for (const tok of b.tf.keys()) df.set(tok, (df.get(tok)||0)+1);
  }
  
  const N = blocks.length;
  const idf = new Map();
  for (const [tok, dfi] of df.entries()){
    idf.set(tok, Math.log((N+1)/(dfi+1)) + 1);
  }
  
  INDEX = { blocks, idf, N, builtFrom: baseUrl };
  return INDEX;
}

async function ensureIndex(baseUrl){
  if (INDEX && INDEX.builtFrom === baseUrl) return INDEX;
  return buildIndexFrom(baseUrl);
}

async function callOpenAI(context, question){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant dans la configuration');

  const system = `Tu es l'assistant IA officiel d'ASSIGNME, une startup franÃ§aise DeepTech spÃ©cialisÃ©e dans le recrutement par intelligence artificielle.

INSTRUCTIONS IMPORTANTES :
1. RÃ©ponds UNIQUEMENT Ã  partir du CONTEXTE fourni ci-dessous
2. Si l'information n'est pas dans le contexte, rÃ©ponds exactement: "Ce point n'est pas prÃ©cisÃ© dans le dossier ASSIGNME."
3. Sois prÃ©cis, professionnel et enthousiaste sur le projet ASSIGNME
4. Utilise un ton accessible mais expert
5. RÃ©ponds en franÃ§ais

CONTEXTE SPÃ‰CIFIQUE :
- Benjamin Da Cunha est le CEO et fondateur d'ASSIGNME
- ASSIGNME est une innovation DeepTech franÃ§aise
- La plateforme rÃ©volutionne le recrutement par l'IA
- Recherche active de financement pour levÃ©e de fonds
- MVP en dÃ©veloppement avec dÃ©monstrateur en ligne`;

  const user = `CONTEXTE ASSIGNME:
"""
${context}
"""

QUESTION:
${question}

RÃ©ponds de maniÃ¨re claire et engageante en te basant uniquement sur le contexte fourni.`;

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.3,
    max_tokens: 400
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok){
    const errorText = await resp.text();
    if (resp.status === 429) {
      throw new Error('Limite de requÃªtes OpenAI atteinte. RÃ©essayez dans quelques minutes.');
    }
    if (resp.status === 401) {
      throw new Error('ClÃ© API OpenAI invalide');
    }
    throw new Error(`Erreur OpenAI ${resp.status}: ${errorText.slice(0,200)}`);
  }
  
  const data = await resp.json();
  const answer = (data?.choices?.[0]?.message?.content || '').trim();
  return answer || "Ce point n'est pas prÃ©cisÃ© dans le dossier ASSIGNME.";
}

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

exports.handler = async (event, context) => {
  try {
    // Gestion CORS
    if (event.httpMethod === 'OPTIONS'){
      return { 
        statusCode: 200, 
        headers: corsHeaders(), 
        body: 'OK' 
      };
    }
    
    if (event.httpMethod !== 'POST'){
      return { 
        statusCode: 405, 
        headers: corsHeaders(), 
        body: JSON.stringify({ error: 'MÃ©thode non autorisÃ©e' })
      };
    }

    // Parse de la question
    const body = JSON.parse(event.body || '{}');
    const question = (body.question || '').trim();
    
    if (!question){
      return { 
        statusCode: 400, 
        headers: corsHeaders(), 
        body: JSON.stringify({ error: 'Question manquante' })
      };
    }

    // DÃ©tection de l'URL de base
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${event.headers.host}`;

    // Construction/rÃ©cupÃ©ration de l'index du PDF
    const { blocks, idf } = await ensureIndex(base);

    // Recherche TF-IDF des blocs pertinents
    let qTokens = tokenize(question).filter(t => t.length >= 2);
    qTokens = uniq(qTokens);
    
    const scored = blocks.map((b,i) => ({
      i, 
      s: scoreBlock(b, qTokens, idf), 
      text: b.text
    })).sort((a,b) => b.s - a.s);

    // SÃ©lection des meilleurs blocs
    const K = 8; // Plus de contexte pour de meilleures rÃ©ponses
    const hits = scored.filter(x => x.s > 0).slice(0, K);
    
    if (hits.length === 0){
      return { 
        statusCode: 200, 
        headers: corsHeaders(), 
        body: JSON.stringify({ 
          answer: "Ce point n'est pas prÃ©cisÃ© dans le dossier ASSIGNME." 
        })
      };
    }

    // Construction du contexte
    const MAX_CONTEXT = 6000;
    let ctx = '';
    for (const h of hits){
      const chunk = h.text.trim();
      if ((ctx.length + chunk.length + 2) > MAX_CONTEXT) break;
      ctx += (ctx ? '\n\n' : '') + chunk;
    }

    // GÃ©nÃ©ration de la rÃ©ponse avec GPT
    const answer = await callOpenAI(ctx, question);

    // VÃ©rification de pertinence (anti-hallucination basique)
    const hasOverlap = qTokens.some(t => ctx.toLowerCase().includes(t));
    const isLongAnswer = answer.split(/\s+/).length > 50;
    
    const finalAnswer = (!hasOverlap && isLongAnswer)
      ? "Ce point n'est pas prÃ©cisÃ© dans le dossier ASSIGNME."
      : answer;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ 
        answer: finalAnswer,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Erreur fonction ask:', err);
    
    return { 
      statusCode: 500, 
      headers: corsHeaders(), 
      body: JSON.stringify({ 
        error: err.message.includes('PDF') 
          ? 'Le dossier ASSIGNME est temporairement indisponible'
          : 'Erreur lors du traitement de votre question'
      })
    };
  }
};
