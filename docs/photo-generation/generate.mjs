#!/usr/bin/env node
/**
 * Turn the 3D renders of Maison Sara into real-looking photographs with an image model, keeping each room's exact
 * camera, windows and window coverings (the render is sent as the reference image, the prompt locks the rest).
 *
 *   node docs/photo-generation/generate.mjs --dry-run              # show what would be sent, no network
 *   node docs/photo-generation/generate.mjs --print                # print one ready-to-paste prompt per room
 *   node docs/photo-generation/generate.mjs [--only id1,id2] [--variants 2] [--provider openai|gemini]
 *
 * Keys come from the environment (never from the command line): OPENAI_API_KEY for OpenAI, GEMINI_API_KEY for Google.
 * Optional: IMAGE_MODEL (default gpt-image-1 for OpenAI, gemini-2.5-flash-image for Google).
 * Inputs: legacy/sara-walkthrough/photos/shots-*.json and the matching renders legacy/sara-walkthrough/photos/<id>.jpg.
 * Output: legacy/sara-walkthrough/photos/real/<id>-v<n>.<png|jpg> and real/manifest.json.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const photos = path.join(repo, 'legacy', 'sara-walkthrough', 'photos');
const outDir = path.join(photos, 'real');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const DRY = flag('dry-run');
const PRINT = flag('print');
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const VARIANTS = Math.max(1, Math.min(4, Number(opt('variants', '2'))));
const provider = opt('provider', process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : '');

const prompts = JSON.parse(readFileSync(path.join(here, 'prompts.json'), 'utf8'));
const G = prompts._global;

function loadShots() {
  if (!existsSync(photos)) return [];
  return readdirSync(photos)
    .filter((f) => /^shots-.*\.json$/.test(f) && f !== 'shots-test.json')
    .flatMap((f) => JSON.parse(readFileSync(path.join(photos, f), 'utf8')));
}

/** Find the room prompt for a shot: by room id, then by a room id or 'exterior' inside the shot id / room text. */
function roomKey(shot) {
  const keys = Object.keys(prompts).filter((k) => !k.startsWith('_'));
  if (prompts[shot.room]) return shot.room;
  const hay = `${shot.id} ${shot.room ?? ''} ${shot.title ?? ''} ${shot.titleFr ?? ''}`.toLowerCase();
  if (/ext|street|rue|façade|facade/.test(hay)) return 'exterior';
  const byId = keys.find((k) => hay.includes(k.toLowerCase()));
  if (byId) return byId;
  const byName = keys.find((k) => hay.includes(prompts[k].titleFr.toLowerCase()) || hay.includes(prompts[k].title.toLowerCase()));
  return byName ?? null;
}

function buildPrompt(key) {
  const p = prompts[key];
  return [G.preamble, `Room: ${p.scene}.`, `Window coverings: ${p.coverings}`, G.coverings_rule, G.style, G.camera].join('\n\n');
}

async function openaiEdit(key, model, image, prompt, n) {
  const send = async (withFidelity) => {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('image', new Blob([image], { type: 'image/jpeg' }), 'reference.jpg');
    form.append('size', '1536x1024');
    form.append('quality', 'high');
    form.append('n', String(n));
    if (withFidelity) form.append('input_fidelity', 'high');
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}: ${text.slice(0, 400)}`), { status: r.status, text });
    return JSON.parse(text);
  };
  let json;
  try {
    json = await send(true);
  } catch (e) {
    if (e.status === 400 && /input_fidelity/.test(e.text ?? '')) json = await send(false);
    else throw e;
  }
  return (json.data ?? []).map((d) => ({ bytes: Buffer.from(d.b64_json, 'base64'), ext: 'png' }));
}

async function geminiEdit(key, model, image, prompt, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const body = {
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: image.toString('base64') } }, { text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: '3:2' } },
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${text.slice(0, 400)}`);
    const parts = JSON.parse(text).candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    if (!img) throw new Error(`Gemini returned no image: ${text.slice(0, 300)}`);
    const d = img.inlineData ?? img.inline_data;
    out.push({ bytes: Buffer.from(d.data, 'base64'), ext: (d.mimeType ?? d.mime_type ?? 'image/png').includes('jpeg') ? 'jpg' : 'png' });
  }
  return out;
}

const shots = loadShots().filter((s) => !ONLY || ONLY.has(s.id));
if (!shots.length) {
  console.error('No shots found in legacy/sara-walkthrough/photos/shots-*.json (render the rooms first: node scripts/photos.mjs).');
  process.exit(1);
}

if (PRINT) {
  for (const s of shots) {
    const k = roomKey(s);
    console.log(`\n===== ${s.id}  (${k ?? 'NO PROMPT'})  attach: legacy/sara-walkthrough/photos/${s.id}.jpg =====\n`);
    if (k) console.log(buildPrompt(k));
  }
  process.exit(0);
}

if (!DRY && !provider) {
  console.error('No image API key in the environment. Add OPENAI_API_KEY or GEMINI_API_KEY to the cloud environment (Network secrets or an environment variable), start a new session, and run again. Use --print for prompts to paste into ChatGPT or Gemini by hand.');
  process.exit(2);
}
const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
const model = process.env.IMAGE_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash-image' : 'gpt-image-1');
mkdirSync(outDir, { recursive: true });
const manifest = existsSync(path.join(outDir, 'manifest.json')) ? JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8')) : {};

for (const s of shots) {
  const k = roomKey(s);
  const ref = path.join(photos, `${s.id}.jpg`);
  if (!k) { console.warn(`skip ${s.id}: no prompt for room '${s.room}'`); continue; }
  if (!existsSync(ref)) { console.warn(`skip ${s.id}: render ${ref} missing`); continue; }
  const prompt = buildPrompt(k);
  if (DRY) {
    console.log(`[dry-run] ${s.id} → ${provider || '(no provider)'} ${model} · ref ${path.relative(repo, ref)} · ${VARIANTS} variant(s) · prompt ${prompt.length} chars · room ${k}`);
    continue;
  }
  const t0 = Date.now();
  try {
    const image = readFileSync(ref);
    const results = provider === 'openai' ? await openaiEdit(apiKey, model, image, prompt, VARIANTS) : await geminiEdit(apiKey, model, image, prompt, VARIANTS);
    const files = results.map((r, i) => {
      const f = `${s.id}-v${i + 1}.${r.ext}`;
      writeFileSync(path.join(outDir, f), r.bytes);
      return f;
    });
    manifest[s.id] = { room: k, title: prompts[k].title, titleFr: prompts[k].titleFr, provider, model, reference: `${s.id}.jpg`, files, prompt };
    writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`✓ ${s.id}: ${files.join(', ')} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) {
    console.error(`✗ ${s.id}: ${e.message}`);
  }
}
