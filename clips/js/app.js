/*
 * «КуроМур: Комната почёта» — праздничный музей (Three.js, библиотека в /vendor).
 *
 * Референс: kuromurinfo.carrd.co — Куромур любит котиков и суши, атмосфера
 * нежная и праздничная: пастельные стены, торты, воздушные шары, конфетти,
 * котики гуляют по залам. Без скримеров и мрачностей ✧
 *
 * Планировка: коридор по центру, залы 2×2 с двумя дверями в каждый.
 *   Зал 1 — лучшие (1–12), Зал 2 — 13–24, Зал 3 — 25–36, Зал 4 — 37–48,
 *   коридор — 49–60. Стены-перегородки — ОБЪЁМНЫЕ (толщина 0.3 м).
 *   Отступ между картинами — удвоенный (комнаты соответственно шире).
 *
 * Загрузка: видео не качается заранее. Превью (лёгкий webp) — все сразу,
 * залы по приближению). Видео — только по клику, без повтора; при клике
 * на другую картину предыдущее останавливается, фоновая музыка приглушается.
 * При паузе (Esc / потеря фокуса) весь звук выключается.
 */
import * as THREE from "../vendor/three.module.js";

/* ------------------------------ настройки ------------------------------ */
const CFG = {
  eyeHeight: 1.7,
  walkSpeed: 5.4,
  runSpeed: 10.0,
  mouseSense: 0.0022,
  smooth: 12,

  // прыжок и присед
  jumpSpeed: 5.2,        // начальная вертикальная скорость (м/с)
  gravity: 15,           // ускорение падения (м/с²) — чуть电影的 земного, чтобы прыжок был «мягким»
  crouchEye: 1.0,        // высота глаз в приседе (м)
  crouchSpeed: 0.5,      // доля скорости ходьбы в приседе

  hallW: 10,            // ширина коридора
  hallHalf: 24,         // половина длины коридора (должна вмещать 2 зала по 22 м)
  roomW: 22,            // размер зала (увеличен под удвоенные отступы)
  wallT: 0.3,           // толщина объёмных стен-перегородок
  rowY: 1.85,
  H: 3.8,               // высота потолков
  doorHalf: 1.7,
  doorH: 2.5,
  doorOffset: 5.5,      // смещение дверей от центра зала (двери z = ±6 и ±17)
  porchLen: 4,

  // картины: на 10 % меньше прежнего (2.5 × 1.4 → ×1.5 → 3.4 × 1.9)
  videoW: 3.4,
  videoH: 1.9,
  frameGap: 0.09,
  roomCell: 5.2,        // шаг картин в зале
  hallCell: 5.0,        // шаг картин в коридоре

  audioRef: 1.6,
  audioMax: 8.0,
  previewMaxW: 640,
  previewQuality: 0.42,
  lazyDist: 20,

  defaultVolume: 0.6,
  musicVolume: 0.005,  // мелодия при входе — едва слышна (0.5 %)
};

/* палитра Куромур: пастель + мятный + розовый */
const PAL = {
  wall: 0xfdeef2,        // нежно-розовый
  wallTrim: 0xffd9e8,
  floor: 0xfff6ea,       // кремовый
  floorLine: 0xf3d8c8,
  ceil: 0xeafaf7,        // мятный
  accent: 0xff9ec0,      // розовый акцент
  accent2: 0x9fdccf,     // мята
  accent3: 0xffd97a,     // солнечный
  frame: 0xffffff,
};

/* ------------------------------ DOM ------------------------------ */
const $ = (id) => document.getElementById(id);
const canvas = $("scene");
const overlay = $("overlay");
const ovTitle = $("ov-title");
const ovSub = $("ov-sub");
const statusEl = $("status");
const barFill = $("bar-fill");
const startBtn = $("btn-start");
const volHud = $("vol-hud");
const hintHud = $("hint-hud");
const crosshair = $("crosshair");
const minimap = $("minimap");
const bigmap = $("bigmap");
const bigmapCanvas = $("bigmap-canvas");
const playerBadge = $("player-badge");
const playerName = $("player-name");

/* ------------------------------ состояние ------------------------------ */
let renderer, scene, camera, listener;
let yaw = 0, pitch = 0;
const keys = new Set();
const velocity = new THREE.Vector3();
let started = false, ready = false;
const UP = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);

const colliders = [];
const currentSlots = [];
const clickables = [];
const videoElements = [];
const lazyZones = [];

const balloons = [];    // воздушные шары
const confettiBursts = []; // активные залпы конфетти
const cats = [];        // гуляющие коты
const candles = [];     // свечки на тортах (свет)
const flameMeshes = []; // язычки пламени (анимация)
const teleportButtons = []; // кнопки телепорта на стенах тупиков лабиринта
let lastTeleport = -10; // защита от повторных срабатываний
let mazeSafeCells = []; // обычные клетки прохода (цели телепорта)

let activeSlot = null;  // картина, чьё видео играет

const HW = CFG.hallW / 2;
const Z_HALL = CFG.hallHalf;
const ROOM_HALF = CFG.roomW / 2;
// залы стоят по бокам коридора: нижняя пара (1 и 4) со центром z = +11.5,
// верхняя пара (2 и 3) — z = −11.5. Двери выходят в коридор на z = ±5 и ±18.
const ROOM_CZ = ROOM_HALF + 0.5;

const ROOMS = [
  { n: 1, name: "Зал 1 · Лучшие", cx: -(HW + CFG.wallT + ROOM_HALF), cz: +ROOM_CZ, doorX: -HW, left: true },
  { n: 2, name: "Зал 2", cx: -(HW + CFG.wallT + ROOM_HALF), cz: -ROOM_CZ, doorX: -HW, left: true },
  { n: 3, name: "Зал 3", cx: +(HW + CFG.wallT + ROOM_HALF), cz: -ROOM_CZ, doorX: +HW, left: false },
  { n: 4, name: "Зал 4", cx: +(HW + CFG.wallT + ROOM_HALF), cz: +ROOM_CZ, doorX: +HW, left: false },
];

window.HALL = {
  ready: false, count: 0, previews: 0,
  mp: () => mpDebugInfo(), // диагностика мультиплеера: role/conns/ghosts
  volume: () => (listener ? listener.getMasterVolume() : null),
  audioState: () => (listener ? listener.context.state : "no-context"),
  musicPlaying: () => !!(music && music.isPlaying),
  playing: () => videoElements.filter((v) => !v.paused).length,
  slots: () => currentSlots.map((s) => ({
    file: s.video.file, preview: !!s.previewTex, loaded: !!s.el, playing: s.playing,
    x: +s.group.position.x.toFixed(2), z: +s.group.position.z.toFixed(2), zone: s.zoneName,
    ry: +s.group.rotation.y.toFixed(2), sx: s.group.scale.x,
  })),
  play: (i) => { togglePlayback(currentSlots[i]); return currentSlots[i].playing; },
  pos: () => ({ x: +camera.position.x.toFixed(2), z: +camera.position.z.toFixed(2) }), // отладка
  tp: (x, z, yawRad) => {
    camera.position.set(x, CFG.eyeHeight, z);
    if (typeof yawRad === "number") { yaw = yawRad; camera.rotation.y = yaw; }
    return { x, z };
  },
  rooms: () => ROOMS.map((r) => ({ name: r.name, x: r.cx, z: r.cz })),
  maze: (side = 0) => {
    const x = side ? 16.3 : -16.3;
    camera.position.set(x, CFG.eyeHeight, -20.2);
    yaw = 0; camera.rotation.y = 0;
    return { x, z: -20.2 };
  }, // телепорт ко входу в лабиринт
  boxes: colliders, // отладка: живой список коллайдеров
  confetti: () => fireConfetti(camera.position.x, camera.position.z), // залп вручную
  // отладка: что видит прицел (кнопки телепорта / клипы)
  rayAt: () => {
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(CENTER, camera);
    return raycaster.intersectObjects(clickables, false).slice(0, 6).map((h) => ({
      d: +h.distance.toFixed(2),
      teleport: !!h.object.userData.teleport,
      clip: h.object.userData.slot ? h.object.userData.slot.video.file.slice(0, 30) : null,
      at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
    }));
  },
};

/* ------------------------------ запуск ------------------------------ */
main().catch((err) => {
  console.error(err);
  statusEl.textContent = "Ошибка: " + err.message;
  startBtn.disabled = true;
});

async function main() {
  initRenderer();

  const [data, mData] = await Promise.all([
    fetchJSON("videos.json"),
    fetchJSON("videos-maze.json").catch(() => ({ videos: [] })), // лабиринт опционален
  ]);
  const videos = data.videos || [];
  window.HALL.count = videos.length;
  window.HALL.mazeCount = (mData.videos || []).length;

  buildWorld(videos, mData.videos || []);
  updateBar(0, currentSlots.length);

  yaw = 0;
  camera.position.set(0, CFG.eyeHeight, Z_HALL + 2.2);
  camera.rotation.y = yaw;
  camera.far = 160;
  camera.updateProjectionMatrix();

  ready = true;
  window.HALL.ready = true;

  preparePreviews();
  loadMusic();
}

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    throw new Error("WebGL недоступен. Включите аппаратное ускорение в браузере.");
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfff3f6);
  scene.fog = new THREE.Fog(0xfff3f6, 40, 95); // лёгкая дымка вдали

  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 160);
  camera.rotation.order = "YXZ";

  listener = new THREE.AudioListener();
  // для буста до 150% держим наготове компрессор: пики мягко удерживаются,
  // поэтому усиление реально слышно и на видео, и на музыке (без хрипа).
  // Вставляется в цепь только пока громкость > 100%.
  const comp = listener.context.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  listener._boostComp = comp;
  listener.setMasterVolume(CFG.defaultVolume);
  camera.add(listener);
  scene.add(camera);

  // тёплый праздничный свет
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0xffd9e8, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0dd, 0.8);
  sun.position.set(3, 8, 2);
  scene.add(sun);
}

function fetchJSON(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status + " от " + url);
    return r.json();
  });
}

/* ============================== ТЕКСТУРЫ ============================== */

function makeCanvasTexture(size, draw, repX, repY) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// нежные стены: пастель + панель снизу + лапки-узор
function wallTexture(len, h) {
  return makeCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#fdeef2"; ctx.fillRect(0, 0, s, s);
    // панель снизу
    ctx.fillStyle = "#ffd9e8"; ctx.fillRect(0, s * 0.72, s, s * 0.28);
    ctx.strokeStyle = "#f7b8d0"; ctx.lineWidth = 4;
    ctx.strokeRect(-2, s * 0.72, s + 4, s * 0.28);
    // лапки
    ctx.fillStyle = "rgba(255,158,192,0.35)";
    for (let i = 0; i < 5; i++) {
      const x = 20 + Math.random() * (s - 40), y = s * 0.1 + Math.random() * s * 0.5;
      const r = 5 + Math.random() * 3;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, 0, 0, 7); ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x - r + k * r, y - r * 1.1, r * 0.38, r * 0.42, 0, 0, 7);
        ctx.fill();
      }
    }
    // звёздочки
    ctx.fillStyle = "rgba(159,220,207,0.5)";
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * s, y = Math.random() * s * 0.7, r = 2 + Math.random() * 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, Math.max(1, Math.round(len / 5)), Math.max(1, Math.round(h / 3)));
}

// кремовый пол с шахматным нежным узором
function floorTexture(repX, repY) {
  return makeCanvasTexture(256, (ctx, s) => {
    const half = s / 2;
    ctx.fillStyle = "#fff6ea"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#ffeee0"; ctx.fillRect(0, 0, half, half); ctx.fillRect(half, half, half, half);
    ctx.strokeStyle = "rgba(243,216,200,0.9)"; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s); ctx.strokeRect(0, 0, half, half); ctx.strokeRect(half, half, half, half);
    // редкие сусальные звёздочки
    ctx.fillStyle = "rgba(255,214,122,0.55)";
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, Math.max(1, repX), Math.max(1, repY));
}

function ceilTexture(repX, repY) {
  return makeCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#eafaf7"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(190,230,220,0.8)"; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    // облачка
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 + Math.random() * 12, 8 + Math.random() * 6, 0, 0, 7);
      ctx.ellipse(x + 14, y + 3, 12, 7, 0, 0, 7);
      ctx.fill();
    }
  }, Math.max(1, repX), Math.max(1, repY));
}

function labelText(fileName) {
  let base = fileName.replace(/\.[^.]+$/, "");
  base = base.replace(/^\d+[\s._-]*/, "").trim();
  return base || fileName.replace(/\.[^.]+$/, "");
}

