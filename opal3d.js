/* =========================================================
   Опал — 3D-фигуры из перламутрового стекла
   Формы строятся из SDF (signed distance fields) + marching cubes,
   рендерятся одним WebGL-рендерером в 2D-canvas каждой карточки.
   ========================================================= */
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- SDF-примитивы ---------- */
const { sqrt, abs, max, min, sin, cos, atan2, PI } = Math;
const len3 = (x, y, z) => sqrt(x * x + y * y + z * z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smin = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz);
  const k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// Конус со скруглёнными концами между точками a и b (Inigo Quilez)
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/* ---------- Формы ---------- */
const SHAPES = {
  tooth: {
    res: 84,
    sdf(x, y, z) {
      // коронка
      let d = sdEllipsoid(x, y - 0.36, z, 0.6, 0.38, 0.5);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        d = smin(d, len3(x - sx * 0.27, y - 0.58, z - sz * 0.21) - 0.27, 0.22);
      }
      d = smax(d, -(len3(x, y - 0.98, z) - 0.3), 0.16);           // фиссура
      d = smin(d, sdEllipsoid(x, y - 0.04, z, 0.47, 0.26, 0.4), 0.2); // шейка
      // корни
      d = smin(d, sdRoundCone(x, y, z, [-0.24, 0.02, 0.1], [-0.4, -0.9, 0.16], 0.21, 0.055), 0.2);
      d = smin(d, sdRoundCone(x, y, z, [0.24, 0.02, 0.1], [0.38, -0.88, 0.2], 0.21, 0.055), 0.2);
      d = smin(d, sdRoundCone(x, y, z, [0, 0.02, -0.2], [0.03, -0.84, -0.32], 0.21, 0.06), 0.2);
      return d;
    },
    rot: [0.12, -0.45, 0.04], wobble: 0.12
  },

  star: {
    res: 80,
    sdf(x, y, z) {
      const zs = z / 0.62;
      let d = sdEllipsoid(x, y, zs, 0.36, 0.36, 0.42);
      const L = 0.94;
      for (const [ax, ay] of [[L, 0], [-L, 0], [0, L], [0, -L]]) {
        d = smin(d, sdRoundCone(x, y, zs, [0, 0, 0], [ax, ay, 0], 0.3, 0.035), 0.34);
      }
      return d * 0.62;
    },
    rot: [0.25, 0.35, 0.12], wobble: 0.15
  },

  bubble: {
    res: 64,
    sdf: (x, y, z) => len3(x, y, z) - 0.86,
    rot: [0, 0, 0], wobble: 1
  },

  drop: {
    res: 76,
    sdf: (x, y, z) => sdRoundCone(x, y, z, [0, -0.3, 0], [0, 0.88, 0], 0.6, 0.025),
    rot: [0.08, 0, -0.08], wobble: 0.55
  },

  lens: {
    res: 72,
    sdf: (x, y, z) => sdEllipsoid(x, y, z, 0.86, 0.86, 0.4),
    rot: [0.45, -0.75, 0.55], wobble: 0.3
  },

  veneer: {
    res: 84,
    sdf(x, y, z) {
      // изогнутая тонкая «лопатка», шире к режущему краю
      const w = 0.84 + 0.2 * clamp(-y, -1, 1);
      const bz = z + 0.4 * x * x - 0.08 - 0.12 * y * y;
      return sdEllipsoid(x / w, y, bz, 0.62, 0.86, 0.17) * 0.8;
    },
    rot: [-0.1, -0.5, -0.18], wobble: 0.15
  },

  aligner: {
    res: 96,
    sdf(x, y, z) {
      let d = 1e9;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = -1 + (2 * i) / (n - 1);
        const th = t * 1.33;
        const cx = 0.8 * sin(th), cz = -0.62 * cos(th) + 0.28;
        const m = smooth(0.35, 1, abs(t));
        // ориентируем «зуб» по касательной к дуге
        const dx = x - cx, dz = z - cz;
        const c = cos(th), s = sin(th);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const e = sdEllipsoid(lx, y, lz, 0.075 + 0.045 * m, 0.13 - 0.015 * m, 0.07 + 0.075 * m);
        d = smin(d, e, 0.075);
      }
      // каппа полая — вычитаем внутренний объём снизу
      return smax(d, -(y + 0.06 + 0.0), 0.04);
    },
    rot: [1.0, 0, 0], wobble: 0.1
  },

  implant: {
    res: 100,
    sdf(x, y, z) {
      // винт с винтовой резьбой
      const q = sqrt(x * x + z * z);
      const phase = y * 7.5 - atan2(z, x) / (2 * PI);
      const tri = abs(phase - Math.floor(phase) - 0.5) * 2;
      const taper = 1 - 0.38 * smooth(-0.45, -0.95, y);
      const r = (0.16 + 0.055 * (1 - tri)) * taper;
      let screw = (q - r) * 0.7;
      screw = smax(screw, y - 0.06, 0.05);
      screw = smax(screw, -0.95 - y, 0.08);
      // абатмент
      let d = smin(screw, sdRoundCone(x, y, z, [0, 0.02, 0], [0, 0.26, 0], 0.15, 0.11), 0.06);
      // коронка
      let crown = sdEllipsoid(x, y - 0.56, z, 0.44, 0.27, 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        crown = smin(crown, len3(x - sx * 0.19, y - 0.72, z - sz * 0.16) - 0.18, 0.15);
      }
      crown = smax(crown, -(len3(x, y - 0.98, z) - 0.2), 0.12);
      return smin(d, crown, 0.1);
    },
    rot: [0.15, 0.4, -0.12], wobble: 0.08
  }
};

