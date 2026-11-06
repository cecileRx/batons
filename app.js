const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

// ===== Étape 1 : le bonhomme =====

// La pose de départ : chaque articulation a une position x, y en pixels
const startPose = {
  tete:    { x: 400, y: 140 },
  cou:     { x: 400, y: 175 },
  bassin:  { x: 400, y: 280 },
  coudeG:  { x: 360, y: 220 },
  mainG:   { x: 340, y: 270 },
  coudeD:  { x: 440, y: 220 },
  mainD:   { x: 460, y: 270 },
  genouG:  { x: 375, y: 340 },
  piedG:   { x: 365, y: 400 },
  genouD:  { x: 425, y: 340 },
  piedD:   { x: 435, y: 400 },
};

// Les os : quelles articulations sont reliées entre elles
const bones = [
  ['cou', 'bassin'],
  ['cou', 'coudeG'], ['coudeG', 'mainG'],
  ['cou', 'coudeD'], ['coudeD', 'mainD'],
  ['bassin', 'genouG'], ['genouG', 'piedG'],
  ['bassin', 'genouD'], ['genouD', 'piedD'],
];

const HEAD_RADIUS = 28;

// La taille du bonhomme sur une image (absente des anciens fichiers → 1)
function figScale(f) {
  return f.scale ?? 1;
}

// ===== Plusieurs bonshommes =====
// Le bonhomme n° 1 ('b1') est rangé directement dans l'image : frame.joints et frame.scale
// (comme avant : les anciens fichiers restent valables).
// Les autres sont rangés dans frame.others = { b2: { joints, scale }, ... }, et SEULEMENT sur les
// images où ils sont présents : un bonhomme ajouté à l'image 5 n'existe pas sur les images 1 à 4.
const FIG_COLORS = ['#222', '#2a6fdb', '#1e9e5a', '#d9822b', '#8e44ad', '#c0392b'];
const DOT_COLORS = ['crimson', '#f39c12', '#e84393', '#16a085', '#2980b9', '#7f8c8d'];
let figureDefs = {};   // { b2: { color, dot, n } } : ce qui est PAREIL sur toutes les images
let nextFigId = 2;
let activeFig = 'b1';  // le bonhomme qu'on modifie (et sur lequel le crayon ✏️ dessine)

// Les données d'un bonhomme sur une image ({ joints, scale }), ou null s'il n'y est pas
function figOf(f, id) {
  if (id === 'b1') return f;
  return (f.others && f.others[id]) || null;
}
function figIds() {
  return ['b1', ...Object.keys(figureDefs)];
}
function figColor(id) {
  return id === 'b1' ? FIG_COLORS[0] : figureDefs[id].color;
}
function figName(id) {
  return id === 'b1' ? 'Bonhomme 1' : `Bonhomme ${figureDefs[id].n}`;
}

// Dessine le bonhomme sur n'importe quel canvas (la scène ou une miniature).
// color : couleur du trait ; scale : taille du bonhomme (1 = normale), pour la tête et l'épaisseur
function drawFigure(c, joints, color = '#222', scale = 1) {
  c.lineWidth = 6 * scale;
  c.lineCap = 'round';
  c.strokeStyle = color;
  for (const [a, b] of bones) {
    c.beginPath();
    c.moveTo(joints[a].x, joints[a].y);
    c.lineTo(joints[b].x, joints[b].y);
    c.stroke();
  }

  // La tête : un cercle
  c.beginPath();
  c.arc(joints.tete.x, joints.tete.y, HEAD_RADIUS * scale, 0, Math.PI * 2);
  c.stroke();
}

// Les points rouges des articulations (seulement en édition)
// (chaque bonhomme a sa couleur de points ; ceux du bonhomme actif sont un peu plus gros)
function drawJointDots(c, joints, color = 'crimson', radius = 5) {
  c.fillStyle = color;
  for (const name in joints) {
    c.beginPath();
    c.arc(joints[name].x, joints[name].y, radius, 0, Math.PI * 2);
    c.fill();
  }
}

// ===== Les traits dessinés à la main =====
// Deux sortes de traits :
//  - 'decor' : coordonnées fixes, le même trait sur toutes les images
//  - 'body'  : accroché à un os du bonhomme. On range ses points dans le « repère » de l'os
//              (origine = première articulation, axe x = direction de l'os). À chaque image,
//              on reconvertit avec la position de l'os à ce moment-là → le trait suit le membre.

let strokes = [];        // { id, kind, color, width, points, bone? }
let nextStrokeId = 1;

// Chaque image garde la liste des traits CACHÉS sur elle (frame.hiddenStrokes).
// Par défaut un trait est visible : les anciens fichiers n'ont pas cette liste, et tout s'affiche.
function strokeVisible(f, s) {
  return !(f.hiddenStrokes || []).includes(s.id);
}
let tool = 'move';       // outil actif : 'move', 'body', 'decor' ou 'erase'
let drawing = null;      // points du trait en cours de dessin (ou null)
let shape = 'free';      // forme : 'free' (main levée), 'line', 'rect', 'circle' ou 'ellipse'
let shapeStart = null;   // point où l'on a commencé la forme

// ===== Formes automatiques =====
// Une forme est simplement un trait dont on calcule les points : elle se comporte ensuite
// exactement comme un trait à main levée (décor ou personnage, gomme, apparition, animation…).
// Maj : trait droit par pas de 45°, rectangle → carré, ovale → cercle.
function makeShape(kind, a, b, shiftKey) {
  if (kind === 'line') {
    if (shiftKey) {
      // on « aimante » l'angle sur des multiples de 45°
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
      b = { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) };
    }
    return [a, b];
  }

  let w = b.x - a.x;
  let h = b.y - a.y;
  if (shiftKey && (kind === 'rect' || kind === 'ellipse')) {
    const side = Math.max(Math.abs(w), Math.abs(h)); // même largeur et hauteur
    w = Math.sign(w || 1) * side;
    h = Math.sign(h || 1) * side;
  }

  if (kind === 'rect') {
    // les 4 coins, et on revient au premier pour fermer
    return [a, { x: a.x + w, y: a.y }, { x: a.x + w, y: a.y + h }, { x: a.x, y: a.y + h }, a];
  }

  // Cercle : depuis le CENTRE (on tire le rayon). Ovale : dans le rectangle tracé.
  let cx, cy, rx, ry;
  if (kind === 'circle') {
    cx = a.x; cy = a.y;
    rx = ry = Math.hypot(b.x - a.x, b.y - a.y);
  } else {
    cx = a.x + w / 2; cy = a.y + h / 2;
    rx = Math.abs(w) / 2; ry = Math.abs(h) / 2;
  }
  const N = 64; // nombre de points du contour : assez pour que ce soit bien rond
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

// Os auxquels un trait peut s'accrocher (+ la tête, qui n'est pas dans la liste des os)
const attachBones = [...bones, ['cou', 'tete']];

// Le repère d'un os : son origine et son angle.
// anchor = 0 → origine sur la 1re articulation, 1 → sur la 2e (ex. la main pour une épée).
// Comme les os sont élastiques, ancrer à l'articulation la plus proche évite que le trait glisse.
function boneFrame(joints, [a, b], anchor = 0) {
  const A = joints[a];
  const B = joints[b];
  const angle = Math.atan2(B.y - A.y, B.x - A.x);
  const O = anchor === 1 ? B : A;
  return { x: O.x, y: O.y, cos: Math.cos(angle), sin: Math.sin(angle) };
}

// Point de la scène → point dans le repère de l'os
function toLocal(p, f) {
  const dx = p.x - f.x;
  const dy = p.y - f.y;
  return { x: dx * f.cos + dy * f.sin, y: -dx * f.sin + dy * f.cos };
}

// Point dans le repère de l'os → point de la scène
function toWorld(q, f) {
  return { x: f.x + q.x * f.cos - q.y * f.sin, y: f.y + q.x * f.sin + q.y * f.cos };
}

// Où se trouvent les points d'un trait, pour une pose donnée
// scale : taille du bonhomme → un chapeau grandit avec lui
// f : l'image (ou l'image intermédiaire calculée pendant la lecture)
function strokeWorld(s, f) {
  if (s.kind === 'decor') {
    // Décor : on applique la transformation de l'élément sur cette image (déplacé, tourné, étiré)
    const t = tfOf(f, s.id);
    if (t.x === 0 && t.y === 0 && t.angle === 0 && t.sx === 1 && t.sy === 1) return s.points;
    const cos = Math.cos((t.angle * Math.PI) / 180);
    const sin = Math.sin((t.angle * Math.PI) / 180);
    const P = { x: s.pivot.x + t.x, y: s.pivot.y + t.y }; // où se trouve le centre de l'élément
    return s.points.map((p) => {
      const lx = (p.x - s.pivot.x) * t.sx;
      const ly = (p.y - s.pivot.y) * t.sy;
      return { x: P.x + lx * cos - ly * sin, y: P.y + lx * sin + ly * cos };
    });
  }
  // Trait du personnage : il suit SON bonhomme (s.fig ; absent = bonhomme 1).
  // Si ce bonhomme n'est pas sur cette image, le trait n'y est pas non plus.
  const fd = figOf(f, s.fig || 'b1');
  if (!fd) return [];
  const scale = figScale(fd);
  const bf = boneFrame(fd.joints, s.bone, s.anchor);
  return s.points.map((q) => toWorld({ x: q.x * scale, y: q.y * scale }, bf));
}

// Épaisseur d'un trait sur une image (il s'épaissit si on l'agrandit)
function strokeWidthIn(s, f) {
  if (s.kind === 'body') return s.width * figScale(figOf(f, s.fig || 'b1') || f);
  const t = tfOf(f, s.id);
  return s.width * Math.sqrt(Math.abs(t.sx * t.sy));
}

// ===== Animer les éléments du décor =====
// Chaque image peut donner à un élément de décor sa propre transformation :
//   frame.strokeTf = { s3: { x, y, angle, sx, sy } }
//   x, y : décalage ; angle : rotation en degrés ; sx, sy : étirement en largeur / hauteur.
// Ces nombres s'interpolent pendant la lecture, comme les articulations du bonhomme.
// La rotation et l'étirement se font autour du « pivot » du trait (le centre où il a été dessiné).

const IDENTITY_TF = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function tfOf(f, id) {
  return (f.strokeTf && f.strokeTf[id]) || IDENTITY_TF;
}

function setTf(f, id, t) {
  f.strokeTf = { ...(f.strokeTf || {}), [id]: t };
}

function strokeById(id) {
  return strokes.find((s) => s.id === id);
}

// Les éléments de DÉCOR de la sélection (les traits du personnage, eux, suivent ses os)
function selectedDecorIds() {
  return strokes.filter((s) => s.kind === 'decor' && selectedStrokes.has(s.id)).map((s) => s.id);
}

const DECOR_PAD = 8; // marge entre les traits et le cadre de sélection

// Le rectangle autour des éléments de décor sélectionnés, sur l'image en cours
function decorSelectionBox() {
  const ids = selectedDecorIds();
  if (ids.length === 0) return null;
  const pts = ids.flatMap((id) => strokeWorld(strokeById(id), frame()));
  const PAD = DECOR_PAD;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - PAD;
  const y = Math.min(...ys) - PAD;
  return { x, y, w: Math.max(...xs) + PAD - x, h: Math.max(...ys) + PAD - y };
}

// Poignées : ● tourner (au-dessus), ■ agrandir (coin), largeur (côtés gauche / droit), hauteur (bas)
function decorHandlePositions(b) {
  return {
    rotate: { x: b.x + b.w / 2, y: b.y - 28 },
    scale: { x: b.x + b.w, y: b.y + b.h },
    width: { x: b.x + b.w, y: b.y + b.h / 2 },   // tire à droite, le côté gauche reste fixe
    widthL: { x: b.x, y: b.y + b.h / 2 },        // tire à gauche, le côté droit reste fixe
    height: { x: b.x + b.w / 2, y: b.y + b.h },  // tire en bas, le haut reste fixe
  };
}

