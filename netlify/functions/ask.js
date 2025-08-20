// netlify/functions/ask.js
// Q&A multilingue basé EXCLUSIVEMENT sur assignme.pdf, avec recherche sémantique (embeddings) + GPT.
// - Si l'info n'est pas dans le PDF -> répond exactement : "Ce point n'est pas précisé dans le dossier."
// - Répond dans la langue de la question.
// Prérequis : mettre assignme.pdf à la racine du site + OPENAI_API_KEY dans Netlify (Environment variables).

const pdfParse = require('pdf-parse');

// --- Config modèles OpenAI ---
const CHAT_MODEL = 'gpt-4o-mini';
const EMBED_MODEL = 'text-embedding-3-large'; // multilingue, qualité élevée

// --- CORS ---
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// --- Caches (persistent tant que la lambda reste "chaude") ---
let PDF_TEXT_CACHE = null;
let CHUNKS = null;           // tableau de chaînes (chunks de texte)
let EMBEDS = null;           // tableau de vecteurs embeddings (Float32Array)
let EMBED_NORMS = null;      // norme (float) de chaque vecteur (pour cosine)
let INDEX_READY = false;

// --------------------- Utils texte ---------------------
function normalizeText(s) {
  return (s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Découper en paragraphes, puis assembler en chunks ~1200-1600 caractères
 * avec un léger recouvrement (reprise du paragraphe précédent) pour le contexte.
 */
function makeChunks(text, target = 1400) {
  const paras = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < paras.length) {
    let chunk = '';
    let j = i;
    while (j < paras.length && (chunk.length + (chunk ? 2 : 0) + paras[j].length) <= target) {
      chunk += (chunk ? '\n\n' : '') + paras[j];
      j++;
    }
    if (!chunk) { // paragraphe plus long que target : tronquer
      chunk = paras[i].slice(0, target);
      j = i + 1;
    }
    out.push(chunk);
    // recouvrement d'un paragraphe pour la fenêtre suivante
    i = Math.max(j - 1, j);
  }
  return out;
}

// --------------------- OpenAI helpers ---------------------
async function openAI(path, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant dans Netlify > Site settings > Environment');
  const resp = await fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${txt.slice(0, 400)}`);
  }
  return resp.json();
}

async function embedBatch(texts) {
  const data = await openAI('embeddings', { model: EMBED_MODEL, input: texts });
  // retourne un tableau de Float32Array
  return data.data.map(d => Float32Array.from(d.embedding));
}

function l2norm(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.sqrt(s);
}

function cosineSim(a, aNorm, b, bNorm) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
}

// --------------------- Indexation PDF ---------------------
async function fetchPdfText(baseUrl) {
  if (PDF_TEXT_CACHE) return PDF_TEXT_CACHE;
  const pdfUrl = `${baseUrl}/assignme.pdf`; // le PDF doit être à la racine du site
  const resp = await fetch(pdfUrl);
  if (!resp.ok) throw new Error(`Impossible de charger assignme.pdf (${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const pdf = await pdfParse(buf);
  PDF_TEXT_CACHE = normalizeText(pdf.text || '');
  return PDF_TEXT_CACHE;
}

async function buildIndex(baseUrl) {
  if (INDEX_READY && CHUNKS && EMBEDS && EMBED_NORMS) return;

  const text = await fetchPdfText(baseUrl);
  CHUNKS = makeChunks(text, 1400);

  // Embeddings par batchs pour éviter des requêtes trop grosses
  EMBEDS = [];
  const BATCH = 64;
  for (let i = 0; i < CHUNKS.length; i += BATCH) {
    const batch = CHUNKS.slice(i, i + BATCH);
    const E = await embedBatch(batch);
    EMBEDS.push(...E);
  }
  EMBED_NORMS = EMBEDS.map(v => l2norm(v));
  INDEX_READY = true;
}

// --------------------- Récupération de contexte ---------------------
async function topKContext(question, k = 8) {
  // Embedding de la question
  const qVec = (await embedBatch([question]))[0];
  const qNorm = l2norm(qVec);

  // score chaque chunk
  const scored = EMBEDS.map((vec, idx) => ({
    idx,
    score: cosineSim(qVec, qNorm, vec, EMBED_NORMS[idx])
  })).sort((a, b) => b.score - a.score);

  // seuil simple pour filtrer les questions hors-sujet
  const THRESH = 0.22; // ajuste si besoin (0.18..0.28)
  const hits = scored.filter(s => s.score >= THRESH).slice(0, k);
  return hits.map(h => ({ score: h.score, text: CHUNKS[h.idx] }));
}

// --------------------- Appel GPT avec garde-fous ---------------------
async function answerWithGPT(question, contextTexts) {
  if (!contextTexts || contextTexts.length === 0) {
    return "Ce point n'est pas précisé dans le dossier.";
  }

  // Construit un contexte compact (max ~10k chars)
  let context = '';
  for (const c of contextTexts) {
    if ((context.length + c.text.length + 2) > 10000) break;
    context += (context ? '\n\n' : '') + c.text.trim();
  }

  const system = [
    "Tu es l’assistant d’ASSIGNME. ",
    "Tu dois répondre UNIQUEMENT à partir du CONTEXTE fourni (extraits du dossier). ",
    "Si l’information n’y figure pas, réponds exactement : \"Ce point n'est pas précisé dans le dossier.\" ",
    "Réponds dans la langue de la question, de façon concise et précise."
  ].join('');

  const user = `CONTEXTE:
"""
${context}
"""

QUESTION:
${question}
`;

  const data = await openAI('chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const raw = (data?.choices?.[0]?.message?.content || '').trim();
  if (!raw) return "Ce point n'est pas précisé dans le dossier.";

  // Garde-fou supplémentaire : si la réponse ressemble à une supposition ➜ no-answer
  const lowered = raw.toLowerCase();
  const ban = [
    "je pense que", "il est probable", "il semble que", "peut-être",
    "je ne suis pas sûr", "je ne suis pas certaine", "je ne sais pas",
    "i think", "maybe", "probably", "not sure"
  ];
  if (ban.some(b => lowered.includes(b))) {
    return "Ce point n'est pas précisé dans le dossier.";
  }

  return raw;
}

// --------------------- Handler Netlify ---------------------
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const { question = '' } = JSON.parse(event.body || '{}');
    const q = (question || '').trim();
    if (!q) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing \"question\"' }) };

    // URL du site (même origine)
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host  = event.headers['x-forwarded-host'] || event.headers['host'];
    const baseUrl = `${proto}://${host}`;

    // 1) Construire/charger l’index embeddings du PDF
    await buildIndex(baseUrl);

    // 2) Récupérer les meilleurs extraits par similarité sémantique
    const hits = await topKContext(q, 8);

    // 3) Si rien n’est pertinent, retour direct no-answer
    if (!hits || hits.length === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer: "Ce point n'est pas précisé dans le dossier." }) };
    }

    // 4) Appeler GPT contraint par le contexte
    const answer = await answerWithGPT(q, hits);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