/* ---------- Запекание формы в геометрию ---------- */
const geoCache = new Map();
let mcCache = null;

function bake(name) {
  if (geoCache.has(name)) return geoCache.get(name);
  const def = SHAPES[name];
  const res = def.res;
  if (!mcCache || mcCache.size !== res) {
    mcCache = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 260000);
  }
  const mc = mcCache;
  mc.reset();
  const f = mc.field, half = res / 2, size2 = res * res;
  for (let k = 0; k < res; k++) {
    const z = (k - half) / half;
    for (let j = 0; j < res; j++) {
      const y = (j - half) / half;
      const o = k * size2 + j * res;
      for (let i = 0; i < res; i++) {
        f[o + i] = -def.sdf((i - half) / half, y, z);
      }
    }
  }
  mc.isolation = 0;
  mc.update();

  const n = mc.count;
  const pos = mc.positionArray.slice(0, n * 3);
  const nor = mc.normalArray.slice(0, n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  const s = 1 / g.boundingSphere.radius;
  g.scale(s, s, s);
  g.computeBoundingSphere();
  geoCache.set(name, g);
  return g;
}

/* ---------- Рендерер и окружение ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

if (renderer) init();

function init() {
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setScissorTest(true);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;

  // цветные «студийные» источники дают перламутровые блики
  const pink = new THREE.DirectionalLight(0xffb8ea, 2.2); pink.position.set(-3, 2, 2);
  const cyan = new THREE.DirectionalLight(0xa8ecff, 2.0); cyan.position.set(3, -1, 2);
  const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(0.5, 3, 4);
  const lilac = new THREE.PointLight(0xc6a8ff, 6, 10); lilac.position.set(0, 0, -2.5);
  scene.add(pink, cyan, key, lilac);

  /* ---------- Материал: стекло + перламутр ---------- */
  const shared = { uTime: { value: 0 } };

  function glass(side) {
    const front = side === THREE.FrontSide;
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x7d74b8,
      roughness: 0.06,
      metalness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.45,
      iridescenceThicknessRange: [180, 900],
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
      sheen: 1,
      sheenColor: new THREE.Color(0xf0c8ff),
      sheenRoughness: 0.25,
      envMapIntensity: 1.25,
      transparent: true,
      side,
      depthWrite: front
    });
    m.userData.uniforms = {
      uWobble: { value: 0 },
      uAlphaMin: { value: front ? 0.16 : 0.1 },
      uRim: { value: front ? 0.7 : 0.35 },
      uShift: { value: 0 }
    };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, shared, m.userData.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWobble;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float w = sin(position.y * 4.2 + uTime * 1.9) * 0.5
                  + sin(position.x * 5.1 - uTime * 1.4) * 0.35
                  + sin(position.z * 6.3 + uTime * 2.3) * 0.25;
          transformed += normal * w * 0.035 * uWobble;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAlphaMin;\nuniform float uRim;\nuniform float uShift;\nuniform float uTime;')
        .replace('#include <dithering_fragment>', `
          vec3 nn = normalize(vNormal);
          if (!gl_FrontFacing) nn = -nn;
          float fres = pow(1.0 - clamp(dot(nn, normalize(vViewPosition)), 0.0, 1.0), 1.8);
          // перламутровый перелив: пастельная радуга по краю и по наклону нормали
          float band = fres * 0.85 + nn.y * 0.18 + nn.x * 0.12 + uShift;
          vec3 rainbow = 0.62 + 0.38 * cos(6.2831 * (band + vec3(0.0, 0.33, 0.67)));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, rainbow, 0.28);
          gl_FragColor.rgb += fres * uRim * mix(vec3(1.0), rainbow, 0.7);
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float a = uAlphaMin + fres * (0.95 - uAlphaMin);
          a = max(a, smoothstep(0.78, 1.15, lum) * 0.95);
          gl_FragColor.a = clamp(a, 0.0, 1.0) * opacity;
          #include <dithering_fragment>`);
    };
    m.customProgramCacheKey = () => 'opal-glass-' + (front ? 'f' : 'b');
    return m;
  }

  /* ---------- Вьюхи (по одной на карточку) ---------- */
  const views = [];
  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  class View {
    constructor(el) {
      this.el = el;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'obj3d__canvas';
      el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
      this.group = new THREE.Group();
      this.back = new THREE.Mesh(undefined, glass(THREE.BackSide));
      this.front = new THREE.Mesh(undefined, glass(THREE.FrontSide));
      this.back.renderOrder = 0; this.front.renderOrder = 1;
      this.group.add(this.back, this.front);
      this.visible = false;
      this.ready = false;
      this.appear = 0;           // 0..1 появление
      this.hover = 0;
      this.spin = 0; this.spinVel = 0;
      this.tilt = { x: 0, y: 0 };
      this.swap = null;          // смена формы
      this.phase = Math.random() * 10;
      this.trigger = el.closest('.card, .service, .case, .cta') || el;
      this.trigger.addEventListener('pointerenter', () => { this.hoverOn = true; this.spinVel += 7; });
      this.trigger.addEventListener('pointerleave', () => { this.hoverOn = false; });
      this.setShape(el.dataset.shape, true);
    }

    setShape(name, initial) {
      if (!SHAPES[name] || name === this.shape) return;
      if (initial || !this.ready) { this.shape = name; this.ready = false; return; }
      this.swap = { name, t: 0 };   // анимация «уйти — прийти»
    }

    applyShape() {
      const g = bake(this.shape);
      const def = SHAPES[this.shape];
      this.back.geometry = g; this.front.geometry = g;
      this.base = def.rot;
      this.wobble = def.wobble;
      this.ready = true;
      this.el.classList.add('is-3d');
    }
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target.__view;
      v.visible = e.isIntersecting;
    });
  }, { rootMargin: '200px 0px' });

  document.querySelectorAll('.obj3d').forEach(el => {
    const v = new View(el);
    el.__view = v;
    views.push(v);
    io.observe(el);
  });

  // публичный API для смены формы (вкладки «До и после»)
  window.opal3d = { setShape: (el, name) => el && el.__view && el.__view.setShape(name) };

  /* ---------- Ленивое запекание: сначала видимые ---------- */
  function bakeNext() {
    const pending = views.filter(v => !v.ready);
    if (!pending.length) return;
    pending.sort((a, b) => (b.visible - a.visible) || (a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top));
    pending[0].applyShape();
    // остальные вьюхи с той же формой получают её бесплатно
    views.forEach(v => { if (!v.ready && geoCache.has(v.shape)) v.applyShape(); });
    (window.requestIdleCallback || (cb => setTimeout(cb, 60)))(bakeNext, { timeout: 400 });
  }
  bakeNext();

  /* ---------- Цикл рендера ---------- */
  let bufW = 0, bufH = 0, last = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const backOut = t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    shared.uTime.value = time;
    const dpr = Math.min(devicePixelRatio || 1, 2);

    for (const v of views) {
      if (!v.visible || !v.ready) continue;
      const rect = v.el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
      if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
      if (w > bufW || h > bufH) {
        bufW = Math.max(bufW, w); bufH = Math.max(bufH, h);
        renderer.setSize(bufW, bufH, false);
      }

      /* --- анимация --- */
      const m = reduceMotion ? 0 : 1;
      v.appear = Math.min(1, v.appear + dt / 1.5);
      v.hover += ((v.hoverOn ? 1 : 0) - v.hover) * Math.min(1, dt * 6);
      v.spinVel *= Math.pow(0.04, dt);                  // затухание раскрутки
      v.spin += v.spinVel * dt * m;

      let swapScale = 1;
      if (v.swap) {
        v.swap.t += dt / 0.9;
        if (v.swap.t >= 0.5 && v.shape !== v.swap.name) {
          v.shape = v.swap.name; v.applyShape();
        }
        swapScale = v.swap.t < 0.5 ? 1 - ease(v.swap.t * 2) : backOut((v.swap.t - 0.5) * 2);
        if (v.swap.t >= 1) v.swap = null;
      }

      // наклон к курсору
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const tx = clamp((pointer.x - cx) / innerWidth, -1, 1);
      const ty = clamp((pointer.y - cy) / innerHeight, -1, 1);
      const k = (0.55 + 0.6 * v.hover) * m;
      v.tilt.x += (ty * 0.7 * k - v.tilt.x) * Math.min(1, dt * 3);
      v.tilt.y += (tx * 1.1 * k - v.tilt.y) * Math.min(1, dt * 3);

      const a = backOut(v.appear);
      const t = time * m + v.phase;
      const g = v.group;
      g.rotation.set(
        v.base[0] + sin(t * 0.45) * 0.1 + v.tilt.x,
        v.base[1] + sin(t * 0.35) * 0.28 + v.tilt.y + v.spin + (1 - ease(v.appear)) * 2.4,
        v.base[2] + sin(t * 0.5) * 0.06
      );
      const s = (0.55 + 0.45 * a) * (1 + 0.07 * v.hover) * swapScale;
      g.scale.setScalar(Math.max(0.001, s));
      // парение + лёгкий параллакс от скролла
      const par = ((cy - innerHeight / 2) / innerHeight) * -0.18;
      g.position.set(0, sin(t * 0.9) * 0.05 * m + par * m - (1 - ease(v.appear)) * 0.35, 0);

      for (const mesh of [v.back, v.front]) {
        const u = mesh.material.userData.uniforms;
        u.uWobble.value = (v.wobble + v.hover * 0.6) * m;
        u.uShift.value = (t * 0.05 + v.hover * 0.25);
        mesh.material.opacity = Math.min(1, v.appear * 1.6) * Math.min(1, swapScale * 1.5);
        mesh.material.iridescenceThicknessRange[1] = 700 + 180 * sin(t * 0.7);
      }

      /* --- камера: вписать объект радиуса ~1 --- */
      const cam = v.camera;
      cam.aspect = w / h;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const fit = Math.min(tanV, tanV * cam.aspect);
      cam.position.set(0, 0, 1.08 / fit + 0.2);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();

      /* --- рендер в общий буфер и копия в canvas карточки --- */
      scene.add(g);
      renderer.setViewport(0, 0, w, h);
      renderer.setScissor(0, 0, w, h);
      renderer.clear();
      renderer.render(scene, cam);
      scene.remove(g);

      v.ctx.clearRect(0, 0, w, h);
      v.ctx.drawImage(renderer.domElement, 0, bufH - h, w, h, 0, 0, w, h);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
