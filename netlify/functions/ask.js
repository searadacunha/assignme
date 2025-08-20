// netlify/functions/ask.js
// Q&A via GPT constrained to assignme.pdf (RAG-lite: TF-IDF -> context -> Chat)
// Requires env var: OPENAI_API_KEY
// Place assignme.pdf at the site root (next to index.html).

const pdfParse = require('pdf-parse');

// Cache across invocations
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
  for (let i=0;i<raw.length;i++){
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
  if (!resp.ok) throw new Error(`Impossible de récupérer le PDF: ${resp.status}`);
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
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant');

  const system = `Tu es une IA d'ASSIGNME. Tu dois répondre UNIQUEMENT à partir du CONTEXTE fourni.
Si l'information n'est pas présente dans le contexte, réponds exactement: "Ce point n'est pas précisé dans le dossier.".
Réponds en français, de manière concise et factuelle.`;

  const user = `CONTEXTE:
\"\"\"
${context}
\"\"\"

QUESTION:
${question}
`;

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
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
    const t = await resp.text();
    throw new Error('OpenAI ' + resp.status + ' — ' + t.slice(0,500));
  }
  const data = await resp.json();
  const answer = (data?.choices?.[0]?.message?.content || '').trim();
  return answer || "Ce point n'est pas précisé dans le dossier.";
}

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod === 'OPTIONS'){
      return { statusCode: 200, headers: corsHeaders(), body: 'OK' };
    }
    if (event.httpMethod !== 'POST'){
      return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
    }
    const body = JSON.parse(event.body || '{}');
    const question = (body.question || '').trim();
    if (!question){
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing "question"' }) };
    }

    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${event.headers.host}`;

    const { blocks, idf } = await ensureIndex(base);

    let qTokens = tokenize(question).filter(t => t.length >= 2);
    qTokens = uniq(qTokens);
    const scored = blocks.map((b,i)=>({
      i, s: scoreBlock(b, qTokens, idf), text: b.text
    })).sort((a,b)=> b.s - a.s);

    const K = 6;
    const hits = scored.filter(x => x.s > 0).slice(0, K);
    if (hits.length === 0){
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ answer: "Ce point n'est pas précisé dans le dossier." }) };
    }

    const MAX = 8000;
    let ctx = '';
    for (const h of hits){
      const chunk = h.text.trim();
      if ((ctx.length + chunk.length + 2) > MAX) break;
      ctx += (ctx ? '\n\n' : '') + chunk;
    }

    const answer = await callOpenAI(ctx, question);

    // Guardrail: minimal heuristic; if the model hallucinated long text with no token overlap, block.
    const overlap = qTokens.some(t => ctx.toLowerCase().includes(t));
    const finalAnswer = (!overlap && answer.split(/\s+/).length > 40)
      ? "Ce point n'est pas précisé dans le dossier."
      : answer;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ answer: finalAnswer })
    };

  } catch (err){
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