function decorHandleAt(p) {
  const box = decorSelectionBox();
  if (!box) return null;
  const hs = decorHandlePositions(box);
  const grab = HANDLE_SIZE + 6;
  // le coin d'abord : sur un petit élément, il est tout près des autres poignées
  for (const name of ['scale', 'rotate', 'width', 'widthL', 'height']) {
    if (Math.hypot(p.x - hs[name].x, p.y - hs[name].y) <= grab) return name;
  }
  return null;
}

// Début d'un geste sur les éléments sélectionnés : on mémorise leur état de départ
// (comme pour le bonhomme : on recalcule toujours depuis cet état, pas d'erreurs cumulées)
function startDecorGesture(kind, p) {
  const box = decorSelectionBox();
  const orig = {};
  for (const id of selectedDecorIds()) orig[id] = { ...tfOf(frame(), id) };
  dragged = {
    kind: 'decor',
    gesture: kind, // 'move', 'rotate', 'scale', 'width', 'widthL' ou 'height'
    start: p,
    box,
    center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
    orig,
  };
}

// Deux transformations identiques ? (à un centième près)
function sameTf(a, b) {
  return ['x', 'y', 'angle', 'sx', 'sy'].every((k) => Math.abs(a[k] - b[k]) < 0.01);
}

// Fin d'un geste sur des éléments de décor : les images SUIVANTES qui avaient exactement
// l'ancienne position prennent la nouvelle (même règle que pour les répliques des textes).
// On s'arrête à la première image différente : une animation déjà faite n'est jamais écrasée.
function propagateDecorForward(orig) {
  let changed = false;
  for (const id in orig) {
    const before = orig[id];
    const after = tfOf(frame(), id);
    if (sameTf(before, after)) continue; // cet élément n'a pas bougé
    for (let j = current + 1; j < frames.length; j++) {
      if (!sameTf(tfOf(frames[j], id), before)) break;
      setTf(frames[j], id, { ...after });
      changed = true;
    }
  }
  if (changed) refreshAllThumbs();
}

function applyDecorGesture(d, p, shiftKey) {
  const { start, center: c, box } = d;
  let message = '';
  for (const id in d.orig) {
    const s = strokeById(id);
    const o = d.orig[id];
    const P = { x: s.pivot.x + o.x, y: s.pivot.y + o.y }; // position actuelle du centre de ce trait
    const t = { ...o };
    let P2 = P;

    if (d.gesture === 'move') {
      P2 = { x: P.x + p.x - start.x, y: P.y + p.y - start.y };
    } else if (d.gesture === 'rotate') {
      let a = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
      if (shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); // Maj : par pas de 15°
      // Chaque trait tourne sur lui-même ET son centre tourne autour du centre de la sélection
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      P2 = { x: c.x + (P.x - c.x) * cos - (P.y - c.y) * sin, y: c.y + (P.x - c.x) * sin + (P.y - c.y) * cos };
      t.angle = o.angle + (a * 180) / Math.PI;
      message = `Rotation ${Math.round(((((a * 180) / Math.PI) + 540) % 360) - 180)}°`;
    } else if (d.gesture === 'scale') {
      const d0 = Math.hypot(start.x - c.x, start.y - c.y) || 1;
      const k = Math.max(0.05, Math.min(20, Math.hypot(p.x - c.x, p.y - c.y) / d0));
      P2 = { x: c.x + (P.x - c.x) * k, y: c.y + (P.y - c.y) * k };
      t.sx = o.sx * k;
      t.sy = o.sy * k;
      message = `Taille ×${k.toFixed(2)}`;
    } else if (d.gesture === 'width' || d.gesture === 'widthL') {
      // Le côté opposé reste fixe : c'est « l'axe de la porte »
      // (on enlève la marge du cadre : c'est le VRAI bord de l'élément qui doit rester fixe)
      const ax = d.gesture === 'width' ? box.x + DECOR_PAD : box.x + box.w - DECOR_PAD;
      const k = Math.max(0.02, (p.x - ax) / (start.x - ax || 1));
      P2 = { x: ax + (P.x - ax) * k, y: P.y };
      t.sx = o.sx * k;
      message = `Largeur ×${k.toFixed(2)}`;
    } else if (d.gesture === 'height') {
      const ay = box.y + DECOR_PAD;
      const k = Math.max(0.02, (p.y - ay) / (start.y - ay || 1));
      P2 = { x: P.x, y: ay + (P.y - ay) * k };
      t.sy = o.sy * k;
      message = `Hauteur ×${k.toFixed(2)}`;
    }

    t.x = P2.x - s.pivot.x;
    t.y = P2.y - s.pivot.y;
    setTf(frame(), id, t);
  }
  if (message) setStatus(message, true);
}

// Centre du rectangle qui entoure des points
function centerOf(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// Distance d'un point p au segment [a, b]
function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// L'os le plus proche d'un point
function nearestBone(p, joints) {
  let best = attachBones[0];
  let bestDist = Infinity;
  for (const bone of attachBones) {
    const d = distToSegment(p, joints[bone[0]], joints[bone[1]]);
    if (d < bestDist) { best = bone; bestDist = d; }
  }
  return best;
}

// hardness (dureté) : 1 = bord net ; vers 0 = bord de plus en plus flou, comme un pinceau doux.
// Le flou est fait avec l'ombre du canvas (shadowBlur), centrée sur le trait.
function drawStroke(c, pts, color, width, hardness = 1) {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  if (hardness < 1) {
    const soft = 1 - hardness;
    width = Math.max(1, width * (1 - 0.6 * soft)); // le cœur du trait s'amincit…
    // … et un halo flou l'entoure. shadowBlur ne suit pas le zoom du canvas : on le
    // multiplie par l'échelle actuelle pour que les vignettes aient le même rendu
    const zoom = c.getTransform().a;
    c.shadowColor = color;
    c.shadowBlur = width * soft * 1.5 * zoom;
  }
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (pts.length === 1) {
    // Un simple clic = un point
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
    c.stroke();
  }
  c.restore();
}

// ===== Les textes =====
// Un texte a deux parties :
//  - ce qui est PAREIL sur toutes les images : la couleur (textDefs)
//  - ce qui CHANGE d'une image à l'autre (rangé dans chaque image, dans frame.texts) :
//      • x, y, taille, rotation, opacité → des nombres, qui s'animent en douceur
//      • content (la réplique) et visible → changent d'un coup, sur l'image clé

const textDefs = {};   // { t1: { content: 'Texte', color: '#222222' }, ... } (content = valeur de secours)
let nextTextId = 1;
let selectedText = null; // id du texte sélectionné (ou null)

function fontFor(size) {
  return `bold ${size}px system-ui, sans-serif`;
}

// Le contenu d'un texte sur une image (les anciens fichiers n'avaient qu'un contenu global)
function textContent(id, st) {
  return st.content ?? textDefs[id].content;
}

// Dessine un texte. ghost : couleur de pelure d'oignon (sinon la vraie couleur)
// minAlpha : opacité minimale, pour qu'un texte « invisible » reste attrapable en édition
function drawText(c, id, st, ghost, minAlpha = 0) {
  const def = textDefs[id];
  let alpha = Math.max(st.opacity, minAlpha);
  if (st.visible === false) {
    // Caché sur cette image : rien en lecture, juste un fantôme très pâle en édition
    if (minAlpha === 0) return;
    alpha = 0.12;
  }
  c.save();
  c.globalAlpha = alpha;
  c.translate(st.x, st.y);
  c.rotate(st.angle * Math.PI / 180);
  c.font = fontFor(st.size);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = ghost || def.color;
  c.fillText(textContent(id, st), 0, 0);
  c.restore();
}

// Largeur et hauteur du texte, pour savoir où cliquer
function textBox(id, st) {
  ctx.save();
  ctx.font = fontFor(st.size);
  const w = ctx.measureText(textContent(id, st)).width;
  ctx.restore();
  return { w: Math.max(w, 20), h: st.size };
}

// Quel texte se trouve sous le point p ? (on tient compte de la rotation)
function textAt(p) {
  const ids = Object.keys(textDefs).reverse(); // le dernier dessiné est au-dessus
  for (const id of ids) {
    const st = frame().texts[id];
    // On « dé-tourne » le point pour se ramener à un rectangle droit
    const a = -st.angle * Math.PI / 180;
    const dx = p.x - st.x;
    const dy = p.y - st.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    const { w, h } = textBox(id, st);
    if (Math.abs(lx) <= w / 2 + 4 && Math.abs(ly) <= h / 2 + 4) return id;
  }
  return null;
}

// Cadre pointillé autour du texte sélectionné
function drawSelection(id) {
  const st = frame().texts[id];
  const { w, h } = textBox(id, st);
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.rotate(st.angle * Math.PI / 180);
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'crimson';
  ctx.strokeRect(-w / 2 - 6, -h / 2 - 4, w + 12, h + 8);
  ctx.restore();
}

// Dessine une image complète, de l'arrière vers l'avant :
// décor → bonhomme → traits du personnage → textes → points rouges
function drawFrame(c, f, { showJoints = false, ghost = null, minAlpha = 0 } = {}) {
  const editing = minAlpha > 0; // l'image en cours d'édition (pas une miniature, ni la lecture)

  // Un trait caché sur cette image : rien en lecture, un fantôme très pâle en édition
  // (pour qu'on puisse le retrouver avec l'outil 👁 Apparition)
  const paint = (s, pts, color, width) => {
    const hardness = s.hardness ?? 1; // dureté de la brosse (les anciens traits : nets)
    if (pts.length === 0) return;     // trait d'un bonhomme absent de cette image
    if (strokeVisible(f, s)) {
      drawStroke(c, pts, color, width, hardness);
    } else if (editing) {
      c.save();
      c.globalAlpha = 0.15;
      drawStroke(c, pts, color, width, hardness);
      c.restore();
    }
  };

  // Le décor (en pelure d'oignon aussi : on voit où était la porte sur l'image d'avant ;
  // les parties qui n'ont pas bougé sont recouvertes par l'image actuelle)
  for (const s of strokes) {
    if (s.kind === 'decor') paint(s, strokeWorld(s, f), ghost || s.color, strokeWidthIn(s, f));
  }
  // Les bonshommes présents sur cette image
  for (const id of figIds()) {
    const fd = figOf(f, id);
    if (fd) drawFigure(c, fd.joints, ghost || figColor(id), figScale(fd));
  }
  for (const s of strokes) {
    if (s.kind === 'body') paint(s, strokeWorld(s, f), ghost || s.color, strokeWidthIn(s, f));
  }
  for (const id in textDefs) drawText(c, id, f.texts[id], ghost, minAlpha);
  if (showJoints) {
    for (const id of figIds()) {
      const fd = figOf(f, id);
      if (!fd) continue;
      const dot = id === 'b1' ? DOT_COLORS[0] : figureDefs[id].dot;
      drawJointDots(c, fd.joints, dot, id === activeFig ? 6 : 4.5);
    }
  }
}

// ===== Étape 3 : les images clés =====
// Une image = { joints: la pose du bonhomme, texts: l'état de chaque texte }

const frames = [{ joints: structuredClone(startPose), texts: {} }];
let current = 0; // l'image affichée et modifiée

function frame() { return frames[current]; }
// Le bonhomme actif sur l'image en cours ({ joints, scale }) et sa pose
function cur() { return figOf(frame(), activeFig) || frame(); }
function pose() { return cur().joints; }

// Deux états de bonhomme identiques ? (pose et taille, à un centième près)
function sameFig(a, b) {
  if (!a || !b) return false;
  if (Math.abs(figScale(a) - figScale(b)) > 0.001) return false;
  return Object.keys(a.joints).every((n) =>
    Math.abs(a.joints[n].x - b.joints[n].x) < 0.01 && Math.abs(a.joints[n].y - b.joints[n].y) < 0.01);
}

// Fin d'un geste sur un bonhomme ajouté (b2…) : les images SUIVANTES qui avaient encore
// l'ancienne pose prennent la nouvelle. On s'arrête à la première image où il était déjà
// posé autrement : une animation déjà faite n'est jamais écrasée (même règle que le décor).
function propagateFigureForward(id, before) {
  if (id === 'b1' || !before) return;
  const after = figOf(frame(), id);
  if (!after || sameFig(before, after)) return;
  let changed = false;
  for (let j = current + 1; j < frames.length; j++) {
    if (!sameFig(figOf(frames[j], id), before)) break;
    frames[j].others[id] = structuredClone({ joints: after.joints, scale: figScale(after) });
    changed = true;
  }
  if (changed) refreshAllThumbs();
}

// ===== Étape 5 : la pelure d'oignon =====
const onion = document.getElementById('onion');
const onionNext = document.getElementById('onionNext');

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (onion.checked && current > 0) {
    drawFrame(ctx, frames[current - 1], { ghost: 'rgba(120, 120, 120, 0.35)' }); // précédente : gris
  }
  if (onionNext.checked && current < frames.length - 1) {
    drawFrame(ctx, frames[current + 1], { ghost: 'rgba(40, 110, 220, 0.30)' });  // suivante : bleu
  }

  drawFrame(ctx, frame(), { showJoints: tool === 'move', minAlpha: 0.15 });
  if (selectedText) drawSelection(selectedText);
  if (figureSelected && tool === 'move') drawFigureSelection();
  if (tool === 'move') drawStrokeSelection();

  // Le trait en train d'être dessiné
  if (drawing) drawStroke(ctx, drawing, strokeColor.value, Number(strokeWidth.value), Number(strokeHardness.value) / 100);

  // Presque toute modification finit par redessiner : c'est le bon moment pour sauvegarder
  scheduleSave();
}

