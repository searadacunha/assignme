// netlify/functions/ask.js
// Q&A basé sur ton PDF assignme.pdf + GPT (répond UNIQUEMENT si l'info est dans le dossier)
const pdfParse = require('pdf-parse');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Cache en mémoire entre invocations
let PDF_TEXT_CACHE = null;
let INDEX = null; // { blocks:[{text, tf}], idf:Map, N:number }

function normalizeText(s) {
  return (s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function tokenize(s) {
  const noAccents = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (noAccents.toLowerCase().match(/[a-z0-9]+/g) || []);
}
function splitBlocks(text) {
  const raw = text.split(/\n{2,}/g).map(b => b.trim()).filter(Boolean);
  const blocks = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b.length < 60 && i + 1 < raw.length) {
      blocks.push((b + '\n' + raw[i + 1]).trim());
      i++;
    } else { blocks.push(b); }
  }
  return blocks;
}

async function fetchPdfText(baseUrl) {
  if (PDF_TEXT_CACHE) return PDF_TEXT_CACHE;
  const pdfUrl = `${baseUrl}/assignme.pdf`; // Mets ton PDF à la racine du site
  const resp = await fetch(pdfUrl);
  if (!resp.ok) throw new Error(`Impossible de charger le PDF: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const pdf = await pdfParse(buf);
  PDF_TEXT_CACHE = normalizeText(pdf.text || '');
  return PDF_TEXT_CACHE;
}

async function buildIndex(text) {
  if (INDEX) return INDEX;
  const blocks = splitBlocks(text).map(t => {
    const tf = new Map();
    tokenize(t).forEach(tok => tf.set(tok, (tf.get(tok) || 0) + 1));
    return { text: t, tf };
  });
  const df = new Map();
  for (const b of blocks) for (const tok of b.tf.keys()) df.set(tok, (df.get(tok) || 0) + 1);
  const N = blocks.length;
  const idf = new Map();
  for (const [tok, dfi] of df.entries()) idf.set(tok, Math.log((N + 1) / (dfi + 1)) + 1);
  INDEX = { blocks, idf, N };
  return INDEX;
}
function scoreBlock(block, qTokens, idf) {
  let s = 0;
  for (const t of qTokens) s += (block.tf.get(t) || 0) * (idf.get(t) || 0);
  return s;
}
function unique(a) { return [...new Set(a)]; }

async function callOpenAI(context, question) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant dans Netlify (Site settings > Environment)");

  const system = `Tu es une IA d'ASSIGNME. Réponds UNIQUEMENT à partir du CONTEXTE fourni.
Si l'information n'y figure pas, réponds exactement : "Ce point n'est pas précisé dans le dossier."`;

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content:
`CONTEXTE:
"""
${context}
"""

QUESTION:
${question}` }
    ]
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0,300)}`);
  }
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const { question = '' } = JSON.parse(event.body || '{}');
    const q = question.trim();
    if (!q) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing "question"' }) };

    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host  = event.headers['x-forwarded-host'] || event.headers['host'];
    const baseUrl = `${proto}://${host}`;

    const text = await fetchPdfText(baseUrl);
    const { blocks, idf } = await buildIndex(text);

    // top-k contexte
    let qTokens = unique(tokenize(q).filter(t => t.length >= 2));
    const scored = blocks.map(b => ({ s: scoreBlock(b, qTokens, idf), text: b.text }))
                         .sort((a,b)=> b.s - a.s)
                         .filter(x => x.s > 0)
                         .slice(0, 6);

    if (scored.length === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer: "Ce point n'est pas précisé dans le dossier." }) };
    }

    let ctx = '';
    for (const h of scored) {
      if ((ctx.length + h.text.length + 2) > 8000) break;
      ctx += (ctx ? '\n\n' : '') + h.text.trim();
    }

    let answer = await callOpenAI(ctx, q);
    if (!answer) answer = "Ce point n'est pas précisé dans le dossier.";

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