function labelTexture(text) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 120;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff9fb"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#ff9ec0"; ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  let px = 60;
  ctx.font = `700 ${px}px "Comic Sans MS", "Segoe UI", system-ui, sans-serif`;
  while (ctx.measureText(text).width > c.width - 52 && px > 18) {
    px -= 4;
    ctx.font = `700 ${px}px "Comic Sans MS", "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillStyle = "#d94f7e";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function signTexture(lines, { w = 1024, h = 256, accent = "#ff7fae", font = 88 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff9fb"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent; ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const n = lines.length;
  lines.forEach((line, i) => {
    let px = font;
    ctx.font = `800 ${px}px "Comic Sans MS", "Segoe UI", system-ui, sans-serif`;
    while (ctx.measureText(line).width > w - 60 && px > 24) {
      px -= 4;
      ctx.font = `800 ${px}px "Comic Sans MS", "Segoe UI", system-ui, sans-serif`;
    }
    ctx.fillStyle = n === 1 ? "#d94f7e" : (i === 0 ? "#d94f7e" : "#8a6a75");
    ctx.fillText(line, w / 2, h * ((i + 0.5) / n));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// мордочка кота для спрайтов-гостей (если пригодится) — не используется, но пусть
function catFaceTexture(color = "#e8b98a") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(64, 74, 40, 34, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(28, 56); ctx.lineTo(38, 22); ctx.lineTo(52, 46); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(100, 56); ctx.lineTo(90, 22); ctx.lineTo(76, 46); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#333";
  ctx.beginPath(); ctx.arc(50, 70, 5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(78, 70, 5, 0, 7); ctx.fill();
  ctx.strokeStyle = "#333"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(58, 84); ctx.quadraticCurveTo(64, 90, 70, 84); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ============================== ДЕКОР ============================== */

// воздушный шар на нитке (привязан к потолку, покачивается)
function makeBalloon(x, z, color, h = CFG.H) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), mat);
  ball.scale.y = 1.2;
  g.add(ball);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 8), mat);
  knot.position.y = -0.4; knot.rotation.x = Math.PI;
  g.add(knot);
  // нитка до потолка
  const len = h - 0.55;
  const thread = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.44, 0), new THREE.Vector3(0, -len, 0)]),
    new THREE.LineBasicMaterial({ color: 0xd8c8d0, transparent: true, opacity: 0.7 })
  );
  g.add(thread);
  g.position.set(x, h - 0.35, z);
  scene.add(g);
  balloons.push({ g, baseX: x, baseZ: z, baseY: h - 0.35, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 0.5 });
}

// торт на тумбе: цифра «3» сверху + 3 свечки
function makeCake(x, z) {
  const g = new THREE.Group();
  // тумба
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.62, 0.9, 20),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  stand.position.y = 0.45;
  g.add(stand);
  // коржи
  const c1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.16, 24),
    new THREE.MeshLambertMaterial({ color: 0xffe3ef })
  );
  c1.position.y = 1.0;
  g.add(c1);
  const c2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.14, 24),
    new THREE.MeshLambertMaterial({ color: 0xfff0d9 })
  );
  c2.position.y = 1.15;
  g.add(c2);
  // «крем» по верхнему краю каждого коржа
  const creamMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const cream1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 26), creamMat);
  cream1.rotation.x = Math.PI / 2;
  cream1.position.y = 1.08;
  g.add(cream1);
  const cream2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24), creamMat);
  cream2.rotation.x = Math.PI / 2;
  cream2.position.y = 1.22;
  g.add(cream2);

  // посыпка на коржах (мелкие разноцветные палочки)
  const sprinkleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5);
  const sprinkleColors = [0xff5d8f, 0x9fdccf, 0xffd97a, 0xb3d4ff, 0xc7f0bd, 0xffb3c6];
  const sprinkleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sprinkles = new THREE.InstancedMesh(sprinkleGeo, sprinkleMat, 150);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let si = 0;
  while (si < 150) {
    // 2/3 на нижнем корже (кольцо вокруг верхнего яруса), остальные — на верхнем
    const onLower = si % 3 !== 2;
    const rMax = onLower ? 0.41 : 0.29;
    const rMin = onLower ? 0.31 : 0.06;
    const ang = Math.random() * Math.PI * 2;
    const rr = rMin + Math.random() * (rMax - rMin);
    dummy.position.set(Math.cos(ang) * rr, onLower ? 1.085 : 1.225, Math.sin(ang) * rr);
    dummy.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
    dummy.updateMatrix();
    sprinkles.setMatrixAt(si, dummy.matrix);
    sprinkles.setColorAt(si, col.setHex(sprinkleColors[si % sprinkleColors.length]));
    si++;
  }
  g.add(sprinkles);

  // конфеты-драже по краю нижнего коржа
  const candyColors = [0xff5d73, 0x77d8b8, 0xffd166, 0x6fb6ff, 0xc78bff];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.35;
    const candy = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      new THREE.MeshLambertMaterial({ color: candyColors[i % candyColors.length] })
    );
    candy.position.set(Math.cos(ang) * 0.36, 1.1, Math.sin(ang) * 0.36);
    g.add(candy);
  }

  // цифра «3» над тортом — спрайт, повёрнут к игроку с любой стороны
  const threeCv = document.createElement("canvas");
  threeCv.width = 256; threeCv.height = 320;
  const tc = threeCv.getContext("2d");
  tc.font = '900 250px "Comic Sans MS", "Segoe UI", system-ui, sans-serif';
  tc.textAlign = "center"; tc.textBaseline = "middle";
  tc.lineWidth = 26; tc.strokeStyle = "#ffffff"; tc.lineJoin = "round";
  tc.strokeText("3", 128, 170);
  tc.fillStyle = "#ff5d8f";
  tc.fillText("3", 128, 170);
  const threeTex = new THREE.CanvasTexture(threeCv);
  threeTex.anisotropy = 4;
  // палочка-держатель, чтобы цифра не висела в воздухе
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  stick.position.set(0, 1.38, 0);
  g.add(stick);
  const three = new THREE.Sprite(new THREE.SpriteMaterial({ map: threeTex, depthWrite: false }));
  three.scale.set(0.5, 0.62, 1);
  three.position.set(0, 1.66, 0);
  g.add(three);
  // 3 свечки вокруг цифры + живое пламя
  const candleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8);
  const candleMats = [0x9fdccf, 0xffd97a, 0xb3d4ff];
  [[-0.3, 0.16], [0.26, 0.22], [0.02, -0.32]].forEach(([dx, dz], i) => {
    const candle = new THREE.Mesh(candleGeo, new THREE.MeshLambertMaterial({ color: candleMats[i] }));
    candle.position.set(dx, 1.24, dz);
    g.add(candle);
    // фитиль
    const wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    wick.position.set(dx, 1.34, dz);
    g.add(wick);
    // язычок пламени (двухслойный: тёплый ореол + ядро)
    const flame = new THREE.Group();
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.55 })
    );
    halo.scale.set(1, 1.7, 1);
    flame.add(halo);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
    );
    core.scale.set(1, 1.8, 1);
    core.position.y = 0.012;
    flame.add(core);
    flame.position.set(dx, 1.38, dz);
    flame.userData.ph = i * 2.1 + Math.random() * 3;
    g.add(flame);
    flameMeshes.push(flame);
    const light = new THREE.PointLight(0xffd27a, 3, 3.5, 2);
    light.position.set(dx, 1.44, dz);
    g.add(light);
    candles.push(light);
  });

  g.position.set(x, 0, z);
  scene.add(g);
  // коллизия-тумба
  colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
  return g;
}

// (старый контур цифры удалён — теперь «3» рисуется на канвас-спрайте)

// гуляющий кот (из примитивов)
function makeCat(x, z, colorHex) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: colorHex });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), fur);
  body.scale.set(1.5, 0.9, 1);
  body.position.y = 0.3;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), fur);
  head.position.set(0.42, 0.46, 0);
  g.add(head);
  // уши
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), fur);
    ear.position.set(0.42, 0.62, s * 0.09);
    g.add(ear);
  }
  // мордочка
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0xff8fae })
  );
  nose.position.set(0.58, 0.45, 0);
  g.add(nose);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2e2a });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eye.position.set(0.56, 0.5, s * 0.07);
    g.add(eye);
  }
  // лапки (4)
  const pawGeo = new THREE.SphereGeometry(0.06, 8, 8);
  for (const [dx, dz] of [[0.22, 0.13], [0.22, -0.13], [-0.22, 0.13], [-0.22, -0.13]]) {
    const paw = new THREE.Mesh(pawGeo, fur);
    paw.position.set(dx, 0.06, dz);
    g.add(paw);
  }
  // хвост (3 шарика) — будет вилять
  const tail = new THREE.Group();
  const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), fur); t1.position.x = -0.05;
  const t2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), fur); t2.position.x = -0.14; t2.position.y = 0.05;
  const t3 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), fur); t3.position.x = -0.2; t3.position.y = 0.14;
  tail.add(t1, t2, t3);
  tail.position.set(-0.38, 0.34, 0);
  g.add(tail);

  g.position.set(x, 0, z);
  scene.add(g);
  cats.push({
    g, tail,
    // маршрут: прямоугольник вокруг центра
    cx: x, cz: z,
    rx: 2.2 + Math.random() * 1.6, rz: 2.2 + Math.random() * 1.6,
    speed: 0.25 + Math.random() * 0.2,
    phase: Math.random() * 6.28,
    bobPhase: Math.random() * 6.28,
  });
  return g;
}

/* конфетти-пушка: залп цветных частиц вверх с разлётом */
const confettiColors = [0xff9ec0, 0x9fdccf, 0xffd97a, 0xb3d4ff, 0xffb37a, 0xd8b4fe];
function fireConfetti(x, z, count = 90, salute = false) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const vel = [];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x + (Math.random() - 0.5) * 0.4;
    pos[i * 3 + 1] = 1.4 + Math.random() * 0.4;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
    c.setHex(confettiColors[i % confettiColors.length]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    vel.push({
      vx: (Math.random() - 0.5) * (salute ? 5.5 : 3.2),
      vy: salute ? 4.5 + Math.random() * 3.5 : 3.2 + Math.random() * 2.8,
      vz: (Math.random() - 0.5) * (salute ? 5.5 : 3.2),
      spin: Math.random() * 6.28,
    });
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  confettiBursts.push({ pts, vel, life: 0, maxLife: salute ? 6.5 : 4.5 });
}

/* ============================== СТЕНЫ (ОБЪЁМНЫЕ) ============================== */

function wallMat(w, h) {
  return new THREE.MeshLambertMaterial({ map: wallTexture(w, h) });
}

// объёмная стена-перегородка (Box) вдоль Z на координате x
function thickWallZ(x, z0, z1, { doors = [] } = {}) {
  const T = CFG.wallT, H = CFG.H;
  const dh = CFG.doorHalf;
  const segs = [];
  let cur = z0;
  const cuts = doors.slice().sort((a, b) => a - b);
  for (const d of cuts) {
    if (d - dh > cur) segs.push([cur, d - dh]);
    cur = d + dh;
  }
  if (z1 > cur) segs.push([cur, z1]);
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(T, H, b - a),
      wallMat(b - a, H)
    );
    m.position.set(x, H / 2, (a + b) / 2);
    scene.add(m);
    colliders.push({ minX: x - T / 2, maxX: x + T / 2, minZ: a, maxZ: b });
  }
  // перемычки над дверями
  for (const d of cuts) {
    if (d - dh < z0 || d + dh > z1) continue;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(T, H - CFG.doorH, dh * 2),
      wallMat(dh * 2, H - CFG.doorH)
    );
    m.position.set(x, CFG.doorH + (H - CFG.doorH) / 2, d);
    scene.add(m);
  }
}

// объёмная стена (Box) вдоль X на координате z
function thickWallX(z, x0, x1, { doors = [] } = {}) {
  const T = CFG.wallT, H = CFG.H;
  const dh = CFG.doorHalf;
  const segs = [];
  let cur = x0;
  const cuts = doors.slice().sort((a, b) => a - b);
  for (const d of cuts) {
    if (d - dh > cur) segs.push([cur, d - dh]);
    cur = d + dh;
  }
  if (x1 > cur) segs.push([cur, x1]);
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(b - a, H, T),
      wallMat(b - a, H)
    );
    m.position.set((a + b) / 2, H / 2, z);
    scene.add(m);
    colliders.push({ minX: a, maxX: b, minZ: z - T / 2, maxZ: z + T / 2 });
  }
  for (const d of cuts) {
    if (d - dh < x0 || d + dh > x1) continue;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(dh * 2, H - CFG.doorH, T),
      wallMat(dh * 2, H - CFG.doorH)
    );
    m.position.set(d, CFG.doorH + (H - CFG.doorH) / 2, z);
    scene.add(m);
  }
}

function addBox(minX, maxX, minZ, maxZ) {
  colliders.push({ minX, maxX, minZ, maxZ });
}

function plane(w, h, x, y, z, rotY = 0, mat = null, rotX = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.rotation.x = rotX;
  scene.add(m);
  return m;
}

function buildWorld(videos, mazeVideos = []) {
  const H = CFG.H, dh = CFG.doorHalf, T = CFG.wallT;

  /* ---------- пол и потолок целиком ---------- */
  const bMinX = ROOMS[0].cx - ROOM_HALF - T, bMaxX = -bMinX;
  const bMinZ = -Z_HALL - 1.5;
  const bMaxZ = Z_HALL + CFG.porchLen + 1.5;

  plane(bMaxX - bMinX, bMaxZ - bMinZ, (bMinX + bMaxX) / 2, 0, (bMinZ + bMaxZ) / 2, 0,
    new THREE.MeshLambertMaterial({ map: floorTexture((bMaxX - bMinX) / 2, (bMaxZ - bMinZ) / 2) }), -Math.PI / 2);
  plane(bMaxX - bMinX, bMaxZ - bMinZ, (bMinX + bMaxX) / 2, H, (bMinZ + bMaxZ) / 2, 0,
    new THREE.MeshLambertMaterial({ map: ceilTexture((bMaxX - bMinX) / 3, (bMaxZ - bMinZ) / 3) }), Math.PI / 2);

  /* ---------- коридор (объёмные стены) ---------- */
  const doorZL = [], doorZR = [];
  for (const r of ROOMS) {
    if (r.left) doorZL.push(r.cz - CFG.doorOffset, r.cz + CFG.doorOffset);
    else doorZR.push(r.cz - CFG.doorOffset, r.cz + CFG.doorOffset);
  }
  thickWallZ(-HW, -Z_HALL, Z_HALL, { doors: doorZL });
  thickWallZ(+HW, -Z_HALL, Z_HALL, { doors: doorZR });

  // торец коридора у залов — сплошная объёмная стена (двери в боковых стенах)
  thickWallX(-Z_HALL, -HW, HW, {});
  // входной торец с дверью
  thickWallX(Z_HALL, -HW, HW, { doors: [0] });

  /* ---------- крыльцо ---------- */
  plane(dh * 2 + 0.6, CFG.porchLen, 0, 0.001, Z_HALL + CFG.porchLen / 2, 0,
    new THREE.MeshLambertMaterial({ map: floorTexture(2, 2) }), -Math.PI / 2);
  plane(dh * 2 + 0.6, CFG.porchLen, 0, CFG.doorH, Z_HALL + CFG.porchLen / 2, 0,
    new THREE.MeshLambertMaterial({ map: ceilTexture(1, 2) }), Math.PI / 2);
  // объёмные боковинки и задняя стенка крыльца
  thickWallZ(-dh, Z_HALL, Z_HALL + CFG.porchLen, {});
  thickWallZ(dh, Z_HALL, Z_HALL + CFG.porchLen, {});
  thickWallX(Z_HALL + CFG.porchLen, -dh, dh, {});

  /* ---------- БАННЕР «КуроМур с нами уже 3 года» в центре коридора ---------- */
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2 - 0.3, 0.95),
    new THREE.MeshBasicMaterial({
      map: signTexture(["КуроМур с нами уже 3 года"], { w: 2048, h: 220, font: 150, accent: "#ff7fae" }),
      side: THREE.DoubleSide,
    })
  );
  banner.position.set(0, 2.6, 0);
  scene.add(banner);
  for (const bx of [-HW + 0.55, HW - 0.55]) {
    const rope = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(bx, 2.6 + 0.47, 0), new THREE.Vector3(bx, H, 0)]),
      new THREE.LineBasicMaterial({ color: 0xd9b8c6, transparent: true, opacity: 0.7 })
    );
    scene.add(rope);
  }

  /* ---------- залы ---------- */
  for (const r of ROOMS) {
    const { cx, cz } = r;
    const half = ROOM_HALF;
    const doors = [cz - CFG.doorOffset, cz + CFG.doorOffset];
    const zMin = cz - half, zMax = cz + half;

    if (r.left) {
      thickWallZ(cx - half, zMin, zMax, {});                  // внешняя
      thickWallX(zMin, cx - half, -HW, r.n === 2 ? { doors: [cx] } : {}); // северная (у зала 2 — дверь в лабиринт)
      thickWallX(zMax, cx - half, -HW, {});                   // южная
      thickWallZ(-HW, zMin, zMax, { doors });                 // стена коридора (двери)
    } else {
      thickWallZ(cx + half, zMin, zMax, {});
      thickWallX(zMin, HW, cx + half, r.n === 3 ? { doors: [cx] } : {}); // северная (у зала 3 — дверь в лабиринт)
      thickWallX(zMax, HW, cx + half, {});
      thickWallZ(+HW, zMin, zMax, { doors });
    }



    // декор зала: торт в центре + кольцо шаров вокруг него + шары по углам
    makeCake(cx, cz);
    // кольцо воздушных шаров вокруг торта (два ряда: по полу и повыше)
    const ringR = 2.6;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      makeBalloon(cx + Math.cos(ang) * ringR, cz + Math.sin(ang) * ringR,
        [PAL.accent, PAL.accent2, PAL.accent3, PAL.accent][a % 4], H);
    }
    // второй ряд — мини-шары ближе к торту
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + 0.4;
      makeBalloon(cx + Math.cos(ang) * 1.7, cz + Math.sin(ang) * 1.7,
        [PAL.accent3, PAL.accent, PAL.accent2][a % 3], H);
    }
    // шары по углам зала
    for (const [bx, bz] of [[cx - half + 1.2, zMin + 1.2], [cx + half - 1.2, zMin + 1.2],
                            [cx - half + 1.2, zMax - 1.2], [cx + half - 1.2, zMax - 1.2]]) {
      makeBalloon(bx, bz, PAL.accent2, H);
      makeBalloon(bx + 0.7, bz + 0.6, PAL.accent, H);
    }

    // зона ленивой загрузки превью этого зала
    lazyZones.push({ x: cx, z: cz, slots: [], loaded: false, name: r.name });
  }

  /* ---------- декор коридора: арки шаров вдоль стен, тортов нет ---------- */
  for (let z = -Z_HALL + 3; z <= Z_HALL - 3; z += 4.5) {
    makeBalloon(-HW + 1.2, z, [PAL.accent, PAL.accent2, PAL.accent3][Math.abs(z / 4.5 | 0) % 3], H);
    makeBalloon(HW - 1.2, z + 2.2, [PAL.accent2, PAL.accent3, PAL.accent][Math.abs(z / 4.5 | 0) % 3], H);
    makeBalloon(-HW + 2.1, z + 1.1, PAL.accent3, H);   // второй слой ближе к центру
    makeBalloon(HW - 2.1, z + 3.3, PAL.accent, H);
  }
  makeBalloon(-HW + 1.2, 0, PAL.accent3, H);
  makeBalloon(HW - 1.2, 0, PAL.accent, H);
  makeBalloon(-HW + 2.2, 0, PAL.accent2, H);
  makeBalloon(HW - 2.2, 0, PAL.accent3, H);

  /* ---------- картины ---------- */
  // 1–12 → зал 1, 13–24 → зал 2, 25–36 → зал 3, 37–48 → зал 4, 49–60 → коридор
  const byRoom = { 1: [], 2: [], 3: [], 4: [] };
  const hallVids = [];
  videos.forEach((v, i) => {
    const n = i + 1;
    if (n >= 49) hallVids.push(v);
    else byRoom[Math.min(4, Math.floor((n - 1) / 12) + 1)].push(v);
  });

  // коридор: по 6 картин на каждую боковую стену. Позиции подобраны так,
  // чтобы не перекрывать дверные проёмы залов (двери z=±6 и ±17, полуширина
  // двери 1.7 + половина картины 1.25 → запрещённые зоны ±2.95 вокруг дверей).
  const hallOff = T / 2 + 0.12;
  // |z-d| >= 3.49 от дверей И z-1.79 >= -22.64 — не тонуть в южной стене
  // лабиринта (её северная грань z=-22.65 выступает внутрь коридора).
  const hallZs = [-20.6, -13, -2, 2, 13, 20.6];
  let vi = 0;
  for (const side of [-1, 1]) {
    for (const z of hallZs) {
      if (vi >= hallVids.length) break;
      const slot = makeFrame(hallVids[vi], side * (HW - hallOff), CFG.rowY, z,
        side < 0 ? Math.PI / 2 : -Math.PI / 2, "Коридор");
      currentSlots.push(slot);
      vi++;
    }
  }

  // залы: 4 картины на каждую из трёх стен без дверей (шаг 5.2 м, отступы удвоены).
  // Рамки — на внутренней поверхности объёмных стен.
  const wallOff = T / 2 + 0.12;
  for (const r of ROOMS) {
    const vids = byRoom[r.n];
    if (!vids.length) continue;
    const half = ROOM_HALF;
    // Распределение на зал (12 клипов): внешняя стена — 5, южная — 5,
    // стена к лабиринту — 2. Ширина рамки 3.58 м, поэтому на стене 22 м
    // помещается максимум 5 картин (шаг 5.4, зазор 1.8 м).
    // У залов 2 и 3 в стене к лабиринту дверной проём (полуширина 1.7),
    // его зона вместе с полушириной рамки 1.79 = ±3.49 — обходим картинами ±5.6.
    const offs5 = [-8.8, -4.4, 0, 4.4, 8.8];   // шаг 4.4 > ширины рамки 3.58, края до 10.59 из 11
    const offsN = [-5.6, 5.6];                 // фланги дверного проёма
    const zone = lazyZones.find((z) => z.name === r.name);
    let k = 0;

    const walls = r.left
      ? [
          { x: r.cx - half, z: r.cz, rotY: Math.PI / 2, ux: 0, uz: 1, nx: 1, offs: offs5 }, // внешняя
          { x: r.cx, z: r.cz - half, rotY: 0, ux: -1, uz: 0, nx: 0, nz: 1, offs: offsN },   // к лабиринту (север зала)
          { x: r.cx, z: r.cz + half, rotY: Math.PI, ux: 1, uz: 0, nx: 0, nz: -1, offs: offs5 }, // южная
        ]
      : [
          { x: r.cx + half, z: r.cz, rotY: -Math.PI / 2, ux: 0, uz: -1, nx: -1, offs: offs5 },
          { x: r.cx, z: r.cz - half, rotY: 0, ux: -1, uz: 0, nx: 0, nz: 1, offs: offsN },
          { x: r.cx, z: r.cz + half, rotY: Math.PI, ux: 1, uz: 0, nx: 0, nz: -1, offs: offs5 },
        ];

    for (const w of walls) {
      for (const off of w.offs) {
        if (k >= vids.length) break;
        const x = w.x + w.ux * off + (w.nx || 0) * wallOff;
        const z = w.z + w.uz * off + (w.nz || 0) * wallOff;
        const slot = makeFrame(vids[k], x, CFG.rowY, z, w.rotY, r.name);
        zone.slots.push(currentSlots.length);
        currentSlots.push(slot);
        k++;
      }
    }
  }

  /* ---------- лабиринт с клипами за залами 2 и 3 ---------- */
  if (mazeVideos.length) buildMaze(mazeVideos);
}

/* ============================== ЛАБИРИНТ ============================== */

// Детерминированный генератор «идеального» лабиринта (recursive backtracker).
// Сетка из блоков: 0 — проход, 1 — стена. Проходы — нечётные строки/столбцы.
function genMaze(W, H, seed) {
  const gw = 2 * W + 1, gh = 2 * H + 1;
  const g = Array.from({ length: gh }, () => Array(gw).fill(1));
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const stack = [[0, 0]];
  seen[0][0] = true;
  g[1][1] = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && nx < W && ny >= 0 && ny < H && !seen[ny][nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(rnd() * opts.length)];
    const nx = cx + dx, ny = cy + dy;
    seen[ny][nx] = true;
    g[2 * cy + 1 + dy][2 * cx + 1 + dx] = 0;
    g[2 * ny + 1][2 * nx + 1] = 0;
    stack.push([nx, ny]);
  }
  return { g, gw, gh };
}

function buildMaze(mazeVideos) {
  const H = CFG.H, T = CFG.wallT;
  const CELL = 3.6;                 // размер клетки лабиринта (проходы и стены)
  const MW = 13, MH = 12;           // базовые клетки лабиринта → сетка 27×25
  const { g, gw, gh } = genMaze(MW, MH, 20261023);

  // Лабиринт стоит вплотную к северным стенам залов 2 и 3, центр по X.
  const x0 = -(gw * CELL) / 2;
  const zSouth = -(ROOM_CZ + ROOM_HALF) - T / 2; // внешняя грань северных стен залов
  // центр клетки (r, c); r растёт к северу
  const cellCX = (c) => x0 + (c + 0.5) * CELL;
  const cellCZ = (r) => zSouth - (r + 0.5) * CELL;

  /* --- проходы: прорезаем южную стену лабиринта под дверями залов 2 и 3 --- */
  const doorCols = [];
  for (const dx of [ROOMS[1].cx, ROOMS[2].cx]) {
    const cA = Math.floor((dx - CFG.doorHalf - x0) / CELL);
    const cB = Math.floor((dx + CFG.doorHalf - x0) / CELL);
    for (let c = cA; c <= cB; c++) {
      g[0][c] = 0; // проход сквозь южную стену лабиринта (r=0 — ближайшая к залам)
      g[1][c] = 0; // и клетку за ней
    }
    doorCols.push((cA + cB) / 2);
  }

  /* --- пол и потолок лабиринта --- */
  const mzMinX = x0 - 1, mzMaxX = x0 + gw * CELL + 1;
  const mzMinZ = zSouth - gh * CELL - 1, mzMaxZ = zSouth + 1;
  plane(mzMaxX - mzMinX, mzMaxZ - mzMinZ, (mzMinX + mzMaxX) / 2, 0.001, (mzMinZ + mzMaxZ) / 2, 0,
    new THREE.MeshLambertMaterial({ map: floorTexture((mzMaxX - mzMinX) / 2, (mzMaxZ - mzMinZ) / 2) }), -Math.PI / 2);
  plane(mzMaxX - mzMinX, mzMaxZ - mzMinZ, (mzMinX + mzMaxX) / 2, H, (mzMinZ + mzMaxZ) / 2, 0,
    new THREE.MeshLambertMaterial({ map: ceilTexture((mzMaxX - mzMinX) / 3, (mzMaxZ - mzMinZ) / 3) }), Math.PI / 2);

  /* --- стены: соседние клетки в строке сливаем в длинные боксы --- */
  for (let r = 0; r < gh; r++) {
    let c = 0;
    while (c < gw) {
      if (g[r][c] !== 1) { c++; continue; }
      let cEnd = c;
      while (cEnd + 1 < gw && g[r][cEnd + 1] === 1) cEnd++;
      const len = (cEnd - c + 1) * CELL;
      const cxm = (cellCX(c) + cellCX(cEnd)) / 2;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len, H, CELL),
        new THREE.MeshLambertMaterial({ map: wallTexture(len, H) })
      );
      m.position.set(cxm, H / 2, cellCZ(r));
      scene.add(m);
      colliders.push({ minX: cxm - len / 2, maxX: cxm + len / 2, minZ: cellCZ(r) - CELL / 2, maxZ: cellCZ(r) + CELL / 2 });
      c = cEnd + 1;
    }
  }

  /* --- таблички над дверями в лабиринт (со стороны зала) --- */
  // zSouth — внешняя грань стены (сторона лабиринта); zSouth + T — грань зала.
  // Табличка чуть выступает в зал и смотрит в зал (нормаль +Z по умолчанию).
  const signY = 3.2; // низ 2.63 м (над проёмом 2.5), верх 3.77 (под потолком 3.8)
  for (const r of ROOMS) {
    if (r.n !== 2 && r.n !== 3) continue;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 1.14),
      new THREE.MeshBasicMaterial({
        map: signTexture([`Все видео с КуроМур за этот год`, `Лабиринт · ${mazeVideos.length} клипов`], { w: 1280, h: 260, font: 82, accent: "#ff7fae" }),
      })
    );
    sign.position.set(r.cx, signY, zSouth + T + 0.02);
    scene.add(sign);
  }

  /* --- картины: на каждую грань стены, выходящую в проход, вешаем клип --- */
  // Обходим от входа (юг) вглубь, чтобы первые клипы встречались сразу за дверями.
  const lazyZonesMaze = [];
  for (let b = 0; b < 12; b++) {
    lazyZonesMaze.push({ x: 0, z: 0, slots: [], loaded: false, name: "Лабиринт" });
  }
  const zoneOf = (r, c) => {
    const band = Math.min(2, Math.floor((r - 1) / Math.ceil((gh - 2) / 3))); // 0..2 от юга к северу
    const colB = Math.min(3, Math.floor(c / (gw / 4)));                      // 0..3 с запада на восток
    return lazyZonesMaze[band * 4 + colB];
  };
  const wallOff = 0.14; // рамка выступает из стены лабиринта, не утопая в текстуре на стыках
  // Собираем ТОЛЬКО грани, за которыми реально есть стена, причём стена должна
  // тянуться минимум на одну клетку в обе стороны вдоль своего направления —
  // тогда рамка висит на сплошной стене, а не на торце столба в развилке.
  // ВАЖНО: клетка (r,c) занимает z: cz±CELL/2, x: cx±CELL/2.
  // Северная грань клетки (z = cz - CELL/2) примыкает к ряду стен r+1 (север),
  // южная (z = cz + CELL/2) — к ряду r-1, восточная (x = cx + CELL/2) — к столбцу c+1,
  // западная — к столбцу c-1.
  const faces = [];
  for (let r = 1; r <= gh - 2; r++) {
    for (let c = 1; c < gw - 1; c++) {
      if (g[r][c] !== 0) continue;
      const cx = cellCX(c), cz = cellCZ(r);
      // северная грань: стена в ряду r+1, тянущаяся по c-1 и c+1
      if (g[r + 1] && g[r + 1][c] === 1 && g[r + 1][c - 1] === 1 && g[r + 1][c + 1] === 1)
        faces.push({ r, c, x: cx, z: cz - CELL / 2 + wallOff, rotY: 0 });
      // южная грань: стена в ряду r-1
      if (g[r - 1] && g[r - 1][c] === 1 && g[r - 1][c - 1] === 1 && g[r - 1][c + 1] === 1)
        faces.push({ r, c, x: cx, z: cz + CELL / 2 - wallOff, rotY: Math.PI });
      // восточная грань: стена в столбце c+1
      if (g[r][c + 1] === 1 && g[r - 1][c + 1] === 1 && g[r + 1][c + 1] === 1)
        faces.push({ r, c, x: cx + CELL / 2 - wallOff, z: cz, rotY: -Math.PI / 2 });
      // западная грань: стена в столбце c-1
      if (g[r][c - 1] === 1 && g[r - 1][c - 1] === 1 && g[r + 1][c - 1] === 1)
        faces.push({ r, c, x: cx - CELL / 2 + wallOff, z: cz, rotY: Math.PI / 2 });
    }
  }
  const total = mazeVideos.length;
  const step = faces.length / total;
  for (let i = 0; i < total; i++) {
    const f = faces[Math.floor(i * step)];
    const slot = makeFrame(mazeVideos[i], f.x, CFG.rowY, f.z, f.rotY, "Лабиринт");
    // рамки лабиринта уже основных: проход 3.6 м остаётся свободным по бокам
    slot.group.scale.set(0.72, 0.74, 1);
    zoneOf(f.r, f.c).slots.push(currentSlots.length);
    currentSlots.push(slot);
  }

  /* --- шарики: у входов и по проходам лабиринта --- */
  const balloonColors = [PAL.accent, PAL.accent2, PAL.accent3];
  // у каждого входа — «ворота» из шаров
  for (const r of ROOMS) {
    if (r.n !== 2 && r.n !== 3) continue;
    makeBalloon(r.cx - 2.6, zSouth - 1.6, PAL.accent, H);
    makeBalloon(r.cx + 2.6, zSouth - 1.6, PAL.accent2, H);
    makeBalloon(r.cx, zSouth - 2.6, PAL.accent3, H);
  }
  // внутри лабиринта: шарик в каждой третьей клетке прохода
  let bi = 0, balloonCount = 3; // + 3 у каждого входа добавляются ниже
  for (const r of ROOMS) { if (r.n === 2 || r.n === 3) balloonCount += 3; }
  for (let r = 1; r <= gh - 2; r++) {
    for (let c = 1; c < gw - 1; c++) {
      if (g[r][c] !== 0) continue;
      bi++;
      if (bi % 3 !== 0) continue;
      makeBalloon(cellCX(c), cellCZ(r), balloonColors[bi % 3], H);
      balloonCount++;
    }
  }
  window.HALL.balloonCount = balloonCount; // для отладки

  /* --- телепорты: в каждом тупике — кнопка на потолке --- */
  mazeSafeCells = [];
  const deadEnds = [];
  // обходим ВСЕ внутренние клетки (перед пограничными рядами r=0/gh-1 — тоже тупики!)
  for (let r = 1; r <= gh - 2; r++) {
    for (let c = 1; c < gw - 1; c++) {
      if (g[r][c] !== 0) continue;
      const wallsAround =
        (g[r - 1][c] === 1 ? 1 : 0) + (g[r + 1][c] === 1 ? 1 : 0) +
        (g[r][c - 1] === 1 ? 1 : 0) + (g[r][c + 1] === 1 ? 1 : 0);
      if (wallsAround === 3) deadEnds.push({ x: cellCX(c), z: cellCZ(r), r, c });
      else mazeSafeCells.push({ x: cellCX(c), z: cellCZ(r) });
    }
  }
  /* --- кнопки телепорта: в каждом тупике — кнопка на потолке --- */
  // Принцип: никаких автоматических колец-порталов. Над тупиком на потолке
  // висит кнопка «ТЕЛЕПОРТ»; смотрим на неё вверх и нажимаем ЛКМ (как на клип)
  // — перенос в случайный безопасный проход лабиринта.
  const btnTex = signTexture(["⇄ ТЕЛЕПОРТ ⇄"], { w: 640, h: 220, font: 84, accent: "#ff7fae" });
  for (const d of deadEnds) {
    const { r, c } = d;
    const cx = cellCX(c), cz = cellCZ(r);
    const btn = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.21),
      new THREE.MeshBasicMaterial({ map: btnTex })
    );
    // на потолке над тупиком, чуть ниже плоскости потолка (чтобы не мерцала z-файтингом);
    // rotation.x = π/2 разворачивает лицевую сторону плоскости вниз — к зрителю
    btn.position.set(cx, H - 0.02, cz);
    btn.rotation.x = Math.PI / 2;
    btn.userData.teleport = true;
    scene.add(btn);
    clickables.push(btn);
    teleportButtons.push(btn);
  }
  window.HALL.portals = teleportButtons.length; // для отладки
  window.HALL.portalList = teleportButtons.map((b) => ({
    x: +b.position.x.toFixed(2), z: +b.position.z.toFixed(2), y: +b.position.y.toFixed(2), rx: +b.rotation.x.toFixed(2),
  })); // для отладки

  // центры ленивых зон — по фактическим слотам
  for (const z of lazyZonesMaze) {
    if (!z.slots.length) continue;
    let sx = 0, sz = 0;
    for (const i of z.slots) { sx += currentSlots[i].group.position.x; sz += currentSlots[i].group.position.z; }
    z.x = sx / z.slots.length;
    z.z = sz / z.slots.length;
    lazyZones.push(z);
  }
}

/* --------------------------- рамка картины --------------------------- */

function makeFrame(video, x, y, z, rotY, zoneName) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  // расходим плоскости по Z с запасом ≥2 см: иначе при взгляде издалека
  // копланарные плоскости мерцают (z-fighting) — «живые» мерцающие текстуры
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.videoW + CFG.frameGap * 2, CFG.videoH + CFG.frameGap * 2),
    new THREE.MeshBasicMaterial({ color: PAL.frame })
  );
  frame.position.z = 0;
  group.add(frame);

  const screenMat = new THREE.MeshBasicMaterial({ color: 0x2a2430 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(CFG.videoW, CFG.videoH), screenMat);
  screen.position.z = 0.06;
  group.add(screen);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.videoW * 0.48, CFG.videoW * 0.48 * (120 / 640)),
    new THREE.MeshBasicMaterial({ map: labelTexture(labelText(video.file)) })
  );
  label.position.set(0, -CFG.videoH / 2 - 0.20, 0.10); // ниже рамки, ПЕРЕД экраном (без мерцания)
  group.add(label);

  // стрелочка-указатель направления (вперёд от картины)
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.11);
  arrowShape.lineTo(-0.06, -0.05);
  arrowShape.lineTo(0, 0.005);
  arrowShape.lineTo(0.06, -0.05);
  arrowShape.closePath();
  const arrow = new THREE.Mesh(
    new THREE.ShapeGeometry(arrowShape),
    new THREE.MeshBasicMaterial({ color: PAL.accent3, transparent: true, opacity: 0.85, depthWrite: false })
  );
  arrow.position.set(0, 0.06, 0.12); // впереди всех плоскостей картины (не мерцает)
  arrow.rotation.x = -Math.PI / 2;
  group.add(arrow);
  group.userData.arrow = arrow;

  scene.add(group);

  const slot = { video, group, screenMat, zoneName, el: null, previewTex: null, videoTex: null, playing: false };
  screen.userData.slot = slot;
  clickables.push(screen);
  return slot;
}

/* ============================== ПРЕВЬЮ ============================== */

function once(elem, okEv, badEv, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      elem.removeEventListener(okEv, finish);
      elem.removeEventListener(badEv, finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    elem.addEventListener(okEv, finish);
    elem.addEventListener(badEv, finish);
  });
}

async function makePreview(url) {
  const el = document.createElement("video");
  el.preload = "metadata";
  el.muted = true;
  el.crossOrigin = "anonymous";
  el.src = url;
  await once(el, "loadedmetadata", "error", 12000);
  if (el.readyState < 1) return null;
  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 3;
  el.currentTime = Math.min(1.5, dur * 0.25);
  await once(el, "seeked", "error", 8000);
  const vw = el.videoWidth || 640, vh = el.videoHeight || 360;
  const w = Math.min(CFG.previewMaxW, vw);
  const h = Math.round((w * vh) / vw);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(el, 0, 0, w, h);
  const data = c.toDataURL("image/jpeg", CFG.previewQuality);
  el.removeAttribute("src");
  el.load();
  return data;
}

function applyPreview(slot, dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      slot.previewTex = tex;
      if (!slot.playing) {
        slot.screenMat.map = tex;
        slot.screenMat.color.set(0xffffff);
        slot.screenMat.needsUpdate = true;
      }
      resolve();
    };
    img.onerror = resolve; // не вешаем очередь на битую картинку
    img.src = dataURL;
  });
}

const previewQueue = [];
let previewBusy = false;
let previewsQueued = 0;
let previewsDone = 0;

function enqueuePreviews(idxs) {
  for (const i of idxs) if (!previewQueue.includes(i)) previewQueue.push(i);
  pumpPreviews();
}

async function pumpPreviews() {
  if (previewBusy) return;
  previewBusy = true;
  while (previewQueue.length) {
    const i = previewQueue.shift();
    const slot = currentSlots[i];
    if (!slot || slot.previewTex) continue;
    try {
      if (slot.video.preview && /\.(png|webp)$/.test(slot.video.preview)) {
        // готовое PNG-превью с сервера — мгновенно
        await applyPreview(slot, slot.video.preview);
      } else {
        const data = await makePreview(slot.video.url);
        if (data) applyPreview(slot, data);
        else slot.screenMat.color.set(0xf0d6de);
      }
    } catch (e) {
      console.warn("Превью не получилось:", slot.video.file, e);
      slot.screenMat.color.set(0xf0d6de);
    }
    previewsDone++;
    window.HALL.previews = previewsDone;
    updateBar(previewsDone, previewsQueued);
  }
  previewBusy = false;
}

function updateBar(done, total) {
  barFill.style.width = total ? `${Math.round((done / total) * 100)}%` : "100%";
  if (!currentSlots.length) {
    statusEl.textContent = "На сервере нет видео. Положите файлы в папку clips_kuromur.";
  } else if (total > 0 && done >= total) {
    statusEl.textContent = "Готово! Все превью загружены.";
  } else {
    statusEl.textContent = `Превью загружаются: ${done}/${total || currentSlots.length}`;
  }
  if (started) {
    startBtn.textContent = "Продолжить";
  } else {
    startBtn.textContent = total > 0 && done >= total ? "Войти" : `Войти (превью ${done}/${total || currentSlots.length})`;
  }
}

// Загрузить превью для слота прямо в момент клика (до начала воспроизведения).
// Сначала пытаемся PNG-превью с сервера (мгновенно), иначе захватываем первый кадр локально.
async function preloadPreviewForSlot(slot, cb) {
  if (slot.previewTex) { cb(); return; }
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    slot.previewTex = tex;
    if (!slot.playing) {
      slot.screenMat.map = tex;
      slot.screenMat.color.set(0xffffff);
      slot.screenMat.needsUpdate = true;
    }
    cb();
  };
  img.onerror = () => {
    slot.screenMat.color.set(0xf0d6de);
    cb();
  };
  if (slot.video.preview && /\.(png|webp)$/.test(slot.video.preview)) {
    img.src = slot.video.preview;
  } else {
    // первый кадр видео без подгрузки самого видеофайла
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.crossOrigin = "anonymous";
    el.src = slot.video.url;
    el.addEventListener("loadedmetadata", () => {
      el.currentTime = 0;
    });
    const onSeek = () => {
      el.removeEventListener("seeked", onSeek);
      const vw = el.videoWidth || 640, vh = el.videoHeight || 360;
      const w = Math.min(CFG.previewMaxW, vw);
      const h = Math.round((w * vh) / vw);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(el, 0, 0, w, h);
      img.src = c.toDataURL("image/jpeg", CFG.previewQuality);
    };
    el.addEventListener("seeked", onSeek);
    el.addEventListener("error", () => { el.removeEventListener("seeked", onSeek); img.onerror(); });
  }
}

function preparePreviews() {
  // превью лёгкие (webp) — грузим ВСЕ сразу при открытии страницы
  pendingFinished = false;
  const all = currentSlots.map((s, i) => i);
  previewsQueued = all.length;
  previewsDone = 0;
  updateBar(0, previewsQueued);
  enqueuePreviews(all);
}

// раньше лабиринт догружался после входа; теперь всё грузится сразу — заглушка.
let pendingFinished = false;
function loadRemainingPreviews() {
  if (pendingFinished) return;
  pendingFinished = true;
  updateBar(previewsDone, currentSlots.length);
}

/* ============================== МИНИКАРТА И БОЛЬШАЯ КАРТА ============================== */

// Рисует план музея (сверху, север вверху) на переданный canvas-контекст.
// Стены берём из colliders — карта всегда соответствует миру.
let mapBounds = null;
function computeMapBounds() {
  if (mapBounds) return mapBounds;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const b of colliders) {
    minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ);
  }
  mapBounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };
  return mapBounds;
}

// подписи зон на картах убраны — только стены, игроки и призраки

function drawMap(ctx, W, Hh) {
  const b = computeMapBounds();
  const pad = 14;
  const scale = Math.min((W - pad * 2) / (b.maxX - b.minX), (Hh - pad * 2) / (b.maxZ - b.minZ));
  const ox = (W - (b.maxX - b.minX) * scale) / 2;
  const oy = (Hh - (b.maxZ - b.minZ) * scale) / 2;
  const X = (x) => ox + (x - b.minX) * scale;
  const Z = (z) => oy + (z - b.minZ) * scale;

  ctx.clearRect(0, 0, W, Hh);
  ctx.fillStyle = "rgba(24,16,28,0.9)";
  ctx.fillRect(0, 0, W, Hh);

  // стены
  ctx.fillStyle = "#d9a8c4";
  for (const bx of colliders) {
    ctx.fillRect(X(bx.minX), Z(bx.minZ), Math.max(1, (bx.maxX - bx.minX) * scale), Math.max(1, (bx.maxZ - bx.minZ) * scale));
  }

  // подписи
  const fs = Math.max(9, Math.round(scale * 5.2));
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 240, 246, 0.85)";
  // подписи зон убраны — рисуем компактнее

  // игрок: точка + направление взгляда
  const px = X(camera.position.x), pz = Z(camera.position.z);
  const dir = -yaw - Math.PI / 2; // yaw 0 смотрит на север (вверх на карте)
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px + Math.cos(dir + 0.45) * 12, pz + Math.sin(dir + 0.45) * 12);
  ctx.lineTo(px + Math.cos(dir - 0.45) * 12, pz + Math.sin(dir - 0.45) * 12);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 220, 120, 0.5)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, pz, 3.2, 0, 7);
  ctx.fillStyle = "#ffd866";
  ctx.fill();
  ctx.strokeStyle = "#7c3f58";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // призраки других игроков
  if (typeof mpState !== "undefined") {
    ctx.font = `bold ${Math.max(8, Math.round(scale * 4.5))}px system-ui, sans-serif`;
    for (const g of mpState.others.values()) {
      const gx = X(g.x), gz = Z(g.z);
      ctx.beginPath();
      ctx.arc(gx, gz, 3, 0, 7);
      ctx.fillStyle = "rgba(255, 158, 192, 0.9)";
      ctx.fill();
      ctx.fillStyle = "rgba(255, 200, 220, 0.85)";
      ctx.fillText(g.name, gx, gz - 6);
    }
  }
}

const mmCtx = minimap.getContext("2d");
function updateMinimap() {
  drawMap(mmCtx, minimap.width, minimap.height);
}
setInterval(() => { if (started && !bigmapOpen) updateMinimap(); }, 180);

let bigmapOpen = false;
function toggleBigmap(force) {
  bigmapOpen = force !== undefined ? force : !bigmapOpen;
  bigmap.classList.toggle("hidden", !bigmapOpen);
  if (bigmapOpen) drawMap(bigmapCanvas.getContext("2d"), bigmapCanvas.width, bigmapCanvas.height);
}
// большая карта живо обновляется, пока открыта
setInterval(() => { if (started && bigmapOpen) drawMap(bigmapCanvas.getContext("2d"), bigmapCanvas.width, bigmapCanvas.height); }, 180);

/* ============================== ВИДЕО ПО КЛИКУ ============================== */

function duckMusic(on) {
  if (!music || !musicBuffer) return;
  // при видео мелодия полностью выключается, без видео — тихий фон
  music.setVolume(on ? 0 : CFG.musicVolume);
}

function ensureMedia(slot) {
  if (slot.el) {
    // элемент мог быть освобождён в stopPlayback (src снят) — навешиваем заново
    if (!slot.el.getAttribute("src")) {
      slot.el.src = slot.video.url;
      slot.el.load();
    }
    return slot.el;
  }
  const el = document.createElement("video");
  el.src = slot.video.url;
  el.loop = false;
  el.muted = false;
  el.playsInline = true;
  el.preload = "auto";
  el.crossOrigin = "anonymous";
  el.addEventListener("ended", () => stopPlayback(slot));
  slot.el = el;
  videoElements.push(el);

  const audio = new THREE.PositionalAudio(listener);
  audio.setMediaElementSource(el);
  audio.setRefDistance(CFG.audioRef);
  audio.setMaxDistance(CFG.audioMax);
  audio.setDistanceModel("linear");
  audio.setRolloffFactor(1);
  audio.panner.panningModel = "equalpower";
  slot.group.add(audio);
  return el;
}

function startPlayback(slot) {
  // переключение: прошлое видео останавливается
  if (activeSlot && activeSlot !== slot) stopPlayback(activeSlot);
  activeSlot = slot;
  duckMusic(true); // фон тише, пока играет видео

  const el = ensureMedia(slot);
  if (!slot.videoTex) {
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    slot.videoTex = tex;
  }
  slot.screenMat.map = slot.videoTex;
  slot.screenMat.color.set(0xffffff);
  slot.screenMat.needsUpdate = true;
  slot.playing = true;

  // публикация в ОБЩУЮ очередь: у всех клиентов это видео просто начнётся с нуля.
  // (персональная очередь как была: один activeSlot, прошлый уже остановлен выше)
  mpSyncPublish(slot);

  // празднование: залп конфетти у картины!
  fireConfetti(slot.group.position.x * 0.9, slot.group.position.z * 0.9, 110);

  const p = el.play();
  if (p && p.catch) p.catch(() => { el.muted = true; el.play().catch(() => {}); });
}

// моё видео попало в общую очередь
function mpSyncPublish(slot) {
  const url = slot.video.url;
  mpState.syncQueue.set(url, { id: mpState.myId, url, slot, mine: true });
  mpSendVPlay(url);
}

function mpSyncStop(slot) {
  const url = slot.video.url;
  if (!mpState.syncQueue.delete(url)) return; // не игралось в общей очереди
  mpSendVStop(url);
}

function stopPlayback(slot) {
  mpSyncStop(slot); // убрать из общей очереди (если там было) и сообщить всем
  if (slot.el) {
    slot.el.pause();
    // полностью освобождаем медиапоток: пауза оставляет Range-запрос открытым,
    // такие «висящие» потоки накапливаются и тормозят следующие видео
    slot.el.removeAttribute("src");
    slot.el.load();
  }
  slot.playing = false;
  if (activeSlot === slot) {
    activeSlot = null;
    duckMusic(false); // музыка возвращается
  }
  if (slot.previewTex) {
    slot.screenMat.map = slot.previewTex;
  } else {
    slot.screenMat.map = null;
    slot.screenMat.color.set(0x2a2430);
  }
  slot.screenMat.needsUpdate = true;
}

function togglePlayback(slot) {
  if (slot.playing) stopPlayback(slot);
  else startPlayback(slot);
}

/* --- приёмная часть: только факт запуска/остановки, рассинхрон игнорируем --- */

// у кого-то началось видео — запускаем у себя с нуля; silent=true из retained-списка,
// (чтобы массовый приём не вызывал лавину пересылок «что играет»)
function mpReceiveVPlay(e, silent) {
  if (e.id === mpState.myId) return; // это наше собственное, уже играет
  const url = String(e.url || "");
  if (!url) return;
  // это видео сейчас играет у нас (наша персональная очередь) — мы источник истины
  const existing = mpState.syncQueue.get(url);
  if (existing && existing.mine) return;
  const entry = { id: e.id, url, slot: null, mine: false };
  const slot = mpSlotByUrl(url);
  if (slot) {
    entry.slot = slot;
    mpState.syncQueue.set(url, entry);
    startSyncVisual(slot);
  } else {
    // слот ещё не построен (ленивая зона) — запомним и попробуем позже
    mpState.pendingVideos.set(url, entry);
  }
  if (!silent) mpPublishNow(); // retained «что играет» — обновляем нашим знанием
}

// визуально включить чужое видео на экране (картинка общего 3D-экрана
// + позиционный звук от места картины)
function startSyncVisual(slot) {
  const el = ensureMedia(slot);
  if (!slot.videoTex) {
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    slot.videoTex = tex;
  }
  slot.screenMat.map = slot.videoTex;
  slot.screenMat.color.set(0xffffff);
  slot.screenMat.needsUpdate = true;
  slot.playing = true;
  const p = el.play();
  if (p && p.catch) p.catch(() => { el.muted = true; el.play().catch(() => {}); });
}

// у кого-то остановилось видео — останавливаем у себя
function mpReceiveVStop(m) {
  const url = String(m.url || "");
  mpState.syncQueue.delete(url);
  mpState.pendingVideos.delete(url);
  const slot = mpSlotByUrl(url);
  if (slot) stopPlayback(slot);
  mpPublishNow();
}

// дозапуск отложенных (слоты ленивых зон могли догрузиться), раз в полсекунды
setInterval(() => {
  if (!mpState.connected) return;
  for (const [url, e] of [...mpState.pendingVideos]) {
    const slot = mpSlotByUrl(url);
    if (!slot) continue; // ещё не построен — ждём
    mpState.pendingVideos.delete(url);
    e.slot = slot;
    mpState.syncQueue.set(url, e);
    startSyncVisual(slot);
  }
}, 500);

// кнопка «Конфетти» удалена — вместо неё миникарта; взрыв по клавише E

// Взрыв конфетти вокруг игрока (клавиша E): центр + 8 точек вокруг в радиусе 4 м
function confettiExplosionAt(x, z) {
  fireConfetti(x, z, 200, true);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    fireConfetti(x + Math.cos(ang) * 4, z + Math.sin(ang) * 4, 90, true);
  }
}

function confettiExplosion() {
  const p = camera.position;
  confettiExplosionAt(p.x, p.z);
  // сетевой режим: все призраки увидят салют на нашей позиции
  if (mpState.connected) {
    mpSendRaw({ t: "boom", x: p.x, z: p.z });
  }
}

// интеракция по точке экрана (NDC): видео под прицелом / кнопка телепорта.
// Используется и мышью (центр экрана), и тапом на телефоне (точка касания).
function interactAt(ndc) {
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (hits.length) {
    const obj = hits[0].object;
    // кнопка телепорта: нажал — перенёсся в случайный проход лабиринта
    if (obj.userData.teleport) {
      fireConfetti(camera.position.x, camera.position.z, 25); // мини-салют у кнопки
      doMazeTeleport();
      return;
    }
    const slot = obj.userData.slot;
    // видео не подгружаем заранее — сначала превью по клику, затем играем
    preloadPreviewForSlot(slot, () => togglePlayback(slot));
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (!isPlaying()) return;          // на паузе клики не играют видео
  if (isTouch) return;               // на телефоне тап-клик обрабатывает touchend (чтобы отличить от свайпа)
  if (document.pointerLockElement !== canvas) lockPointer(); // при случае захватываем курсор
  interactAt(CENTER);
});

/* ============================== ТЕЛЕПОРТ-КНОПКА ============================== */

// перенос в случайный безопасный проход лабиринта (цель — всегда проходимая клетка)
function doMazeTeleport() {
  if (!mazeSafeCells.length) return;
  if (clock.elapsedTime - lastTeleport < 1) return; // защита от дабл-клика
  lastTeleport = clock.elapsedTime;
  const dest = mazeSafeCells[Math.floor(Math.random() * mazeSafeCells.length)];
  camera.position.set(dest.x, CFG.eyeHeight, dest.z);
  // салют на месте приземления + всем игрокам в мультиплеере
  confettiExplosion();
}

/* ============================== МУЗЫКА ============================== */

let music = null;
let musicBuffer = null;

function loadMusic() {
  new THREE.AudioLoader().load(
    "audio/halloween.mp3",
    (buf) => {
      musicBuffer = buf;
      if (started) playMusic();
    },
    undefined,
    (e) => console.warn("Музыка не загрузилась:", e)
  );
}

function playMusic() {
  if (!musicBuffer) return;
  if (music && music.isPlaying) return;
  if (!music) {
    music = new THREE.Audio(listener);
    music.setBuffer(musicBuffer);
    music.setLoop(true);
    music.setVolume(CFG.musicVolume);
  }
  try {
    music.play();
  } catch (e) {
    console.warn("Музыка не стартовала:", e);
  }
}

function stopMusic() {
  if (music && music.isPlaying) music.pause();
}

/* ============================== ЗВУК ПРИ ПАУЗЕ ============================== */

let soundSuspended = false;

function suspendSound() {
  if (soundSuspended) return;
  soundSuspended = true;
  try { listener.context.suspend(); } catch (e) { /* ignore */ }
}

function resumeSound() {
  if (!soundSuspended) return;
  soundSuspended = false;
  try { listener.context.resume(); } catch (e) { /* ignore */ }
}

// вкладка скрыта / окно не в фокусе — тишина
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspendSound();
  else if (started && overlay.classList.contains("hidden")) resumeSound();
});
window.addEventListener("blur", () => { if (started) suspendSound(); });
window.addEventListener("focus", () => {
  if (started && overlay.classList.contains("hidden")) resumeSound();
});

/* ============================== МУЛЬТИПЛЕЕР ============================== */

const usernameInput = $("username");
const mpNote = $("mp-note");
const mpCount = $("mp-count");

// всплывший из localStorage ник
try { usernameInput.value = localStorage.getItem("kurumur-name") || ""; } catch {}

// милая котико-аватарка: объёмная группа вращается по направлению взгляда игрока
function ghostSprite(name) {
  const group = new THREE.Group();

  // мягкий пушистый материал — палитра Куромур: лавандово-чернильная шёрстка
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xb9a8d4 }); // мягкая лаванда («Куро»-фиолет, осветлённый)
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2b2138 }); // чернильно-фиолетовый фон carrd

  // тельце — пузатая сфера
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), bodyMat);
  body.scale.set(1, 1.05, 1);
  body.position.y = -0.18;
  group.add(body);

  // голова — большая и круглая (миниатюрные пропорции: голова крупнее тела)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), bodyMat);
  head.position.y = 0.22;
  group.add(head);

  // ушки — два конуса сверху с тёмными кончиками
  const earGeo = new THREE.ConeGeometry(0.09, 0.16, 12);
  const earL = new THREE.Mesh(earGeo, bodyMat);
  earL.position.set(-0.16, 0.46, 0);
  earL.rotation.z = 0.25;
  group.add(earL);
  const earR = new THREE.Mesh(earGeo, bodyMat);
  earR.position.set(0.16, 0.46, 0);
  earR.rotation.z = -0.25;
  group.add(earR);
  // розовые внутренние ушки — как акценты 🐾 на carrd
  const earInGeo = new THREE.ConeGeometry(0.055, 0.1, 12);
  const earInMat = new THREE.MeshLambertMaterial({ color: 0xffd8e8 }); // тот же розовый, что у таблички
  const earInL = new THREE.Mesh(earInGeo, earInMat);
  earInL.position.set(-0.16, 0.45, 0.03);
  earInL.rotation.z = 0.25;
  group.add(earInL);
  const earInR = new THREE.Mesh(earInGeo, earInMat);
  earInR.position.set(0.16, 0.45, 0.03);
  earInR.rotation.z = -0.25;
  group.add(earInR);
  const tipGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const tipL = new THREE.Mesh(tipGeo, darkMat);
  tipL.position.set(-0.185, 0.53, 0);
  group.add(tipL);
  const tipR = new THREE.Mesh(tipGeo, darkMat);
  tipR.position.set(0.185, 0.53, 0);
  group.add(tipR);

  // хвостик — изогнутая цепочка шариков с тёмным кончиком, торчит назад (—Z)
  const tailSegGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const segs = [
    { p: [0, -0.15, -0.3], s: 1 },
    { p: [0.03, -0.08, -0.36], s: 0.95 },
    { p: [0.08, 0.02, -0.38], s: 0.85 },
  ];
  for (const s of segs) {
    const seg = new THREE.Mesh(tailSegGeo, bodyMat);
    seg.position.set(...s.p);
    seg.scale.setScalar(s.s);
    group.add(seg);
  }
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), darkMat);
  tailTip.position.set(0.12, 0.1, -0.37);
  group.add(tailTip);

  // лапки — четыре маленьких шарика у основания
  const pawGeo = new THREE.SphereGeometry(0.07, 10, 8);
  for (const [px, pz] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.12], [0.14, -0.12]]) {
    const paw = new THREE.Mesh(pawGeo, darkMat);
    paw.position.set(px, -0.46, pz);
    paw.scale.set(1, 0.7, 1);
    group.add(paw);
  }

  // глазки смотрят вперёд (+Z группы) — направление взгляда видно всем телом
  const eyeGeo = new THREE.SphereGeometry(0.07, 12, 10);
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0x2b2138 }); // чернильно-фиолетовые глазки, как фон carrd
  const eyeL = new THREE.Mesh(eyeGeo, eyeWhite);
  eyeL.scale.set(1, 1.3, 0.6);
  eyeL.position.set(-0.11, 0.25, 0.235);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeWhite);
  eyeR.scale.set(1, 1.3, 0.6);
  eyeR.position.set(0.11, 0.25, 0.235);
  group.add(eyeR);
  // двойной блеск в глазках — «втуберный» способ смотреть
  const shineGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const shineSmall = new THREE.SphereGeometry(0.012, 8, 6);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const s1 = new THREE.Mesh(shineGeo, shineMat);
  s1.position.set(-0.085, 0.295, 0.285);
  group.add(s1);
  const s2 = new THREE.Mesh(shineSmall, shineMat);
  s2.position.set(-0.13, 0.215, 0.28);
  group.add(s2);
  const s3 = new THREE.Mesh(shineGeo, shineMat);
  s3.position.set(0.135, 0.295, 0.285);
  group.add(s3);
  const s4 = new THREE.Mesh(shineSmall, shineMat);
  s4.position.set(0.09, 0.215, 0.28);
  group.add(s4);

  // носик + усы
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe2647a }));
  nose.position.set(0, 0.15, 0.27);
  nose.scale.set(1.3, 0.8, 0.7);
  group.add(nose);
  const whiskerGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4);
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0x2b2138 });
  for (const [side, yOff] of [[-1, 0.13], [1, 0.13], [-1, 0.09], [1, 0.09]]) {
    const w = new THREE.Mesh(whiskerGeo, whiskerMat);
    w.rotation.z = Math.PI / 2;
    w.rotation.y = side * 0.35;
    w.position.set(side * 0.2, yOff + 0.04, 0.2);
    group.add(w);
  }
  // розовые щёчки
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xffb7ca, transparent: true, opacity: 0.55 });
  const cheekL = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), cheekMat);
  cheekL.position.set(-0.19, 0.14, 0.22);
  cheekL.rotation.y = -0.4;
  group.add(cheekL);
  const cheekR = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), cheekMat);
  cheekR.position.set(0.19, 0.14, 0.22);
  cheekR.rotation.y = 0.4;
  group.add(cheekR);

  // табличка с именем — билборд над головой
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;  // Увеличиваем канвас для длинных имён
  const ctx = c.getContext("2d");
  
  const labelName = `${name} 🐾`;
  
  // Динамически подбираем размер шрифта, чтобы текст влез
  let px = 68;  // Начальный размер шрифта (было 34px, увеличиваем пропорционально канвасу)
  ctx.font = `700 ${px}px system-ui, "Segoe UI", sans-serif`;
  while (ctx.measureText(labelName).width > c.width - 56 && px > 24) {
    px -= 4;
    ctx.font = `700 ${px}px system-ui, "Segoe UI", sans-serif`;
  }
  
  const tw = Math.min(c.width - 56, ctx.measureText(labelName).width + 56);
  
  ctx.fillStyle = "rgba(20,14,28,0.75)";
  ctx.beginPath();
  ctx.roundRect(c.width / 2 - tw / 2, 20, tw, 88, 24);
  ctx.fill();
  
  ctx.fillStyle = "#ffd8e8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(labelName, c.width / 2, 66);
  
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  
  // Масштаб плашки — пропорционально размеру канваса
  const aspect = c.width / c.height;
  label.scale.set(1.6, 1.6 / aspect, 1);
  label.position.y = 0.75;
  group.add(label);

  return group;
}

/* ============================== МУЛЬТИПЛЕЕР ============================== */
/*
 * Транспорт: MQTT-релей поверх публичных брокеров (WebSocket). Замена двух
 * прежних схем: WebSocket-сервера в server.js (/mp) и P2P-PeerJS.
 *
 * Почему MQTT, а не PeerJS: P2P без TURN не пробивается между сетями многих
 * российских провайдеров (похоже, именно это случилось в проде: «друг друга
 * не видно»), а бесплатных публичных TURN почти не осталось. MQTT-брокер —
 * это уже готовый релей: каждый клиент публикует своё состояние и слушает
 * остальных. Нет избрания хоста, нет RTCPeerConnection, всё доходит любых
 * сетей. Объём данных мизерный (позиции и события).
 *
 * Топики (общие для всех):
 *   kuromursk-clips-7g2xvq/p    — позиции {t:"p", id, name, x, z, ry} 12 Гц
 *   kuromursk-clips-7g2xvq/evt  — события {t:"vplay"|"vstop"|"boom", id, ...}
 *   kuromursk-clips-7g2xvq/now  — retained: список «что играет прямо сейчас»
 *     {t:"now", videos:[{id,url},...]} — так что поздний вошедший сразу видит
 *     картину в фильме (замена серверного init.videos).
 * Призраки очищаются локально по lastSeen > 10 с, дубликаты имён — по месту
 * отрисовки (суффикс «Мур 2»).
 */
const MP_BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
];
const MP_ROOM = "kuromursk-clips-7g2xvq";
const MP_TOPIC_P = MP_ROOM + "/p";
const MP_TOPIC_EVT = MP_ROOM + "/evt";
const MP_TOPIC_NOW = MP_ROOM + "/now";

const mpState = {
  clients: [],          // ПОДКЛЮЧЕНИЯ КО ВСЕМ брокерам: [mqtt.Client | null]
  status: "off",        // off | connecting | on
  myId: null, connected: false, myName: null,
  others: new Map(), // id -> { sprite, name, x, z, ry, tx, tz, try, lastSeen }
  lastSend: 0,
  reconnectTimer: null,
  boomKey: null, boomTime: 0,  // дедупликация «boom» (двойной салют от двух брокеров)
  /* --- синхронизация видео (только факт запуска) --- */
  syncQueue: new Map(),     // url -> { id, url, slot, mine } — ОБЩАЯ очередь: что играет у всех
  pendingVideos: new Map(), // url -> инфо, слот ещё не построен (ленивая зона)
};

function mpDecode(raw) {
  try {
    const s = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    return JSON.parse(s);
  } catch { return null; }
}

// publish/subscribe на ВСЕ живые брокеры: один клиент MOЖ быть подключён
// только к доступным ему; чтобы любые пары игроков встречались, шину дублируем
function mpEachClient(fn) {
  let alive = 0;
  for (const c of mpState.clients) {
    if (c && c.connected) { alive++; try { fn(c); } catch {} }
  }
  return alive;
}

// Событие в общий топик (включая конфетти и остановки video)
function mpSendRaw(obj) {
  const payload = JSON.stringify({ ...obj, id: mpState.myId });
  mpEachClient((c) => c.publish(MP_TOPIC_EVT, payload));
}

// retained-список «что играет сейчас» — каждый клиент публикует своё знание,
// последний выигрывает; только что вошедший получает его по подписке
function mpPublishNow() {
  const videos = [...mpState.syncQueue.values()].map((e) => ({
    id: e.mine ? mpState.myId : e.id, url: e.url,
  }));
  const payload = JSON.stringify({ t: "now", videos });
  mpEachClient((c) => c.publish(MP_TOPIC_NOW, payload, { retain: true, qos: 0 }));
}

function mpSendVPlay(url) {
  mpSendRaw({ t: "vplay", url });
  mpPublishNow();
}

function mpSendVStop(url) {
  mpSendRaw({ t: "vstop", url });
  mpPublishNow();
}

// диагностическая сводка: смотреть в консоли `window.HALL.mp()`
function mpDebugInfo() {
  return {
    status: mpState.status,
    connected: mpState.connected,
    myId: mpState.myId,
    mqttLoaded: typeof mqtt !== "undefined" || typeof MQTT !== "undefined",
    brokers: MP_BROKERS.map((url, i) => ({
      broker: url.replace("wss://", ""),
      on: !!(mpState.clients[i] && mpState.clients[i].connected),
    })),
    ghosts: [...mpState.others.keys()].map((id) => mpState.others.get(id).name),
  };
}


// найти картину-слот по url видео
function mpSlotByUrl(url) {
  return currentSlots.find((s) => s.video.url === url) || null;
}

// Единая обработка входящих сообщений
function mpHandleMessage(m) {
  if (m.t === "p") {
    if (m.id === mpState.myId) return;
    mpUpdateGhost(m);
    return;
  }
  if (m.id === mpState.myId) return; // свои события не обрабатываем
  if (m.t === "join") { mpAddGhost(m.player); return; }
  if (m.t === "leave") { mpRemoveGhost(m.id); return; }
  if (m.t === "boom") {
    // при мульти-брокерной шине событие приходит дважды — салют дублируем нельзя
    const key = m.id + "|" + (m.x || 0) + "|" + (m.z || 0);
    const now = performance.now();
    if (mpState.boomKey === key && now - mpState.boomTime < 500) return;
    mpState.boomKey = key; mpState.boomTime = now;
    confettiExplosionAt(m.x, m.z);
    return;
  }
  if (m.t === "vplay") { mpReceiveVPlay(m); return; }
  if (m.t === "vstop") { mpReceiveVStop(m); return; }
  if (m.t === "now") {
    for (const e of m.videos || []) mpReceiveVPlay(e, true);
    return;
  }
}

function mpConnect(name) {
  if (typeof mqtt === "undefined" && typeof MQTT === "undefined") {
    console.warn("MQTT не загрузился — мультиплеер недоступен (музей работает без него)");
    return;
  }
  for (const c of mpState.clients) { if (c) { try { c.end(true); } catch {} } }
  mpState.clients = [];
  if (mpState.reconnectTimer) { clearTimeout(mpState.reconnectTimer); mpState.reconnectTimer = null; }
  mpState.myName = name;
  mpState.myId = "km" + Math.random().toString(36).slice(2, 10);
  mpStartAll();
}

// Стартуем ВСЕ брокеры параллельно: иначе разные игроки могут оказаться на
// разных брокерах (у кого-то hivemq не пробился — ротация увела их врозь).
function mpStartAll() {
  mpState.status = "connecting";
  for (let i = 0; i < MP_BROKERS.length; i++) mpStartBroker(i);
}

function mpStartBroker(i) {
  const url = MP_BROKERS[i];
  let client;
  try {
    client = (window.mqtt || window.MQTT).connect(url, {
      clientId: mpState.myId + "b" + i,
      keepalive: 30,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,  // авто-реконнект отключаем: сами перезапускаем всех
    });
  } catch (e) {
    console.warn("MQTT недоступен:", e);
    return;
  }
  mpState.clients[i] = client;
  console.info("MP: подключаемся к брокеру", url.replace("wss://", ""));

  client.on("connect", () => {
    if (mpState.clients[i] !== client) return;
    client.subscribe([MP_TOPIC_P, MP_TOPIC_EVT, MP_TOPIC_NOW], { qos: 0 });
    mpState.status = "on";
    mpState.connected = true;
    mpNote.classList.remove("hidden");
    console.info("MP: подключён:", url.replace("wss://", ""), "(брокер", i + 1, "/", MP_BROKERS.length + ")");
    // retained «что играет» придёт по подписке; и сразу публикуем своё знание
    mpPublishNow();
  });

  client.on("message", (topic, payload) => {
    const m = mpDecode(payload);
    if (!m || typeof m !== "object") return;
    mpHandleMessage(m);
  });

  const die = () => {
    if (mpState.clients[i] !== client) return;
    mpState.clients[i] = null;
    try { client.end(true); } catch {}
    mpMaybeRestart();
  };

  client.on("close", die);
  client.on("offline", die);
  client.on("error", (e) => {
    console.warn("MP: брокер недоступен:", (e && e.message) || e);
    die();
  });
}

// Все брокеры молчат — перезапуск всей шины через 15 с
function mpMaybeRestart() {
  if (mpState.clients.some((c) => c)) return; // есть ещё живое соединение
  mpState.connected = false;
  mpState.status = "off";
  if (mpState.reconnectTimer) return;
  if (!started) return;
  console.info("MP: все брокеры молчат — перезапуск через 15 с");
  mpState.reconnectTimer = setTimeout(() => {
    mpState.reconnectTimer = null;
    if (started) { mpState.clients = []; mpStartAll(); }
  }, 15000);
}

// (обрыв обрабатывается целиком через rotate() внутри mpTryBroker)

function mpAddGhost(p) {
  if (p.id === mpState.myId || mpState.others.has(p.id)) return;
  // дубликаты имён — суффикс по месту (раньше делал сервер)
  let name = String(p.name || "Гость");
  for (const g of mpState.others.values()) {
    if (g.name === name) { name = `${name} 2`; }
  }
  const sprite = ghostSprite(name); // теперь Group: тело-билборд + стрелка направления
  sprite.position.set(p.x, 1.35, p.z);
  scene.add(sprite);
  mpState.others.set(p.id, {
    sprite, name,
    x: p.x, z: p.z, ry: p.ry,
    tx: p.x, tz: p.z, try: p.ry,
    phase: Math.random() * 6.28,
    lastSeen: performance.now(),
  });
}

function mpUpdateGhost(p) {
  const g = mpState.others.get(p.id);
  if (!g) { mpAddGhost(p); return; }
  g.tx = p.x; g.tz = p.z; g.try = p.ry;
  g.lastSeen = performance.now();
}

function mpRemoveGhost(id) {
  const g = mpState.others.get(id);
  if (!g) return;
  scene.remove(g.sprite);
  for (const ch of g.sprite.children) {
    if (ch.isSprite) {
      ch.material.map.dispose();
    }
    if (ch.material) ch.material.dispose();
    if (ch.geometry) ch.geometry.dispose();
  }
  mpState.others.delete(id);
}

function mpTick(t, dt) {
  if (!mpState.connected) return;
  // отправляем своё состояние ~12 Гц на все живые брокеры
  if (t - mpState.lastSend > 0.08) {
    mpState.lastSend = t;
    const payload = JSON.stringify({
      t: "p", id: mpState.myId, name: mpState.myName,
      x: camera.position.x, z: camera.position.z, ry: yaw,
    });
    mpEachClient((c) => c.publish(MP_TOPIC_P, payload));
  }
  // призраки без новостей дольше 10 с — удаляем (замена серверного heartbeat)
  for (const [id, g] of [...mpState.others]) {
    if (t - g.lastSeen > 10) mpRemoveGhost(id);
  }
  mpCount.textContent = String(mpState.others.size);
  // интерполяция чужих призраков
  const k = 1 - Math.exp(-8 * dt);
  for (const g of mpState.others.values()) {
    g.x += (g.tx - g.x) * k;
    g.z += (g.tz - g.z) * k;
    // плавный поворот
    let d = g.try - g.ry;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    g.ry += d * k;
    // парение + лёгкое «дыхание» прозрачности
    g.sprite.position.set(
      g.x,
      1.35 + Math.sin(t * 1.6 + g.phase) * 0.09,
      g.z
    );
    // направление взгляда: всё привидение поворачивается лицом, куда смотрит игрок
    g.sprite.rotation.y = g.ry + Math.PI; // глаза на локальной +Z, yaw 0 = взгляд на -Z
    // лёгкое «дыхание» прозрачности всех частей тела
    for (const ch of g.sprite.children) {
      if (ch.isSprite) continue;
      ch.material.opacity = 0.55 + Math.sin(t * 0.9 + g.phase) * 0.08;
    }
  }
}

/* ============================== УПРАВЛЕНИЕ ============================== */

function enter() {
  if (!ready) return;
  if (!started) {
    // имя: обязательное, из поля ввода
    let name = usernameInput.value.trim().slice(0, 16);
    if (!name) {
      usernameInput.classList.add("err");
      usernameInput.focus();
      return;
    }
    usernameInput.classList.remove("err");
    try { localStorage.setItem("kurumur-name", name); } catch {}
    mpState.myName = name;
    playerName.textContent = name;
    playerBadge.classList.remove("hidden");

    started = true;
    crosshair.classList.remove("hidden");
    volHud.classList.remove("hidden");
    hintHud.classList.remove("hidden");
    minimap.classList.remove("hidden");
    mpConnect(name); // мультиплеер: представляемся и начинаем синхронизацию
    loadRemainingPreviews(); // догружаем превью лабиринта в фоне
    // праздничный залп при входе
    setTimeout(() => fireConfetti(0, Z_HALL - 2, 130), 400);
  }
  const ctx = listener.context;
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  resumeSound();
  playMusic();

  overlay.classList.add("hidden");
  lockPointer();
  // Enter в поле имени тоже входит
}
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); enter(); }
});

let hadPointerLock = false; // захват когда-либо удавался
function lockPointer() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) {
      p.catch(() => {
        const p2 = canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => {});
      });
    }
  } catch (e) {
    // pointer lock недоступен — играем в fallback-режиме (обзор при зажатой ЛКМ)
    try { canvas.requestPointerLock(); } catch (e2) { /* ignore */ }
  }
}

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) { hadPointerLock = true; return; }
  // пауза по Esc-подобной потере замка — лишь когда замок реально выдавался;
  // без замка играем тихо в fallback-режиме, ничего не выкидывая в меню
  if (started && hadPointerLock) {
    suspendSound(); // пауза — беззвучно
    ovTitle.textContent = "Пауза";
    ovSub.textContent = "Звук выключен. Нажмите «Продолжить», чтобы вернуться на праздник.";
    startBtn.textContent = "Продолжить";
    overlay.classList.remove("hidden");
  }
});

document.addEventListener("mousemove", (e) => {
  if (!isPlaying()) return;
  const locked = document.pointerLockElement === canvas;
  // без захвата курсора осматриваемся при удержании левой кнопки мыши
  if (!locked && !(e.buttons & 1)) return;
  yaw -= e.movementX * CFG.mouseSense;
  pitch -= e.movementY * CFG.mouseSense;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});

document.addEventListener("wheel", (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 0.05 : -0.05;
  // до 150%: master gain может превышать 1 — честно помечаю, что звук усилен.
  // Усиление > 1 упирается в клиппинг, поэтому пока громкость выше 100% —
  // в цепь включается компрессор (пики мягко удерживаются, тихое громче на слух).
  const vol = Math.max(0, Math.min(1.5, listener.getMasterVolume() + step));
  listener.setMasterVolume(vol);
  try {
    if (vol > 1) listener.setFilter(listener._boostComp);
    else listener.removeFilter();
  } catch (e) { /* старая версия three — усиление работает и так */ }
  volHud.textContent = vol === 0 ? "🔇 громкость выключена"
    : vol > 1 ? `📣 громкость ${Math.round(vol * 100)}% (усилено)` 
    : `🔊 громкость ${Math.round(vol * 100)}%`;
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (overlay.classList.contains("hidden")) keys.add(e.code);
  // E — большой взрыв конфетти вокруг игрока
  if (e.code === "KeyE" && isPlaying()) {
    confettiExplosion();
  }
  // Space — прыжок: не прокручиваем страницу
  if (e.code === "Space" && isPlaying()) e.preventDefault();
  // M — большая карта (работает и в игре, и на паузе)
  if (e.code === "KeyM" && started) {
    e.preventDefault();
    toggleBigmap();
    return;
  }
  // M/клик закрывает карту
  if (bigmapOpen && (e.code === "Escape" || e.code === "Space")) toggleBigmap(false);
  // Escape — пауза (работает и без pointer lock)
  if (e.code === "Escape" && started && !bigmapOpen && overlay.classList.contains("hidden")) {
    ovTitle.textContent = "Пауза";
    ovSub.textContent = "Звук выключен. Нажмите «Продолжить», чтобы вернуться на праздник.";
    startBtn.textContent = "Продолжить";
    overlay.classList.remove("hidden");
    suspendSound();
    return;
  }
  if (e.code === "KeyF" && isPlaying()) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
});
bigmap.addEventListener("click", () => toggleBigmap(false));
window.addEventListener("keyup", (e) => keys.delete(e.code));

/* ============================== СЕНСОРНОЕ УПРАВЛЕНИЕ (ТЕЛЕФОН) ============================== */
// Левая нижняя зона — плавающий виртуальный джойстик (аналоговые оси).
// Правая часть экрана — свайп: обзор мышью. Тап (без движения) = клик по картине.
// Кнопки: 🎉 конфетти (как E), 🗺 карта (как M), ⏸ пауза (как Esc).

let touchF = 0; // вперёд/назад  [-1..1]
let touchR = 0; // вправо/влево  [-1..1]
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

let touchUI = null;
if (isTouch) {
  touchUI = document.createElement("div");
  touchUI.id = "touch-ui";
  touchUI.innerHTML = `
    <div id="joy-zone"></div>
    <div id="joy-base" class="tx-hidden">
      <div id="joy-stick"></div>
    </div>
    <div class="tx-btns">
      <button id="btn-confetti" class="tx-btn" aria-label="Конфетти">🎉</button>
      <button id="btn-map" class="tx-btn" aria-label="Карта">🗺️</button>
      <button id="btn-vol" class="tx-btn" aria-label="Громкость">🔊</button>
      <button id="btn-jump" class="tx-btn" aria-label="Прыжок">⤒</button>
      <button id="btn-crouch" class="tx-btn" aria-label="Присед">⤓</button>
      <button id="btn-pause" class="tx-btn" aria-label="Пауза">⏸️</button>
    </div>
    <div id="vol-panel" class="tx-hidden">
      <span id="vol-val">🔊 100%</span>
      <input id="vol-range" type="range" min="0" max="150" step="5" value="100" />
    </div>`;
  document.body.appendChild(touchUI);
}

/* --- виртуальный джойстик --- */
const JOY_RADIUS = 56; // px, до края ход стика
const joyZone = document.getElementById("joy-zone");
const joyBase = document.getElementById("joy-base");
const joyStick = document.getElementById("joy-stick");
let joyId = null, joyCx = 0, joyCy = 0;

function joyCenter(e) {
  const t = e.changedTouches[0];
  joyCx = t.clientX; joyCy = t.clientY;
}
function joyUpdate(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== joyId) continue;
    let dx = t.clientX - joyCx, dy = t.clientY - joyCy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
    touchR = dx / JOY_RADIUS;
    touchF = -dy / JOY_RADIUS;
    joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
function joyEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== joyId) continue;
    joyId = null;
    touchF = 0; touchR = 0;
    joyStick.style.transform = "translate(0, 0)";
    joyBase.classList.add("tx-hidden");
  }
}
if (touchUI) {
  joyZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (joyId !== null) return; // один стик за раз
    joyId = e.changedTouches[0].identifier;
    joyCenter(e);
    // база появляется под пальцем (плавающий стик)
    joyBase.style.left = (joyCx - 70) + "px";
    joyBase.style.top = (joyCy - 70) + "px";
    joyBase.classList.remove("tx-hidden");
    joyUpdate(e);
  }, { passive: false });
  joyZone.addEventListener("touchmove", (e) => { e.preventDefault(); joyUpdate(e); }, { passive: false });
  joyZone.addEventListener("touchend", joyEnd);
  joyZone.addEventListener("touchcancel", joyEnd);
}

/* --- обзор свайпом по правой части экрана + тап = клик --- */
const lookTouch = { id: null, x: 0, y: 0, moved: 0, t0: 0 };
const LOOK_SENSE = 0.0045;

canvas.addEventListener("touchstart", (e) => {
  if (!isPlaying()) return;
  for (const t of e.changedTouches) {
    // левую нижнюю зону занимает джойстик, обзор — всё остальное
    if (t.clientX >= innerWidth * 0.3 && lookTouch.id === null) {
      lookTouch.id = t.identifier;
      lookTouch.x = t.clientX; lookTouch.y = t.clientY;
      lookTouch.moved = 0; lookTouch.t0 = performance.now();
    }
  }
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  if (!isPlaying() || lookTouch.id === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== lookTouch.id) continue;
    const dx = t.clientX - lookTouch.x, dy = t.clientY - lookTouch.y;
    lookTouch.x = t.clientX; lookTouch.y = t.clientY;
    lookTouch.moved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * LOOK_SENSE;
    pitch -= dy * LOOK_SENSE;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  }
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier !== lookTouch.id) continue;
    lookTouch.id = null;
    // короткий тап без движения = клик по картине (точка тапа, не центр экрана)
    if (isPlaying() && lookTouch.moved < 12 && performance.now() - lookTouch.t0 < 400) {
      interactAt(new THREE.Vector2(
        (t.clientX / innerWidth) * 2 - 1,
        -(t.clientY / innerHeight) * 2 + 1));
    }
  }
});

/* --- экранные кнопки --- */
if (touchUI) {
  const pauseLikeEsc = () => {
    if (!started || bigmapOpen) return;
    ovTitle.textContent = "Пауза";
    ovSub.textContent = "Звук выключен. Нажмите «Продолжить», чтобы вернуться на праздник.";
    startBtn.textContent = "Продолжить";
    overlay.classList.remove("hidden");
    suspendSound();
  };
  document.getElementById("btn-confetti").addEventListener("touchstart", (e) => { e.preventDefault(); if (isPlaying()) confettiExplosion(); });
  document.getElementById("btn-map").addEventListener("touchstart", (e) => { e.preventDefault(); if (started) toggleBigmap(); });
  document.getElementById("btn-pause").addEventListener("touchstart", (e) => { e.preventDefault(); pauseLikeEsc(); });
  // прыжок: одиночный тап = импульс
  document.getElementById("btn-jump").addEventListener("touchstart", (e) => { e.preventDefault(); touchJump = true; });
  // присед: тумблер (нажал — присел, нажал ещё раз — встал)
  document.getElementById("btn-crouch").addEventListener("touchstart", (e) => { e.preventDefault(); touchCrouch = !touchCrouch; });

  /* --- панель громкости (0-150%) --- */
  const volPanel = document.getElementById("vol-panel");
  const volRange = document.getElementById("vol-range");
  const volVal = document.getElementById("vol-val");

  const volLabel = (vol) => vol === 0 ? "🔇 0%"
    : vol > 1 ? `📣 ${Math.round(vol * 100)}% (усилено)`
    : `🔊 ${Math.round(vol * 100)}%`;

  const applyVolume = (vol) => {
    listener.setMasterVolume(vol);
    try {
      if (vol > 1) listener.setFilter(listener._boostComp);
      else listener.removeFilter();
    } catch (e) { /* старая версия three — усиление работает и так */ }
    volVal.textContent = volLabel(vol);
  };

  document.getElementById("btn-vol").addEventListener("touchstart", (e) => {
    e.preventDefault();
    const vol = Math.min(1.5, Math.max(0, listener.getMasterVolume()));
    volRange.value = String(Math.round(vol * 100));
    volVal.textContent = volLabel(vol);
    volPanel.classList.toggle("tx-hidden");
  });
  volRange.addEventListener("input", () => applyVolume(+volRange.value / 100));
  volRange.addEventListener("touchstart", (e) => e.stopPropagation()); // не трактовать как обзор-свайп
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.addEventListener("contextmenu", (e) => e.preventDefault());

startBtn.addEventListener("click", enter);
// игра стартует ТОЛЬКО по кнопке «Войти» или Enter в поле имени.
// Клики по оверлею (включая подпись/панель) никогда не запускают вход.
usernameInput.addEventListener("keydown", (e) => e.stopPropagation());

/* ============================== ДВИЖЕНИЕ ============================== */

function collide(pos) {
  const r = 0.3;
  for (const b of colliders) {
    if (pos.x > b.minX - r && pos.x < b.maxX + r && pos.z > b.minZ - r && pos.z < b.maxZ + r) {
      const dxL = pos.x - (b.minX - r), dxR = (b.maxX + r) - pos.x;
      const dzT = pos.z - (b.minZ - r), dzB = (b.maxZ + r) - pos.z;
      const m = Math.min(dxL, dxR, dzT, dzB);
      if (m === dxL) pos.x = b.minX - r;
      else if (m === dxR) pos.x = b.maxX + r;
      else if (m === dzT) pos.z = b.minZ - r;
      else pos.z = b.maxZ + r;
    }
  }
}

// играем когда «Войти» нажат и оверлей скрыт — независимо от pointer lock.
// Обзор мышью работает и без захвата курсора (fallback), Escape — пауза.
function isPlaying() {
  return started && overlay.classList.contains("hidden");
}

/* --- состояние прыжка/приседа --- */
let jumpOffset = 0;   // текущее превышение над уровнем глаз (м)
let jumpVy = 0;       // вертикальная скорость (м/с)
let crouching = false;
let eyeLevel = CFG.eyeHeight;
let touchJump = false;   // импульс от тач-кнопки
let touchCrouch = false; // зажат (тумблер) тач-кнопкой приседа

function updateMovement(dt) {
  if (!isPlaying()) {
    velocity.multiplyScalar(Math.exp(-8 * dt));
    return;
  }
  const kf = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  const kr = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  // оси с виртуального джойстика (аналоговые: наклон = доля скорости)
  const f = Math.max(-1, Math.min(1, kf + touchF));
  const r = Math.max(-1, Math.min(1, kr + touchR));

  const target = new THREE.Vector3(r, 0, -f);
  // длина < 1 — идём медленнее (полунаклон джойстика), > 1 — клампим до макс. скорости
  const tLen = target.length();
  if (tLen > 1) target.divideScalar(tLen);
  target.applyAxisAngle(UP, yaw);
  let speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? CFG.runSpeed : CFG.walkSpeed;
  if (crouching) speed *= CFG.crouchSpeed; // в приседе тише и медленнее (стелс по Куромур)
  target.multiplyScalar(speed);

  velocity.lerp(target, 1 - Math.exp(-CFG.smooth * dt));
  camera.position.addScaledVector(velocity, dt);

  /* --- прыжок и присед --- */
  // прыжок: одиночный импульс, в воздухе ходьба по инерции не мешает
  const onGround = jumpOffset <= 0.001 && Math.abs(jumpVy) < 0.01;
  const wantJump = (keys.has("Space") || touchJump);
  touchJump = false;
  if (wantJump && onGround && !crouching) jumpVy = CFG.jumpSpeed;
  if (jumpOffset > 0 || jumpVy !== 0) {
    jumpOffset += jumpVy * dt;
    jumpVy -= CFG.gravity * dt;
    if (jumpOffset <= 0) { jumpOffset = 0; jumpVy = 0; }
  }
  // присед: удержание C / тач-кнопка; стоя в воздухе приседать нельзя
  crouching = keys.has("KeyC") || touchCrouch;
  if (jumpOffset > 0) { crouching = false; /* прыжок важнее */ }

  // плавная смена высоты глаз: базовая (стоя/присед) + прыжок
  const targetEye = crouching ? CFG.crouchEye : CFG.eyeHeight;
  eyeLevel += (targetEye - eyeLevel) * (1 - Math.exp(-10 * dt));
  camera.position.y = eyeLevel + jumpOffset;
  collide(camera.position);

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

/* ============================== ЦИКЛ ============================== */

const clock = new THREE.Clock();
let confettiTimer = 3;

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  updateMovement(dt);
  mpTick(t, dt); // мультиплеер: отправка позиции + интерполяция призраков

  // шары покачиваются
  for (const b of balloons) {
    b.g.position.x = b.baseX + Math.sin(t * b.speed + b.phase) * 0.12;
    b.g.position.y = b.baseY + Math.sin(t * b.speed * 1.4 + b.phase) * 0.06;
    b.g.rotation.z = Math.sin(t * b.speed + b.phase) * 0.08;
  }

  // огоньки свечей слегка дрожат
  for (const f of candles) {
    f.intensity = 4 + Math.sin(t * 9 + f.position.x) * 0.7 + Math.random() * 0.3;
  }

  // язычки пламени пляшут
  for (const m of flameMeshes) {
    const s = 1 + Math.sin(t * 11 + m.userData.ph) * 0.22 + (Math.random() - 0.5) * 0.12;
    m.scale.set(1, s, 1);
  }

  // кнопки телепорта мягко пульсируют, привлекая взгляд
  for (const b of teleportButtons) {
    b.scale.setScalar(1 + Math.sin(t * 3 + b.position.x * 2 + b.position.z) * 0.07);
  }

  // коты гуляют по своим маршрутам
  for (const c of cats) {
    const s = t * c.speed * 6.28 + c.phase;
    const nx = c.cx + Math.cos(s) * c.rx;
    const nz = c.cz + Math.sin(s) * c.rz;
    // направление движения
    const dx = nx - c.g.position.x, dz = nz - c.g.position.z;
    if (dx * dx + dz * dz > 1e-6) {
      c.g.rotation.y = Math.atan2(dx, dz);
    }
    c.g.position.set(nx, 0, nz);
    // пружинистая походка + виляние хвостом
    c.g.position.y = Math.abs(Math.sin(t * 5 + c.bobPhase)) * 0.05;
    c.tail.rotation.z = Math.sin(t * 4 + c.bobPhase) * 0.5;
  }

  // конфетти: физика частиц
  for (let i = confettiBursts.length - 1; i >= 0; i--) {
    const b = confettiBursts[i];
    b.life += dt;
    const pos = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      const v = b.vel[j];
      v.vy -= 2.6 * dt;             // гравитация
      v.vx *= 1 - 0.9 * dt;         // сопротивление воздуха
      v.vz *= 1 - 0.9 * dt;
      pos.array[j * 3] += v.vx * dt;
      pos.array[j * 3 + 1] += v.vy * dt;
      pos.array[j * 3 + 2] += v.vz * dt;
      if (pos.array[j * 3 + 1] < 0.03) { // упало на пол — лежит
        pos.array[j * 3 + 1] = 0.03;
        v.vy = 0; v.vx *= 0.8; v.vz *= 0.8;
      }
    }
    pos.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - b.life / b.maxLife);
    if (b.life >= b.maxLife) {
      scene.remove(b.pts);
      b.pts.geometry.dispose();
      b.pts.material.dispose();
      confettiBursts.splice(i, 1);
    }
  }

  // периодические залпы конфетти (атмосфера праздника)
  confettiTimer -= dt;
  if (confettiTimer <= 0 && started) {
    confettiTimer = 5 + Math.random() * 4;
    if (confettiBursts.length < 4) {
      const p = camera.position;
      fireConfetti(p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6, 70);
    }
  }


  renderer.render(scene, camera);
});