onion.addEventListener('change', draw);
onionNext.addEventListener('change', draw);

// --- La frise de miniatures ---
const timeline = document.getElementById('timeline');
const THUMB_SCALE = 0.15;

function drawThumb(thumb, i) {
  const c = thumb.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, thumb.width, thumb.height);
  c.setTransform(THUMB_SCALE, 0, 0, THUMB_SCALE, 0, 0); // tout dessiner en petit
  drawFrame(c, frames[i]);
}

// ===== Durée des images =====
// Chaque image peut avoir sa propre durée (frame.duration, en millisecondes) : le temps pour aller
// de cette image à la suivante. Sans durée propre, elle prend celle du curseur « Durée entre deux images ».

const PX_PER_SEC = 200;      // dans la timeline, 1 seconde = 200 pixels de large
const MIN_DURATION = 50;     // 0,05 s
const MAX_DURATION = 10000;  // 10 s

function frameDuration(i) {
  return frames[i].duration ?? Number(speed.value);
}

function blockWidth(i) {
  return Math.max(MIN_BLOCK, (frameDuration(i) / 1000) * PX_PER_SEC);
}

const MIN_BLOCK = 44; // largeur minimale d'un bloc (0,10 s et moins) : la vignette y reste lisible
const HANDLE_W = 9;   // largeur de la poignée du bord droit

// Donne au bloc sa largeur et ajuste la vignette :
//  - bloc assez large : on voit toute la scène ;
//  - bloc étroit : on se recentre sur le BONHOMME (on coupe les côtés de la scène), et on ne
//    réduit que s'il ne tient pas en entier. Il reste ainsi bien visible même à 0,10 s.
function sizeBlock(block, i) {
  const w = blockWidth(i);
  block.style.width = `${w}px`;
  const thumb = block.querySelector('canvas');
  const fullW = canvas.width * THUMB_SCALE;
  const fullH = canvas.height * THUMB_SCALE;
  const inner = w - HANDLE_W - 4; // place disponible (bordures et poignée retirées)

  if (inner >= fullW) {
    Object.assign(thumb.style, { width: `${fullW}px`, position: '', left: '', top: '' });
  } else {
    const box = figureBox(frames[i].joints, figScale(frames[i])); // le bonhomme, dans la scène
    const s = Math.min(1, inner / (box.w * THUMB_SCALE));         // réduire seulement si besoin
    const centerX = (box.x + box.w / 2) * THUMB_SCALE * s;        // milieu du bonhomme dans la vignette
    Object.assign(thumb.style, {
      width: `${fullW * s}px`,
      position: 'absolute',
      left: `${2 + inner / 2 - centerX}px`,   // le bonhomme au milieu du bloc
      top: `${(71 - fullH * s) / 2}px`,       // centrée en hauteur (75 px moins les bordures)
    });
  }

  // La durée : écriture courte dans les blocs étroits (« 0.10 » au lieu de « 0.10 s »)
  const label = block.querySelector('.dur');
  const ms = frameDuration(i);
  label.textContent = w < 64 ? (ms / 1000).toFixed(2) : formatDuration(ms);
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(2)} s`;
}

let thumbCanvases = []; // les vignettes, dans l'ordre (pour les redessiner)

function renderTimeline() {
  timeline.innerHTML = '';
  thumbCanvases = [];
  frames.forEach((_, i) => {
    const block = document.createElement('div');
    block.className = 'frame-block';
    if (i === current) block.classList.add('active');
    block.style.width = `${blockWidth(i)}px`;

    const thumb = document.createElement('canvas');
    thumb.width = canvas.width * THUMB_SCALE;
    thumb.height = canvas.height * THUMB_SCALE;
    thumb.title = `Image ${i + 1} : clic pour y aller, glisser pour la déplacer`;
    // Clic = aller à l'image ; glisser = la déplacer dans la timeline (voir plus bas)
    thumb.addEventListener('pointerdown', (e) => startThumbDrag(e, block, i));

    const label = document.createElement('span');
    label.className = 'dur';
    label.textContent = formatDuration(frameDuration(i));
    if (frames[i].duration != null) label.classList.add('custom');

    const handle = document.createElement('div');
    handle.className = 'resize';
    handle.title = 'Tirer pour changer la durée de CETTE image (double-clic : durée par défaut)';
    handle.addEventListener('pointerdown', (e) => startResize(e, block, handle, label, i));
    handle.addEventListener('dblclick', () => resetDuration(i));

    block.append(thumb, label, handle);
    sizeBlock(block, i);
    drawThumb(thumb, i);
    thumbCanvases.push(thumb);
    timeline.appendChild(block);
  });
  timeline.children[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateToolbar();
}

// Tirer le bord droit d'un bloc : on change la durée de cette image seulement
function startResize(e, block, handle, label, i) {
  if (playing) return;
  e.stopPropagation();
  const startX = e.clientX;
  const startDur = frameDuration(i);
  handle.setPointerCapture(e.pointerId);
  handle.classList.add('active');

  const onMove = (ev) => {
    let dur = startDur + ((ev.clientX - startX) / PX_PER_SEC) * 1000;
    dur = Math.round(dur / 50) * 50; // par pas de 0,05 s
    dur = Math.max(MIN_DURATION, Math.min(MAX_DURATION, dur));
    frames[i].duration = dur;
    label.classList.add('custom');
    sizeBlock(block, i); // (met aussi à jour la durée écrite)
    setStatus(`Image ${i + 1} : ${formatDuration(dur)}`, true);
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    handle.classList.remove('active');
    setStatus(statusEl.textContent); // le message s'efface tout seul
    scheduleSave();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}

// Double-clic sur la poignée : l'image reprend la durée par défaut
function resetDuration(i) {
  delete frames[i].duration;
  setStatus(`Image ${i + 1} : durée par défaut (${formatDuration(frameDuration(i))})`);
  renderTimeline();
  scheduleSave();
}

// --- Réordonner les images en glissant les miniatures ---

let thumbDrag = null; // { from, startX, moved, to }

function startThumbDrag(e, thumb, i) {
  if (playing) return;
  thumbDrag = { from: i, startX: e.clientX, moved: false, to: i };
  thumb.setPointerCapture(e.pointerId); // on suit la souris même hors de la miniature

  const onMove = (ev) => {
    // On ne commence à déplacer qu'après quelques pixels : sinon un clic tremblé déplacerait l'image
    if (!thumbDrag.moved && Math.abs(ev.clientX - thumbDrag.startX) < 6) return;
    thumbDrag.moved = true;
    thumb.classList.add('dragging');
    autoScrollTimeline(ev.clientX);
    thumbDrag.to = dropIndexAt(ev.clientX);
    showDropMarker(thumbDrag.to);
  };

  const onUp = () => {
    thumb.removeEventListener('pointermove', onMove);
    thumb.removeEventListener('pointerup', onUp);
    thumb.removeEventListener('pointercancel', onUp);
    const { from, moved, to } = thumbDrag;
    thumbDrag = null;
    if (!moved) goTo(from);   // simple clic
    else moveFrame(from, to); // glisser-déposer
  };

  thumb.addEventListener('pointermove', onMove);
  thumb.addEventListener('pointerup', onUp);
  thumb.addEventListener('pointercancel', onUp);
}

// Où lâcher ? On renvoie la position d'insertion : 0 = avant la 1re image, n = après la dernière.
// On compare la souris au milieu de chaque miniature.
function dropIndexAt(clientX) {
  const thumbs = [...timeline.children];
  for (let k = 0; k < thumbs.length; k++) {
    const r = thumbs[k].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return k;
  }
  return thumbs.length;
}

// Le trait bleu qui montre où l'image va s'insérer
function showDropMarker(to) {
  const thumbs = [...timeline.children];
  thumbs.forEach((t) => t.classList.remove('drop-before', 'drop-after'));
  if (to < thumbs.length) thumbs[to].classList.add('drop-before');
  else thumbs[thumbs.length - 1].classList.add('drop-after');
}

// Si on approche du bord de la frise, elle défile (pratique avec beaucoup d'images)
function autoScrollTimeline(clientX) {
  const r = timeline.getBoundingClientRect();
  if (clientX < r.left + 30) timeline.scrollLeft -= 12;
  else if (clientX > r.right - 30) timeline.scrollLeft += 12;
}

// Déplace l'image n° from à la position d'insertion to
function moveFrame(from, to) {
  // Après avoir retiré l'image, les positions situées après elle reculent d'une case
  const dest = to > from ? to - 1 : to;
  if (dest === from) {
    renderTimeline(); // lâchée à sa place : on efface juste le trait bleu
    return;
  }
  const [f] = frames.splice(from, 1);
  frames.splice(dest, 0, f);
  current = dest; // on reste sur l'image qu'on vient de déplacer
  setStatus(`Image ${from + 1} déplacée en position ${dest + 1}`);
  draw();
  renderTimeline();
  updateTextPanel();
}

function refreshCurrentThumb() {
  drawThumb(thumbCanvases[current], current);
  sizeBlock(timeline.children[current], current); // (le cadrage suit le bonhomme s'il s'est déplacé)
}

function refreshAllThumbs() {
  thumbCanvases.forEach((t, i) => drawThumb(t, i));
}

function goTo(i) {
  current = Math.max(0, Math.min(frames.length - 1, i));
  // Le bonhomme actif n'est pas sur cette image : on revient au bonhomme 1
  if (!figOf(frame(), activeFig)) {
    activeFig = 'b1';
    figureSelected = false;
  }
  draw();
  renderTimeline();
  updateTextPanel(); // les réglages du texte dépendent de l'image
}

// Nouvelle image = copie complète de l'image actuelle (bonhomme ET textes), insérée juste après
function addFrame() {
  const copy = structuredClone(frame());
  delete copy.duration; // une durée réglée ne vaut que pour SON image : la copie prend la durée par défaut
  frames.splice(current + 1, 0, copy);
  goTo(current + 1);
}

function deleteFrame() {
  if (frames.length === 1) return; // on garde toujours au moins une image
  frames.splice(current, 1);
  goTo(Math.min(current, frames.length - 1));
}

// --- Barre de boutons ---
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const addBtn = document.getElementById('addBtn');
const delBtn = document.getElementById('delBtn');
const frameInfo = document.getElementById('frameInfo');

function updateToolbar() {
  frameInfo.textContent = `Image ${current + 1} / ${frames.length}`;
  prevBtn.disabled = playing || current === 0;
  nextBtn.disabled = playing || current === frames.length - 1;
  addBtn.disabled = playing;
  delBtn.disabled = playing || frames.length === 1;
  playBtn.disabled = exporting || frames.length < 2; // il faut au moins 2 images pour animer
  exportBtn.disabled = playing || frames.length < 2;
  newBtn.disabled = openBtn.disabled = playing;
  playBtn.textContent = playing ? '■ Stop' : '▶ Lecture';
  // Pas d'édition de texte ni de dessin pendant la lecture
  addTextBtn.disabled = playing;
  toolButtons.forEach((b) => { b.disabled = playing; });
  undoStrokeBtn.disabled = playing || strokeHistory.length === 0;
  delStrokeBtn.disabled = playing || selectedStrokes.size === 0;
  addFigBtn.disabled = playing;
  delFigBtn.hidden = activeFig === 'b1';
  delFigBtn.disabled = playing;
  copyBtn.disabled = playing || selectedStrokes.size === 0;
  pasteBtn.disabled = playing || !strokeClipboard;
  textProps.querySelectorAll('input, button').forEach((el) => { el.disabled = playing; });
}

// --- Ajouter / retirer un bonhomme ---
const addFigBtn = document.getElementById('addFigBtn');
const delFigBtn = document.getElementById('delFigBtn');

// Un nouveau bonhomme apparaît À PARTIR de l'image actuelle (pas sur les images d'avant),
// à côté du bonhomme 1, dans la pose de départ
function addFigure() {
  const id = 'b' + nextFigId;
  const k = Object.keys(figureDefs).length + 1; // 1er bonhomme ajouté → 2e couleur…
  figureDefs[id] = { color: FIG_COLORS[k % FIG_COLORS.length], dot: DOT_COLORS[k % DOT_COLORS.length], n: nextFigId };
  nextFigId += 1;
  // À droite du bonhomme 1 s'il est à gauche de la scène, sinon à gauche
  const dx = frame().joints.cou.x < canvas.width / 2 + 60 ? 220 : -220;
  const joints = {};
  for (const name in startPose) joints[name] = { x: startPose[name].x + dx, y: startPose[name].y };
  for (let i = current; i < frames.length; i++) {
    frames[i].others = { ...(frames[i].others || {}), [id]: { joints: structuredClone(joints), scale: 1 } };
  }
  activeFig = id;
  selectFigure();
  setStatus(`＋ ${figName(id)} ajouté à partir de l'image ${current + 1} : tire ses points pour le poser`);
  renderTimeline();
}

