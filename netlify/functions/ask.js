// netlify/functions/ask.js
// Q&A multilingue basé EXCLUSIVEMENT sur assignme.pdf, avec recherche sémantique (embeddings) + GPT.
// + Fallback "avis" (hors dossier) pour les questions subjectives (ex. "c'est révolutionnaire ?").
// - Si l'info n'est pas dans le PDF ET que la question n'est pas subjective -> "Ce point n'est pas précisé dans le dossier."
// - Répond dans la langue de la question.
// Prérequis : assignme.pdf à la racine du site + OPENAI_API_KEY dans Netlify (Environment variables).

const pdfParse = require('pdf-parse');

const CHAT_MODEL  = 'gpt-4o-mini';
const EMBED_MODEL = 'text-embedding-3-large';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Caches (tant que la lambda reste chaude)
let PDF_TEXT_CACHE = null;
let CHUNKS = null;
let EMBEDS = null;       // Float32Array[]
let EMBED_NORMS = null;  // number[]
let INDEX_READY = false;

function normalizeText(s) {
  return (s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Découpe en chunks ~1400 chars avec léger recouvrement
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
    if (!chunk) { chunk = paras[i].slice(0, target); j = i + 1; }
    out.push(chunk);
    i = Math.max(j - 1, j); // recouvrement d'1 paragraphe
  }
  return out;
}

// ------------ OpenAI helpers ------------
async function openAI(path, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant dans Netlify > Environment');
  const resp = await fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
  return data.data.map(d => Float32Array.from(d.embedding));
}
function l2norm(vec) { let s=0; for (let i=0;i<vec.length;i++) s+=vec[i]*vec[i]; return Math.sqrt(s); }
function cosineSim(a, aN, b, bN) { let dot=0; for (let i=0;i<a.length;i++) dot+=a[i]*b[i]; return dot/(aN*bN); }

// ------------ Index PDF ------------
async function fetchPdfText(baseUrl) {
  if (PDF_TEXT_CACHE) return PDF_TEXT_CACHE;
  const pdfUrl = `${baseUrl}/assignme.pdf`;
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

  EMBEDS = [];
  const BATCH = 64;
  for (let i=0;i<CHUNKS.length;i+=BATCH) {
    const batch = CHUNKS.slice(i, i+BATCH);
    const E = await embedBatch(batch);
    EMBEDS.push(...E);
  }
  EMBED_NORMS = EMBEDS.map(v => l2norm(v));
  INDEX_READY = true;
}

// ------------ Recherche sémantique ------------
async function topKContext(question, k = 8) {
  const qVec  = (await embedBatch([question]))[0];
  const qNorm = l2norm(qVec);
  const scored = EMBEDS.map((vec, idx) => ({
    idx, score: cosineSim(qVec, qNorm, vec, EMBED_NORMS[idx])
  })).sort((a,b)=> b.score - a.score);

  const THRESH = 0.22; // ajuste si besoin
  const hits = scored.filter(s => s.score >= THRESH).slice(0, k);
  return hits.map(h => ({ score: h.score, text: CHUNKS[h.idx] }));
}

// ------------ Détection question subjective ------------
function isSubjective(question) {
  const q = question.toLowerCase();
  const patterns = [
    'révolutionnaire', 'innovant', 'ton avis', 'tu en penses quoi', 'tu penses quoi',
    'penses-tu', 'subjectif', 'est-ce incroyable', 'game changer',
    'is it revolutionary', 'what do you think', 'do you think', 'opinion', 'subjective'
  ];
  return patterns.some(p => q.includes(p));
}

// ------------ Réponses GPT ------------
async function answerStrict(question, contextTexts) {
  if (!contextTexts || contextTexts.length === 0) return "Ce point n'est pas précisé dans le dossier.";

  let context = '';
  for (const c of contextTexts) {
    if ((context.length + c.text.length + 2) > 10000) break;
    context += (context ? '\n\n' : '') + c.text.trim();
  }

  const system = [
    "Tu es l’assistant d’ASSIGNME.",
    "Réponds UNIQUEMENT à partir du CONTEXTE fourni (extraits du dossier).",
    "Si l’information n’y figure pas, réponds exactement : \"Ce point n'est pas précisé dans le dossier.\"",
    "Réponds dans la langue de la question, de façon concise et précise."
  ].join(' ');

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
      { role: 'user',   content: user }
    ]
  });

  const raw = (data?.choices?.[0]?.message?.content || '').trim();
  return raw || "Ce point n'est pas précisé dans le dossier.";
}

async function answerOpinion(question, contextTexts) {
  // On peut utiliser les mots-clés repérés dans le contexte (s'il y en a) comme "indices",
  // mais on ne doit PAS affirmer des faits absents du dossier.
  let hints = '';
  if (contextTexts && contextTexts.length) {
    const joined = contextTexts.map(c => c.text).join('\n\n').slice(0, 2000);
    hints = `INDICES (extraits du dossier, ne pas inventer de faits) :
"""
${joined}
"""`;
  }

  const system = [
    "Tu donnes un avis COURT et équilibré, en te basant sur des critères généraux de l'innovation (impact, différenciation, mise à l'échelle, preuves).",
    "NE PAS inventer de faits non présents dans le dossier.",
    "Si tu n'as pas assez d’éléments, formule un avis prudent (conditionnel) sans inventer.",
    "Toujours répondre dans la langue de la question."
  ].join(' ');

  const user = `${hints}

QUESTION (avis) :
${question}

Consigne :
- 3 à 5 phrases maximum.
- Si le dossier ne donne pas d'éléments factuels, dis-le clairement et garde l'avis hypothétique (ex: \"potentiellement\", \"si les résultats annoncés se confirment\").`;

  const data = await openAI('chat/completions', {
    model: CHAT_MODEL,
    temperature: 0.5,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user }
    ]
  });

  const raw = (data?.choices?.[0]?.message?.content || '').trim();
  // Sécurité : si le modèle part trop en spéculation brute
  const lowered = raw.toLowerCase();
  const risky = ["je pense que", "il est probable", "il semble que", "maybe", "probably"];
  if (!raw || risky.some(x => lowered.startsWith(x))) {
    return "Ce point n'est pas précisé dans le dossier.";
  }
  return raw;
}

// ------------ Handler Netlify ------------
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

    // URL du site pour charger le PDF
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host  = event.headers['x-forwarded-host'] || event.headers['host'];
    const baseUrl = `${proto}://${host}`;

    // 1) Index embeddings du PDF
    await buildIndex(baseUrl);

    // 2) Contexte sémantique
    const hits = await topKContext(q, 8);

    // 3) Réponse stricte depuis le dossier
    let answer = await answerStrict(q, hits);

    // 4) Si pas d'info ET question subjective -> donner un "avis" court (hors dossier, mais prudent)
    const NO_ANSWER = "Ce point n'est pas précisé dans le dossier.";
    if ((answer === NO_ANSWER || !answer) && isSubjective(q)) {
      answer = await answerOpinion(q, hits);
    }

    // 5) Si toujours rien -> no-answer
    if (!answer) answer = NO_ANSWER;

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