// Retire le bonhomme actif à partir de cette image (il reste sur les images d'avant).
// S'il n'est plus sur aucune image, on l'efface complètement, avec ses traits ✏️.
function deleteFigure() {
  const id = activeFig;
  if (id === 'b1') return;
  const name = figName(id);
  for (let i = current; i < frames.length; i++) {
    if (frames[i].others) delete frames[i].others[id];
  }
  if (!frames.some((f) => figOf(f, id))) {
    delete figureDefs[id];
    strokes = strokes.filter((s) => s.fig !== id);
  }
  activeFig = 'b1';
  figureSelected = false;
  setStatus(current === 0 ? `🗑 ${name} retiré` : `🗑 ${name} retiré à partir de l'image ${current + 1}`);
  draw();
  renderTimeline();
}

addFigBtn.addEventListener('click', addFigure);
delFigBtn.addEventListener('click', deleteFigure);

prevBtn.addEventListener('click', () => goTo(current - 1));
nextBtn.addEventListener('click', () => goTo(current + 1));
addBtn.addEventListener('click', addFrame);
delBtn.addEventListener('click', deleteFrame);

// ===== Les textes : panneau de réglages =====
const addTextBtn = document.getElementById('addTextBtn');
const textProps = document.getElementById('textProps');
const textInput = document.getElementById('textInput');
const textColor = document.getElementById('textColor');
const textSize = document.getElementById('textSize');
const textAngle = document.getElementById('textAngle');
const textOpacity = document.getElementById('textOpacity');
const delTextBtn = document.getElementById('delTextBtn');
const textVisible = document.getElementById('textVisible');

function selectText(id) {
  selectedText = id;
  updateTextPanel();
}

// Affiche les réglages du texte sélectionné, pour l'image actuelle
function updateTextPanel() {
  textProps.hidden = !selectedText;
  if (!selectedText) return;
  const def = textDefs[selectedText];
  const st = frame().texts[selectedText];
  textInput.value = textContent(selectedText, st);
  textVisible.checked = st.visible !== false;
  textColor.value = def.color;
  textSize.value = st.size;
  textAngle.value = st.angle;
  textOpacity.value = Math.round(st.opacity * 100);
}

// Un nouveau texte apparaît À PARTIR de l'image actuelle (caché sur les images d'avant)
function addText() {
  const id = 't' + nextTextId++;
  textDefs[id] = { content: 'Texte', color: '#222222' };
  frames.forEach((f, i) => {
    f.texts[id] = {
      x: canvas.width / 2, y: 60, size: 48, angle: 0, opacity: 1,
      content: 'Texte',
      visible: i >= current,
    };
  });
  selectText(id);
  draw();
  refreshAllThumbs();
  textInput.focus();
  textInput.select(); // tu peux taper directement pour remplacer « Texte »
}

function deleteText() {
  if (!selectedText) return;
  delete textDefs[selectedText];
  for (const f of frames) delete f.texts[selectedText];
  selectText(null);
  draw();
  refreshAllThumbs();
}

addTextBtn.addEventListener('click', addText);
delTextBtn.addEventListener('click', deleteText);

// Applique un changement à l'image actuelle ET aux suivantes qui avaient la même valeur.
// Ex. : la réplique « Salut » va de l'image 3 à 6, puis « Ça va ? » à partir de la 7.
// Si on corrige « Salut » sur l'image 3, les images 3 à 6 changent, la 7 n'est pas touchée.
function applyForward(id, key, value) {
  const read = (st) => (key === 'content' ? textContent(id, st) : st[key] !== false);
  const old = read(frames[current].texts[id]);
  for (let i = current; i < frames.length; i++) {
    const st = frames[i].texts[id];
    if (i > current && read(st) !== old) break; // on s'arrête à la première image différente
    st[key] = value;
  }
}

// La réplique : propre à chaque image (pour les dialogues)
textInput.addEventListener('input', () => {
  applyForward(selectedText, 'content', textInput.value);
  draw();
  refreshAllThumbs();
});

// Visible ou caché sur cette image (et les suivantes identiques)
textVisible.addEventListener('change', () => {
  applyForward(selectedText, 'visible', textVisible.checked);
  draw();
  refreshAllThumbs();
});

// La couleur : la même sur toutes les images

textColor.addEventListener('input', () => {
  textDefs[selectedText].color = textColor.value;
  draw();
  refreshAllThumbs();
});

// Taille, rotation, opacité : seulement pour l'image actuelle → c'est ce qui s'anime
function bindFrameSlider(input, key, toValue) {
  input.addEventListener('input', () => {
    frame().texts[selectedText][key] = toValue(Number(input.value));
    draw();
    refreshCurrentThumb();
  });
}
bindFrameSlider(textSize, 'size', (v) => v);
bindFrameSlider(textAngle, 'angle', (v) => v);
bindFrameSlider(textOpacity, 'opacity', (v) => v / 100);

// ===== Étape 4 : la lecture =====

const playBtn = document.getElementById('playBtn');
const speed = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const loop = document.getElementById('loop');
const smooth = document.getElementById('smooth');

let playing = false;
let playI = 0;      // l'image clé de départ de la transition en cours
let playT = 0;      // l'avancement vers l'image suivante (0 → 1)
let lastTime = 0;   // horodatage du tick précédent
let rafId = null;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Interpolation : l'image « entre » a et b. t = 0 → a, t = 1 → b, t = 0.5 → pile au milieu.
// On interpole TOUT ce qui est un nombre : articulations ET réglages des textes.
function lerpFrame(a, b, t) {
  const out = {
    joints: {},
    texts: {},
    scale: lerp(figScale(a), figScale(b), t),
    hiddenStrokes: a.hiddenStrokes || [], // un élément apparaît / disparaît d'un coup, sur l'image clé
    strokeTf: {},
  };
  // Les éléments de décor animés glissent d'une image clé à l'autre, comme le bonhomme
  const tfIds = new Set([...Object.keys(a.strokeTf || {}), ...Object.keys(b.strokeTf || {})]);
  for (const id of tfIds) {
    const ta = tfOf(a, id);
    const tb = tfOf(b, id);
    out.strokeTf[id] = {
      x: lerp(ta.x, tb.x, t),
      y: lerp(ta.y, tb.y, t),
      angle: lerp(ta.angle, tb.angle, t),
      sx: lerp(ta.sx, tb.sx, t),
      sy: lerp(ta.sy, tb.sy, t),
    };
  }
  const lerpJoints = (ja, jb) => {
    const o = {};
    for (const name in ja) o[name] = { x: lerp(ja[name].x, jb[name].x, t), y: lerp(ja[name].y, jb[name].y, t) };
    return o;
  };
  out.joints = lerpJoints(a.joints, b.joints);
  // Les autres bonshommes : ils bougent s'ils sont sur les deux images ; sinon ils restent
  // tels quels jusqu'à l'image clé (un bonhomme apparaît / disparaît d'un coup)
  if (a.others) {
    out.others = {};
    for (const id in a.others) {
      const fa = a.others[id];
      const fb = b.others && b.others[id];
      out.others[id] = fb
        ? { joints: lerpJoints(fa.joints, fb.joints), scale: lerp(figScale(fa), figScale(fb), t) }
        : fa;
    }
  }
  for (const id in a.texts) {
    const sa = a.texts[id];
    const sb = b.texts[id];

    // Si la réplique change (ou si le texte apparaît / disparaît), ce n'est pas « le même »
    // texte qui bouge : on garde l'état de départ tel quel jusqu'à l'image clé suivante.
    // Sinon « YO! » rétrécirait vers la taille de la réplique suivante avant d'être remplacé.
    const sameLine = textContent(id, sa) === textContent(id, sb) &&
      (sa.visible !== false) === (sb.visible !== false);
    if (!sameLine) {
      out.texts[id] = { ...sa };
      continue;
    }

    // Même réplique : les nombres (position, taille, rotation, opacité) glissent en douceur
    out.texts[id] = {};
    for (const key in sa) {
      const va = sa[key];
      const vb = sb[key];
      out.texts[id][key] = typeof va === 'number' && typeof vb === 'number' ? lerp(va, vb, t) : va;
    }
  }
  return out;
}

// L'image qui suit l'image i pendant la lecture.
// En boucle : après la dernière, on revient à la première.
// Sans boucle : la dernière image est « tenue » le temps d'une transition, pour qu'on la voie
// (sinon la dernière réplique d'un dialogue ne s'afficherait jamais).
function nextIndex(i, n) {
  return loop.checked ? (i + 1) % n : Math.min(i + 1, n - 1);
}

// Courbe « ease-in-out » : démarre doucement, accélère, ralentit à l'arrivée
function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function showSpeed() {
  speedValue.textContent = `${(speed.value / 1000).toFixed(2)} s`;
}
speed.addEventListener('input', showSpeed);
// La durée par défaut change : les blocs des images sans durée propre s'élargissent / rétrécissent
speed.addEventListener('input', () => { if (!playing) renderTimeline(); });
showSpeed();

function highlightThumb(i) {
  [...timeline.children].forEach((t, k) => t.classList.toggle('active', k === i));
}

function tick(now) {
  const n = frames.length;
  // Une transition par image, chacune avec SA durée (en boucle, la dernière revient vers la
  // première ; sans boucle, la dernière est tenue — voir nextIndex)

  // On avance selon le temps écoulé : la vitesse reste la même quelle que soit la puissance de l'ordi
  // Math.max(0, …) : l'horodatage de requestAnimationFrame peut être un poil AVANT performance.now()
  // → temps négatif → image n° -1 → plantage. On l'empêche.
  let dt = Math.max(0, now - lastTime);
  lastTime = now;

  // On consomme le temps écoulé image par image (une image courte peut être « sautée » en un tick)
  while (dt > 0) {
    const left = (1 - playT) * frameDuration(playI); // temps restant pour finir cette transition
    if (dt < left) {
      playT += dt / frameDuration(playI);
      dt = 0;
    } else {
      dt -= left;
      playT = 0;
      playI += 1;
      if (playI >= n) {
        if (!loop.checked) {
          stopPlayback(n - 1); // fin de l'animation : on s'arrête sur la dernière image
          return;
        }
        playI = 0;
      }
    }
  }

  const i = playI;                      // image clé de départ
  let t = playT;                        // avancement vers la suivante (0 → 1)
  if (smooth.checked) t = ease(t);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFrame(ctx, lerpFrame(frames[i], frames[nextIndex(i, n)], t));

  highlightThumb(i);
  frameInfo.textContent = `Image ${i + 1} / ${n}`;

  rafId = requestAnimationFrame(tick);
}

function startPlayback() {
  if (exporting || frames.length < 2) return;
  playing = true;
  playI = current;                   // on démarre depuis l'image sélectionnée
  playT = 0;
  if (!loop.checked && current === frames.length - 1) playI = 0; // déjà au bout : on repart du début
  lastTime = performance.now();
  canvas.style.cursor = 'default';
  updateToolbar();
  rafId = requestAnimationFrame(tick);
}

// À l'arrêt, on revient en mode édition sur l'image clé où on en était
function stopPlayback(onFrame = playI) {
  playing = false;
  cancelAnimationFrame(rafId);
  goTo(onFrame);
}

playBtn.addEventListener('click', () => (playing ? stopPlayback() : startPlayback()));

// ===== Raccourcis clavier =====
document.addEventListener('keydown', (e) => {
  // Cmd+S (Mac) ou Ctrl+S : enregistrer le fichier au lieu de « Enregistrer la page » du navigateur
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveFile();
    return;
  }
  if (exporting) return; // pendant l'export, on ne touche à rien
  // Quand on tape dans le champ texte (ou qu'on règle un curseur), les raccourcis ne doivent pas se déclencher
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault(); // sinon Espace « clique » aussi le dernier bouton utilisé
    playing ? stopPlayback() : startPlayback();
    return;
  }
  if (playing) return; // pendant la lecture, pas d'édition
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoStroke();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault(); // sinon le navigateur sélectionne tout le texte de la page
    selectFigure();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    if (selectedStrokes.size) { e.preventDefault(); copyStrokes(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
    if (strokeClipboard) { e.preventDefault(); pasteStrokes(); }
    return;
  }
  if (e.metaKey || e.ctrlKey) return; // ne pas confondre Cmd+D, Cmd+P… avec les raccourcis d'outils
  if (e.key === 'v' || e.key === 'V') setTool('move');
  else if (e.key === 'p' || e.key === 'P') setTool('body');
  else if (e.key === 'd' || e.key === 'D') setTool('decor');
  else if (e.key === 'e' || e.key === 'E') setTool('erase');
  else if (e.key === 'h' || e.key === 'H') setTool('show');
  else if (e.key === 'ArrowLeft') goTo(current - 1);
  else if (e.key === 'ArrowRight') goTo(current + 1);
  else if (e.key === 'n' || e.key === 'N') addFrame();
  else if (e.key === 'o' || e.key === 'O') { onion.checked = !onion.checked; draw(); }
  else if (e.key === 't' || e.key === 'T') addText();
  else if (e.key === 'Escape') { selectText(null); figureSelected = false; clearStrokeSelection(); draw(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    // Des éléments sélectionnés ? On les supprime. Sinon, Suppr supprime l'image (comme avant).
    if (selectedStrokes.size > 0) deleteSelectedStrokes();
    else if (figureSelected && activeFig !== 'b1') deleteFigure(); // bonhomme ajouté sélectionné
    else deleteFrame();
  }
});

// ===== Étape 2 : tirer à la souris (articulations et textes) =====

let dragged = null;      // { kind: 'joint', name } ou { kind: 'text', id, dx, dy } ou null
const GRAB_RADIUS = 12;  // distance max (px) pour attraper un point

// Convertit la position de la souris en coordonnées du canvas
function mousePos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

// Trouve l'articulation la plus proche du point p (si assez proche), parmi tous les bonshommes
// de l'image → { fig, name } ou null. À égalité, le bonhomme actif passe en premier.
function jointAt(p) {
  let best = null;
  let bestDist = GRAB_RADIUS;
  const ids = [activeFig, ...figIds().filter((id) => id !== activeFig)];
  for (const fig of ids) {
    const fd = figOf(frame(), fig);
    if (!fd) continue;
    for (const name in fd.joints) {
      const d = Math.hypot(fd.joints[name].x - p.x, fd.joints[name].y - p.y);
      if (d < bestDist) { best = { fig, name }; bestDist = d; }
    }
  }
  return best;
}

// Rend un bonhomme actif (c'est lui qu'on bouge, et sur lui que le crayon ✏️ dessine)
function setActiveFig(id) {
  if (id === activeFig) return;
  activeFig = id;
  figureSelected = false;
  if (figIds().length > 1) setStatus(`${figName(id)} actif`);
  updateToolbar();
}

// L'état d'un bonhomme ajouté au début d'un geste (pour faire suivre les images suivantes)
function figSnapshot() {
  return activeFig === 'b1' ? null : structuredClone({ joints: pose(), scale: figScale(cur()) });
}

canvas.addEventListener('pointerdown', (e) => {
  if (playing) return; // pas d'édition pendant la lecture
  const p = mousePos(e);

  // Outils de dessin : on commence un trait (à main levée) ou une forme (on retient son point de départ)
  if (tool === 'body' || tool === 'decor') {
    drawing = [p];
    shapeStart = p;
    canvas.setPointerCapture(e.pointerId);
    draw();
    return;
  }
  // Gomme : on efface ce qui est sous la souris, et on continue tant que le bouton est enfoncé
  if (tool === 'erase') {
    erasing = true;
    eraseAt(p);
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // Apparition : pareil, mais on montre / cache au lieu d'effacer
  if (tool === 'show') {
    toggled = new Set();
    toggleAt(p);
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // Bonhomme entier sélectionné : d'abord les poignées (agrandir / tourner)…
  const handle = figureSelected ? handleAt(p) : null;
  if (handle) {
    const b = figureBox(pose());
    dragged = {
      kind: handle,                                // 'scale' ou 'rotate'
      start: p,
      center: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, // on agrandit / tourne autour du centre
      origJoints: structuredClone(pose()),         // la pose AVANT le geste : on recalcule
      origScale: figScale(cur()),                  // toujours depuis elle (pas d'erreurs cumulées)
      figBefore: figSnapshot(),
    };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // … puis un clic dans le cadre le déplace en bloc
  if (figureSelected && insideBox(p, figureBox(pose()))) {
    dragged = { kind: 'figure', last: p, figBefore: figSnapshot() };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // Clic ailleurs : on désélectionne le bonhomme
  if (figureSelected) {
    figureSelected = false;
    draw();
  }

  // Poignées des éléments de décor sélectionnés (tourner, agrandir, étirer)
  const dh = decorHandleAt(p);
  if (dh) {
    startDecorGesture(dh, p);
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // Les articulations sont prioritaires (elles sont petites, dur de les attraper sinon)
  const joint = jointAt(p);
  if (joint) {
    setActiveFig(joint.fig); // toucher un point d'un bonhomme le rend actif
    dragged = { kind: 'joint', name: joint.name, figBefore: figSnapshot() };
    clearStrokeSelection();
  } else {
    const id = textAt(p);
    const k = id ? -1 : strokeAt(p);
    if (id) {
      const st = frame().texts[id];
      // On retient le décalage pour que le texte ne « saute » pas sous la souris
      dragged = { kind: 'text', id, dx: st.x - p.x, dy: st.y - p.y };
      selectText(id);
      clearStrokeSelection();
    } else if (k >= 0) {
      // Clic sur un trait : on le sélectionne (Maj = on l'ajoute / l'enlève de la sélection)
      selectText(null);
      const sid = strokes[k].id;
      if (e.shiftKey) {
        selectedStrokes.has(sid) ? selectedStrokes.delete(sid) : selectedStrokes.add(sid);
      } else if (!selectedStrokes.has(sid)) {
        selectedStrokes = new Set([sid]); // (s'il est déjà sélectionné, on garde tout le groupe)
      }
      showStrokeSelection();
      // … et on peut directement le tirer pour le déplacer
      if (!e.shiftKey && selectedDecorIds().length) startDecorGesture('move', p);
    } else if (decorSelectionBox() && insideBox(p, decorSelectionBox())) {
      // Clic dans le cadre des éléments sélectionnés : on les déplace (plus facile que viser un trait fin)
      startDecorGesture('move', p);
    } else {
      // Clic dans le vide : on désélectionne, et on commence un cadre de sélection
      selectText(null);
      if (!e.shiftKey) clearStrokeSelection();
      dragged = { kind: 'marquee', start: p, end: p, additive: e.shiftKey };
    }
    draw();
  }
  if (dragged) canvas.setPointerCapture(e.pointerId); // garde le drag même hors du canvas
});

canvas.addEventListener('pointermove', (e) => {
  if (playing) return;
  const p = mousePos(e);

  if (drawing && shape !== 'free') {
    // Forme automatique : on la recalcule entièrement à chaque mouvement de souris
    drawing = makeShape(shape, shapeStart, p, e.shiftKey);
    draw();
    return;
  }
  if (drawing) {
    // On n'ajoute un point que si la souris a vraiment bougé (fichier plus léger)
    const last = drawing[drawing.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= 2) {
      drawing.push(p);
      draw();
    }
    return;
  }
  if (tool === 'erase') {
    if (erasing) eraseAt(p);
    canvas.style.cursor = strokeAt(p) >= 0 ? 'pointer' : 'cell';
    return;
  }
  if (tool === 'show') {
    if (toggled) toggleAt(p);
    canvas.style.cursor = strokeAt(p) >= 0 ? 'pointer' : 'default';
    return;
  }
  if (tool !== 'move') {
    canvas.style.cursor = 'crosshair';
    return;
  }

  if (dragged) {
    if (dragged.kind === 'figure') {
      // On décale TOUTES les articulations du même déplacement que la souris
      const dx = p.x - dragged.last.x;
      const dy = p.y - dragged.last.y;
      for (const name in pose()) {
        pose()[name].x += dx;
        pose()[name].y += dy;
      }
      dragged.last = p;
    } else if (dragged.kind === 'scale') {
      // Facteur = distance au centre maintenant / distance au centre au début du geste
      const { center: c, start, origJoints, origScale } = dragged;
      const d0 = Math.hypot(start.x - c.x, start.y - c.y) || 1;
      let factor = Math.hypot(p.x - c.x, p.y - c.y) / d0;
      factor = Math.max(0.1 / origScale, Math.min(10 / origScale, factor)); // taille entre ×0.1 et ×10
      for (const name in origJoints) {
        pose()[name].x = c.x + (origJoints[name].x - c.x) * factor;
        pose()[name].y = c.y + (origJoints[name].y - c.y) * factor;
      }
      cur().scale = origScale * factor;
      setStatus(`Taille ×${cur().scale.toFixed(2)}`, true);
    } else if (dragged.kind === 'rotate') {
      // Angle = angle de la souris autour du centre, moins l'angle au début du geste
      const { center: c, start, origJoints } = dragged;
      let angle = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
      if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12); // Maj : par pas de 15°
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const name in origJoints) {
        const dx = origJoints[name].x - c.x;
        const dy = origJoints[name].y - c.y;
        pose()[name].x = c.x + dx * cos - dy * sin;
        pose()[name].y = c.y + dx * sin + dy * cos;
      }
      let deg = Math.round((angle * 180) / Math.PI);
      deg = ((deg + 540) % 360) - 180; // ramené entre -180° et 180°
      setStatus(`Rotation ${deg}°`, true);
    } else if (dragged.kind === 'decor') {
      applyDecorGesture(dragged, p, e.shiftKey);
    } else if (dragged.kind === 'marquee') {
      dragged.end = p; // le cadre suit la souris (on sélectionne au relâchement)
      draw();
      return;
    } else if (dragged.kind === 'joint') {
      pose()[dragged.name].x = p.x;
      pose()[dragged.name].y = p.y;
    } else {
      const st = frame().texts[dragged.id];
      st.x = p.x + dragged.dx;
      st.y = p.y + dragged.dy;
    }
    draw();
    refreshCurrentThumb();
  }
  // Curseur : poignées, « déplacer » sur le bonhomme sélectionné, « main » sur un point ou un texte
  if (dragged && (dragged.kind === 'scale' || dragged.kind === 'rotate')) return; // garder le curseur du geste
  const h = !dragged && figureSelected ? handleAt(p) : null;
  if (h) {
    canvas.style.cursor = h === 'scale' ? 'nwse-resize' : 'grab';
    return;
  }
  if (!dragged && figureSelected && insideBox(p, figureBox(pose()))) {
    canvas.style.cursor = 'move';
    return;
  }
  if (dragged && dragged.kind === 'decor') return; // garder le curseur du geste
  const dhv = !dragged ? decorHandleAt(p) : null;
  if (dhv) {
    canvas.style.cursor = { rotate: 'grab', scale: 'nwse-resize', width: 'ew-resize', widthL: 'ew-resize', height: 'ns-resize' }[dhv];
    return;
  }
  const dbox = !dragged ? decorSelectionBox() : null;
  if (dbox && insideBox(p, dbox) && !jointAt(p) && !textAt(p)) {
    canvas.style.cursor = 'move';
    return;
  }
  if (!dragged && !jointAt(p) && !textAt(p) && strokeAt(p) >= 0) {
    canvas.style.cursor = 'pointer'; // un trait qu'on peut sélectionner
    return;
  }
  const hover = jointAt(p) || textAt(p);
  canvas.style.cursor = dragged ? 'grabbing' : (hover ? 'grab' : 'default');
});

// ===== Sélectionner tout le bonhomme =====

let figureSelected = false;

// Le rectangle qui entoure le bonhomme (on tient compte du rayon de la tête)
function figureBox(joints, scale = figScale(cur())) {
  const HEAD = HEAD_RADIUS * scale;
  const PAD = 12;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const name in joints) {
    const r = name === 'tete' ? HEAD : 0;
    minX = Math.min(minX, joints[name].x - r);
    minY = Math.min(minY, joints[name].y - r);
    maxX = Math.max(maxX, joints[name].x + r);
    maxY = Math.max(maxY, joints[name].y + r);
  }
  return { x: minX - PAD, y: minY - PAD, w: maxX - minX + 2 * PAD, h: maxY - minY + 2 * PAD };
}

function insideBox(p, b) {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

function drawFigureSelection() {
  const b = figureBox(pose());
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a6fdb';
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  // Les poignées
  const hs = handlePositions(b);
  ctx.setLineDash([]);
  ctx.fillStyle = 'white';
  // trait qui relie le cadre à la poignée de rotation
  ctx.beginPath();
  ctx.moveTo(hs.rotate.x, b.y);
  ctx.lineTo(hs.rotate.x, hs.rotate.y + HANDLE_SIZE / 2);
  ctx.stroke();
  // rond = tourner
  ctx.beginPath();
  ctx.arc(hs.rotate.x, hs.rotate.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // carré = agrandir
  ctx.fillRect(hs.scale.x - HANDLE_SIZE / 2, hs.scale.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  ctx.strokeRect(hs.scale.x - HANDLE_SIZE / 2, hs.scale.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  ctx.restore();
}

const HANDLE_SIZE = 12;

// Où sont les poignées : agrandir en bas à droite, tourner au-dessus du cadre
function handlePositions(b) {
  return {
    scale: { x: b.x + b.w, y: b.y + b.h },
    rotate: { x: b.x + b.w / 2, y: b.y - 28 },
  };
}

// Quelle poignée est sous le point p ? ('scale', 'rotate' ou null)
function handleAt(p) {
  const hs = handlePositions(figureBox(pose()));
  const grab = HANDLE_SIZE + 6; // plus large que la poignée dessinée : plus facile à attraper
  if (Math.hypot(p.x - hs.scale.x, p.y - hs.scale.y) <= grab) return 'scale';
  if (Math.hypot(p.x - hs.rotate.x, p.y - hs.rotate.y) <= grab) return 'rotate';
  return null;
}

function selectFigure() {
  if (tool !== 'move') setTool('move');
  selectText(null);
  figureSelected = true;
  const who = figIds().length > 1 ? figName(activeFig) : 'Bonhomme';
  const del = activeFig === 'b1' ? '' : ', Suppr pour le retirer à partir d’ici';
  setStatus(`${who} sélectionné : tire pour déplacer, ■ pour agrandir, ● pour tourner${del} (Échap pour finir)`);
  updateToolbar();
  draw();
}

// Double-clic sur un bonhomme : le sélectionne en entier (pratique aussi sur tablette).
// Plusieurs bonshommes sous la souris : le plus petit cadre gagne (celui qu'on vise vraiment).
canvas.addEventListener('dblclick', (e) => {
  if (playing || tool !== 'move') return;
  const p = mousePos(e);
  let best = null;
  let bestArea = Infinity;
  for (const id of figIds()) {
    const fd = figOf(frame(), id);
    if (!fd) continue;
    const b = figureBox(fd.joints, figScale(fd));
    if (insideBox(p, b) && b.w * b.h < bestArea) { best = id; bestArea = b.w * b.h; }
  }
  if (best) {
    activeFig = best;
    selectFigure();
  }
});

canvas.addEventListener('pointerup', () => {
  if (drawing) finishStroke();
  // Fin d'un geste sur un bonhomme ajouté : les images suivantes identiques suivent
  if (dragged && dragged.figBefore) propagateFigureForward(activeFig, dragged.figBefore);
  // Fin d'un geste agrandir / tourner : le message (taille, angle) s'efface tout seul
  if (dragged && dragged.kind === 'decor') propagateDecorForward(dragged.orig);
  if (dragged && (dragged.kind === 'scale' || dragged.kind === 'rotate' || dragged.kind === 'decor')) {
    setStatus(statusEl.textContent);
  }
  if (dragged && dragged.kind === 'marquee') {
    const m = dragged;
    dragged = null; // d'abord, sinon le cadre serait redessiné une dernière fois et resterait affiché
    finishMarquee(m);
  }
  dragged = null;
  erasing = false;
  toggled = null;
});
canvas.addEventListener('pointercancel', () => {
  drawing = null;
  dragged = null;
  erasing = false;
  toggled = null;
  draw();
});

// ===== Outils de dessin =====

const toolButtons = document.querySelectorAll('#toolBar .tool');
const strokeColor = document.getElementById('strokeColor');
const strokeWidth = document.getElementById('strokeWidth');         // diamètre de la brosse
const strokeHardness = document.getElementById('strokeHardness');   // dureté (100 % = bord net)
const shapeButtons = document.querySelectorAll('#drawBar .shape');
const brushPreview = document.getElementById('brushPreview');
const undoStrokeBtn = document.getElementById('undoStrokeBtn');
let erasing = false;

const toolHints = {
  move: '',
  body: '✏️ Le trait suit le membre le plus proche, à partir de cette image',
  decor: '🖌 Le décor apparaît à partir de cette image',
  erase: '🧽 Passe sur un trait pour l’effacer de toutes les images',
  show: '👁 Passe sur un élément pour le cacher / le montrer à partir de cette image',
};

function setTool(name) {
  tool = name;
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
  if (name !== 'move') {
    selectText(null);
    clearStrokeSelection();
  }
  canvas.style.cursor = name === 'move' ? 'default' : 'crosshair';
  if (name === 'body' && figIds().length > 1) {
    setStatus(`✏️ Tu dessines sur le ${figName(activeFig)} (touche un point d’un autre bonhomme avec ✋ pour changer)`);
  } else if (toolHints[name]) setStatus(toolHints[name]);
  draw(); // les points rouges ne s'affichent qu'avec l'outil « Bouger »
}

toolButtons.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

// --- Barre de dessin : forme, diamètre, dureté ---
function setShape(name) {
  shape = name;
  shapeButtons.forEach((b) => b.classList.toggle('active', b.dataset.shape === name));
  // Choisir une forme sans être en train de dessiner : on passe en 🖌 Décor (le cas le plus courant)
  if (tool !== 'body' && tool !== 'decor') setTool('decor');
  const hints = {
    free: '✍️ Main levée',
    line: '╱ Trait droit : tire d’un bout à l’autre (Maj : par pas de 45°)',
    rect: '▭ Rectangle : tire d’un coin à l’autre (Maj : carré)',
    circle: '◯ Cercle : clique au centre et tire le rayon',
    ellipse: '⬭ Ovale : tire d’un coin à l’autre (Maj : cercle)',
  };
  setStatus(hints[name]);
}
shapeButtons.forEach((b) => b.addEventListener('click', () => setShape(b.dataset.shape)));

// Aperçu de la brosse : un rond à la taille et à la dureté choisies
function updateBrushPreview() {
  const c = brushPreview.getContext('2d');
  c.clearRect(0, 0, brushPreview.width, brushPreview.height);
  const mid = brushPreview.width / 2;
  drawStroke(c, [{ x: mid, y: mid }], strokeColor.value, Math.min(Number(strokeWidth.value), 30),
    Number(strokeHardness.value) / 100);
  document.getElementById('widthValue').textContent = `${strokeWidth.value} px`;
  document.getElementById('hardnessValue').textContent = `${strokeHardness.value} %`;
}
[strokeWidth, strokeHardness, strokeColor].forEach((el) => el.addEventListener('input', updateBrushPreview));
updateBrushPreview();

// Arrondir au dixième de pixel : invisible à l'œil, mais le fichier de sauvegarde est bien plus léger
const round1 = (v) => Math.round(v * 10) / 10;

function finishStroke() {
  const pts = drawing;
  drawing = null;
  // Une forme minuscule (simple clic sans tirer) : on ne garde rien
  if (shape !== 'free') {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3) {
      draw();
      return;
    }
  }
  const s = { id: 's' + nextStrokeId++, kind: tool, color: strokeColor.value, width: Number(strokeWidth.value) };
  const hardness = Number(strokeHardness.value) / 100;
  if (hardness < 1) s.hardness = hardness; // (bord net = valeur par défaut, pas besoin de l'écrire)

  if (tool === 'body') {
    // On accroche le trait à l'os le plus proche de son centre
    const center = {
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    };
    s.bone = nearestBone(center, pose());
    // Ancre = l'articulation de cet os la plus proche du trait
    const [a, b] = s.bone;
    const dA = Math.hypot(center.x - pose()[a].x, center.y - pose()[a].y);
    const dB = Math.hypot(center.x - pose()[b].x, center.y - pose()[b].y);
    s.anchor = dB < dA ? 1 : 0;
    const f = boneFrame(pose(), s.bone, s.anchor);
    // On range le trait « à taille 1 » : s'il est dessiné sur un bonhomme agrandi, on divise
    const k = figScale(cur());
    s.points = pts.map((p) => toLocal(p, f)).map((q) => ({ x: q.x / k, y: q.y / k }));
    s.width = s.width / k;
    if (activeFig !== 'b1') s.fig = activeFig; // accroché au bonhomme actif (sélectionné)
  } else {
    s.points = pts;
  }
  s.points = s.points.map((p) => ({ x: round1(p.x), y: round1(p.y) }));
  // Décor : le centre du trait, autour duquel il tournera / s'étirera quand on l'anime
  if (s.kind === 'decor') s.pivot = centerOf(s.points);

  strokes.push(s);
  strokeHistory.push({ type: 'add', id: s.id });
  // Le trait apparaît À PARTIR de cette image : on le cache sur les images d'avant
  frames.forEach((f, i) => {
    if (i < current) f.hiddenStrokes = [...(f.hiddenStrokes || []), s.id];
  });
  afterStrokesChange();
}

// Retire complètement un trait (de la liste et des images où il était caché)
function removeStroke(k) {
  const [s] = strokes.splice(k, 1);
  for (const f of frames) {
    if (f.hiddenStrokes) f.hiddenStrokes = f.hiddenStrokes.filter((id) => id !== s.id);
  }
}

// --- Outil 👁 Apparition ---
let toggled = null; // traits déjà basculés pendant le geste en cours (chacun une seule fois)

// Montre ou cache le trait sous p, sur cette image ET les suivantes qui étaient pareilles
// (même règle que pour les textes)
function toggleAt(p) {
  const k = strokeAt(p);
  if (k < 0) return;
  const s = strokes[k];
  if (toggled.has(s.id)) return;
  toggled.add(s.id);

  const wasVisible = strokeVisible(frame(), s);
  for (let i = current; i < frames.length; i++) {
    const f = frames[i];
    if (i > current && strokeVisible(f, s) !== wasVisible) break; // première image différente : stop
    const hidden = (f.hiddenStrokes || []).filter((id) => id !== s.id);
    if (wasVisible) hidden.push(s.id); // il était visible → on le cache
    f.hiddenStrokes = hidden;
  }
  afterStrokesChange();
}

// Indice du trait sous le point p (le plus en avant d'abord), ou -1
function strokeAt(p) {
  for (let k = strokes.length - 1; k >= 0; k--) {
    const s = strokes[k];
    const pts = strokeWorld(s, frame());
    const tolerance = strokeWidthIn(s, frame()) / 2 + 6;
    if (pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= tolerance) return k;
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment(p, pts[i - 1], pts[i]) <= tolerance) return k;
    }
  }
  return -1;
}

function eraseAt(p) {
  const k = strokeAt(p);
  if (k >= 0) {
    deleteStrokes([strokes[k].id]);
    afterStrokesChange();
  }
}

// --- Historique des traits, pour Cmd+Z ---
// Chaque action est rangée ici : { type: 'add', id } quand on dessine un trait,
// { type: 'delete', items } quand on en supprime (gomme ou sélection).
// Annuler = défaire la dernière action.
let strokeHistory = [];

// Supprime des traits en gardant de quoi les remettre (position dans la liste + images où ils étaient cachés)
// record = false : l'appelant range lui-même l'action dans l'historique (renvoyée par la fonction)
function deleteStrokes(ids, record = true) {
  const items = [];
  for (const id of ids) {
    const index = strokes.findIndex((s) => s.id === id);
    if (index < 0) continue;
    const hiddenIn = frames.filter((f) => (f.hiddenStrokes || []).includes(id));
    items.push({ stroke: strokes[index], index, hiddenIn });
  }
  // On retire en partant de la fin, pour ne pas décaler les positions des suivants
  for (const it of [...items].sort((a, b) => b.index - a.index)) removeStroke(it.index);
  const action = { type: 'delete', items };
  if (record && items.length) strokeHistory.push(action);
  ids.forEach((id) => selectedStrokes.delete(id));
  return action;
}

// Cache des traits sur l'image en cours ET toutes les suivantes (ils restent sur les images d'avant).
// On note les images modifiées, pour pouvoir annuler.
function hideFromHere(ids) {
  const items = ids.map((id) => {
    const changed = [];
    for (let i = current; i < frames.length; i++) {
      const f = frames[i];
      if (!(f.hiddenStrokes || []).includes(id)) {
        f.hiddenStrokes = [...(f.hiddenStrokes || []), id];
        changed.push(f);
      }
    }
    return { id, changed };
  });
  return { type: 'hide', items };
}

// Défait une action de l'historique
function undoAction(action) {
  if (action.type === 'add') {
    // Défaire un dessin : on retire ce trait
    const index = strokes.findIndex((s) => s.id === action.id);
    if (index >= 0) removeStroke(index);
  } else if (action.type === 'delete') {
    // Défaire une suppression complète : on remet chaque trait à sa place, dans l'ordre
    for (const it of [...action.items].sort((a, b) => a.index - b.index)) {
      strokes.splice(Math.min(it.index, strokes.length), 0, it.stroke);
      for (const f of it.hiddenIn) {
        if (frames.includes(f)) f.hiddenStrokes = [...(f.hiddenStrokes || []), it.stroke.id];
      }
    }
  } else if (action.type === 'hide') {
    // Défaire « supprimer à partir d'ici » : on le rend de nouveau visible là où on l'avait caché
    for (const it of action.items) {
      for (const f of it.changed) {
        f.hiddenStrokes = (f.hiddenStrokes || []).filter((id) => id !== it.id);
      }
    }
  } else if (action.type === 'group') {
    // Plusieurs actions faites d'un seul geste : on les défait toutes, de la dernière à la première
    [...action.actions].reverse().forEach(undoAction);
  }
}

function undoStroke() {
  const action = strokeHistory.pop();
  if (!action) return;
  undoAction(action);
  const onlyAdds = action.type === 'add' || (action.type === 'group' && action.actions.every((a) => a.type === 'add'));
  if (action.type === 'group' && onlyAdds) setStatus('↶ Collage annulé');
  else if (!onlyAdds) setStatus('↶ Suppression annulée');
  afterStrokesChange();
}

undoStrokeBtn.addEventListener('click', undoStroke);

// --- Sélection d'éléments (outil ✋ Bouger) ---
let selectedStrokes = new Set(); // identifiants des traits sélectionnés
const delStrokeBtn = document.getElementById('delStrokeBtn');

function clearStrokeSelection() {
  if (selectedStrokes.size === 0) return;
  selectedStrokes = new Set();
  if (statusEl.textContent.includes('sélectionné')) setStatus(''); // effacer le message devenu faux
  updateToolbar();
}

function showStrokeSelection() {
  const n = selectedStrokes.size;
  if (n > 0) setStatus(`${n} élément(s) sélectionné(s) : Suppr pour supprimer, Maj+clic pour ajouter`);
  updateToolbar();
}

// Les traits sélectionnés sont surlignés en bleu
function drawStrokeSelection() {
  for (const s of strokes) {
    if (!selectedStrokes.has(s.id)) continue;
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawStroke(ctx, strokeWorld(s, frame()), '#2a6fdb', strokeWidthIn(s, frame()) + 10);
    ctx.restore();
  }
  // Cadre + poignées autour des éléments de décor sélectionnés (pour les animer)
  const box = decorSelectionBox();
  if (box && !(dragged && dragged.kind === 'marquee')) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2a6fdb';
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'white';
    const hs = decorHandlePositions(box);
    ctx.beginPath();
    ctx.moveTo(hs.rotate.x, box.y);
    ctx.lineTo(hs.rotate.x, hs.rotate.y + HANDLE_SIZE / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hs.rotate.x, hs.rotate.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2); // ● tourner
    ctx.fill();
    ctx.stroke();
    for (const h of [hs.scale, hs.width, hs.height]) {                      // ■ agrandir, largeur, hauteur
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
    ctx.restore();
  }
  // Le cadre de sélection en cours
  if (dragged && dragged.kind === 'marquee') {
    const { start: a, end: b } = dragged;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#2a6fdb';
    ctx.fillStyle = 'rgba(42, 111, 219, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  }
}

// Au relâchement : on sélectionne les traits ENTIÈREMENT dans le cadre
function finishMarquee({ start: a, end: b, additive }) {
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  if (box.w < 4 && box.h < 4) { draw(); return; } // simple clic dans le vide, pas un cadre
  if (!additive) selectedStrokes = new Set();
  for (const s of strokes) {
    const pts = strokeWorld(s, frame());
    if (pts.length && pts.every((p) => insideBox(p, box))) selectedStrokes.add(s.id);
  }
  showStrokeSelection();
  draw();
}

// Suppr sur une sélection : l'élément disparaît À PARTIR de cette image (et sur toutes les suivantes).
// S'il n'est visible sur aucune image d'avant, il ne servirait plus à rien : on le supprime vraiment.
function deleteSelectedStrokes() {
  const ids = [...selectedStrokes];
  if (ids.length === 0) return;

  const visibleBefore = (id) => {
    const s = strokes.find((st) => st.id === id);
    return frames.slice(0, current).some((f) => strokeVisible(f, s));
  };
  const toHide = ids.filter(visibleBefore);
  const toDelete = ids.filter((id) => !visibleBefore(id));

  const actions = [];
  if (toHide.length) actions.push(hideFromHere(toHide));
  if (toDelete.length) actions.push(deleteStrokes(toDelete, false));
  strokeHistory.push(actions.length === 1 ? actions[0] : { type: 'group', actions });
  selectedStrokes = new Set();

  setStatus(current === 0
    ? `🗑 ${ids.length} élément(s) supprimé(s) (Cmd+Z pour annuler)`
    : `🗑 ${ids.length} élément(s) supprimé(s) à partir de l'image ${current + 1} (Cmd+Z pour annuler)`);
  afterStrokesChange();
}

delStrokeBtn.addEventListener('click', deleteSelectedStrokes);

// --- Copier / coller des éléments ---
// Le « presse-papier » garde une copie des traits sélectionnés, TELS QU'ON LES VOIT sur l'image
// en cours (si une porte est ouverte ici, on copie la porte ouverte).
let strokeClipboard = null; // liste de traits copiés (ou null)
let pasteCount = 0;         // chaque collage est un peu plus décalé, pour ne pas s'empiler pile dessus
const copyBtn = document.getElementById('copyBtn');
const pasteBtn = document.getElementById('pasteBtn');

function copyStrokes() {
  const chosen = strokes.filter((s) => selectedStrokes.has(s.id));
  if (chosen.length === 0) return;
  strokeClipboard = chosen.map((s) => {
    const copy = structuredClone(s);
    if (s.kind === 'decor') {
      // on « fige » la transformation de cette image dans les points (la copie démarre droite)
      copy.points = strokeWorld(s, frame()).map((p) => ({ x: round1(p.x), y: round1(p.y) }));
      copy.width = strokeWidthIn(s, frame());
    }
    return copy;
  });
  pasteCount = 0;
  setStatus(`📋 ${chosen.length} élément(s) copié(s) : Cmd+V pour coller`);
  updateToolbar();
}

function pasteStrokes() {
  if (!strokeClipboard) return;
  pasteCount += 1;
  const OFFSET = 20 * pasteCount; // décalage en bas à droite
  const actions = [];
  const newIds = [];
  for (const src of strokeClipboard) {
    const s = structuredClone(src);
    s.id = 's' + nextStrokeId++;
    // (un trait du personnage reste accroché au même membre, décalé dans le repère de ce membre)
    s.points = s.points.map((p) => ({ x: p.x + OFFSET, y: p.y + OFFSET }));
    if (s.kind === 'decor') s.pivot = centerOf(s.points);
    strokes.push(s);
    // Comme un dessin : la copie apparaît à partir de l'image en cours
    frames.forEach((f, i) => {
      if (i < current) f.hiddenStrokes = [...(f.hiddenStrokes || []), s.id];
    });
    actions.push({ type: 'add', id: s.id });
    newIds.push(s.id);
  }
  strokeHistory.push({ type: 'group', actions }); // Cmd+Z annule tout le collage d'un coup
  // La copie collée est sélectionnée : on peut la tirer tout de suite où on veut
  if (tool !== 'move') setTool('move');
  selectedStrokes = new Set(newIds);
  setStatus(`📄 ${newIds.length} élément(s) collé(s) : tire-les pour les placer`);
  afterStrokesChange();
}

copyBtn.addEventListener('click', copyStrokes);
pasteBtn.addEventListener('click', pasteStrokes);

// Un trait apparaît sur toutes les images → on redessine tout, miniatures comprises
function afterStrokesChange() {
  draw();
  refreshAllThumbs();
  updateToolbar();
}

// ===== Étape 6 : sauvegarde et export =====

const newBtn = document.getElementById('newBtn');
const openBtn = document.getElementById('openBtn');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');

const STORAGE_KEY = 'batons.projet';
let exporting = false;

let statusTimer = null;
function setStatus(msg, keep = false) {
  statusEl.textContent = msg;
  clearTimeout(statusTimer);
  if (!keep) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 2500);
}

// Tout ce qu'il faut pour retrouver l'animation, sous forme d'objet simple (→ JSON)
function projectData() {
  return {
    version: 1,
    frames,
    textDefs,
    nextTextId,
    strokes,
    figures: figureDefs, // les bonshommes ajoutés (couleur, numéro)
    nextFigId,
    settings: { speed: Number(speed.value), loop: loop.checked, smooth: smooth.checked },
  };
}

// Recharge une animation. On vérifie un minimum pour ne pas casser l'appli avec un mauvais fichier.
function loadProject(data) {
  if (!data || !Array.isArray(data.frames) || data.frames.length === 0) {
    throw new Error('fichier invalide');
  }
  // Animations enregistrées avec la version « plusieurs personnages » (essai retiré) :
  // on garde le 1er personnage, pour ne rien perdre
  for (const f of data.frames) {
    if (!f.joints && Array.isArray(f.figs) && f.figs[0]) {
      f.joints = f.figs[0].joints;
      f.scale = f.figs[0].scale;
    }
  }
  for (const f of data.frames) {
    for (const name in startPose) {
      if (!f.joints || !f.joints[name]) throw new Error('pose incomplète');
    }
  }
  const defs = data.textDefs || {};

  // Les bonshommes ajoutés (absents des fichiers d'avant)
  const figs = data.figures && typeof data.figures === 'object' ? data.figures : {};
  const othersOf = (f) => {
    if (!f.others || typeof f.others !== 'object') return null;
    const o = {};
    for (const id in f.others) {
      const fd = f.others[id];
      if (figs[id] && fd && fd.joints && Object.keys(startPose).every((n) => fd.joints[n])) {
        o[id] = { joints: fd.joints, scale: fd.scale ?? 1 };
      }
    }
    return Object.keys(o).length ? o : null;
  };

  // On remplace le contenu (frames et textDefs sont des « const » : on les vide puis on les remplit)
  frames.length = 0;
  for (const f of data.frames) {
    const texts = {};
    for (const id in defs) {
      // Si une image n'a pas l'état d'un texte, on lui en donne un par défaut
      const st = (f.texts && f.texts[id]) || { x: canvas.width / 2, y: 60, size: 48, angle: 0, opacity: 1 };
      // Anciens fichiers : le contenu était commun à toutes les images, et le texte toujours visible
      st.content ??= defs[id].content;
      st.visible ??= true;
      texts[id] = st;
    }
    frames.push({
      joints: f.joints,
      texts,
      scale: f.scale ?? 1,
      hiddenStrokes: Array.isArray(f.hiddenStrokes) ? f.hiddenStrokes : [],
      strokeTf: f.strokeTf && typeof f.strokeTf === 'object' ? f.strokeTf : {},
      // les bonshommes ajoutés présents sur cette image (seulement ceux dont la pose est complète)
      ...(othersOf(f) ? { others: othersOf(f) } : {}),
      // durée propre à cette image (sinon : durée par défaut)
      ...(typeof f.duration === 'number' && f.duration > 0 ? { duration: f.duration } : {}),
    });
  }
  for (const id in textDefs) delete textDefs[id];
  Object.assign(textDefs, defs);
  nextTextId = data.nextTextId || Object.keys(defs).length + 1;
  figureDefs = figs;
  nextFigId = data.nextFigId || Object.keys(figs).length + 2;
  activeFig = 'b1';
  figureSelected = false;

  // Les traits (absents des fichiers enregistrés avant l'outil de dessin)
  strokes = (Array.isArray(data.strokes) ? data.strokes : []).filter((s) =>
    Array.isArray(s.points) && s.points.length > 0 &&
    (s.kind === 'decor' || (s.kind === 'body' && Array.isArray(s.bone) &&
      s.bone.every((name) => name in startPose) && (!s.fig || figs[s.fig]))));
  // Les traits des anciens fichiers n'ont pas d'identifiant : on leur en donne un
  let maxId = 0;
  for (const s of strokes) {
    const n = Number(String(s.id || '').slice(1));
    if (n > maxId) maxId = n;
  }
  for (const s of strokes) if (!s.id) s.id = 's' + ++maxId;
  // Anciens fichiers : les traits de décor n'avaient pas de pivot (centre de rotation)
  for (const s of strokes) if (s.kind === 'decor' && !s.pivot) s.pivot = centerOf(s.points);
  nextStrokeId = maxId + 1;
  strokeHistory = [];                 // l'historique ne concerne que l'animation qu'on vient de quitter
  selectedStrokes = new Set();

  if (data.settings) {
    speed.value = data.settings.speed ?? speed.value;
    loop.checked = data.settings.loop ?? loop.checked;
    smooth.checked = data.settings.smooth ?? smooth.checked;
    showSpeed();
  }
  selectedText = null;
  goTo(0);
}

// --- Sauvegarde automatique dans le navigateur ---
// On attend une demi-seconde de calme avant d'écrire (sinon on écrirait 60 fois/s pendant un drag)
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectData()));
    } catch (err) {
      setStatus('⚠️ Sauvegarde auto impossible (navigation privée ?)');
    }
  }, 500);
}
speed.addEventListener('input', scheduleSave);
loop.addEventListener('change', scheduleSave);
smooth.addEventListener('change', scheduleSave);

function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      loadProject(JSON.parse(raw));
      setStatus('✓ Animation précédente retrouvée');
    }
  } catch (err) {
    // Sauvegarde absente ou abîmée : on démarre simplement avec une animation vide
  }
}

// --- Fichiers : enregistrer / ouvrir ---
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function saveFile() {
  const json = JSON.stringify(projectData());
  download(new Blob([json], { type: 'application/json' }), 'animation.batons.json');
  setStatus('✓ Fichier téléchargé');
}

saveBtn.addEventListener('click', saveFile);
openBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    loadProject(JSON.parse(await file.text()));
    setStatus(`✓ « ${file.name} » ouvert`);
  } catch (err) {
    setStatus(`⚠️ Impossible d'ouvrir ce fichier (${err.message})`);
  }
  fileInput.value = ''; // pour pouvoir rouvrir le même fichier
});

newBtn.addEventListener('click', () => {
  if (!confirm('Tout effacer et recommencer une animation vide ?')) return;
  loadProject({ frames: [{ joints: structuredClone(startPose), texts: {} }], textDefs: {}, nextTextId: 1 });
  setStatus('Nouvelle animation');
});

// --- Export vidéo ---
// On rejoue l'animation sur un canvas caché à fond blanc, et le navigateur l'enregistre (MediaRecorder)

// Dessine l'animation à la position pos (même calcul que la lecture)
function renderAt(c, pos) {
  const n = frames.length;
  const i = Math.max(0, Math.min(Math.floor(pos), n - 1)); // jamais d'image n° -1
  let t = pos - i;
  if (smooth.checked) t = ease(t);
  c.fillStyle = 'white';                   // sinon le fond de la vidéo serait noir
  c.fillRect(0, 0, canvas.width, canvas.height);
  drawFrame(c, lerpFrame(frames[i], frames[nextIndex(i, n)], t));
}

async function exportVideo() {
  if (frames.length < 2 || exporting) return;
  if (playing) stopPlayback();

  // MP4 si le navigateur sait faire (Safari, Chrome récent), sinon WebM
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
  if (!mime || !canvas.captureStream) {
    setStatus("⚠️ Ce navigateur ne sait pas exporter de vidéo");
    return;
  }

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext('2d');

  const n = frames.length;
  // Durée totale = la somme des durées de chaque image (comme la lecture, voir nextIndex)
  const durations = frames.map((_, i) => frameDuration(i));
  const totalMs = durations.reduce((a, b) => a + b, 0);
  // Temps écoulé → position dans l'animation (ex. 2.25 = un quart du chemin de l'image 3 à la 4)
  const posAt = (ms) => {
    for (let i = 0; i < n; i++) {
      if (ms < durations[i]) return i + ms / durations[i];
      ms -= durations[i];
    }
    return n - 1e-6;
  };

  const recorder = new MediaRecorder(out.captureStream(30), { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  exporting = true;
  playing = true; // bloque l'édition pendant l'export
  updateToolbar();

  try {
  renderAt(c, 0);
  recorder.start();
  const t0 = performance.now();

  await new Promise((resolve, reject) => {
    function step(now) {
     try {
      const elapsed = Math.max(0, now - t0); // voir la remarque dans tick()
      if (elapsed >= totalMs) {
        resolve();
        return;
      }
      renderAt(c, posAt(elapsed));
      // On affiche aussi l'animation dans la scène pour voir où en est l'export
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(out, 0, 0);
      setStatus(`🎬 Export… ${Math.round((elapsed / totalMs) * 100)} %`, true);
      requestAnimationFrame(step);
     } catch (err) {
      reject(err); // une erreur dans la boucle ne doit pas bloquer l'export en silence
     }
    }
    requestAnimationFrame(step);
  });

  // Petite pause pour que la dernière image soit bien enregistrée
  await new Promise((r) => setTimeout(r, 200));
  recorder.stop();
  await stopped;

  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime }), `animation.${ext}`);
  setStatus(`✓ Vidéo ${ext.toUpperCase()} téléchargée`);
  } catch (err) {
    if (recorder.state !== 'inactive') recorder.stop();
    setStatus(`⚠️ L'export a échoué : ${err.message}`);
    console.error(err);
  } finally {
    // Quoi qu'il arrive, on rend la main
    exporting = false;
    playing = false;
    goTo(current);
  }
}

exportBtn.addEventListener('click', exportVideo);

// ===== Démarrage =====
loadAutosave();
draw();
renderTimeline();
