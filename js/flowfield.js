/**
 * FlowFieldBackground
 *
 * Minimal generative backdrop: hundreds of hair-thin particles ride a
 * domain-warped simplex flow field and leave short silk-like trails.
 * The cursor bends the current into a slow vortex (nearby strokes pick up
 * a faint glow); clicking / tapping emits a thin ripple that shoves
 * particles aside.
 *
 * Trails are drawn by erasing the previous frame with a low-alpha
 * `destination-out` pass, so the CSS gradient painted behind the canvas
 * element keeps showing through instead of being flooded by an opaque fill.
 *
 * Performance notes: particles are bucketed by (tone, width, alpha) and each
 * bucket is stroked as a single path, so a frame issues roughly a third of
 * the draw calls of one-per-particle, with no per-frame string allocation.
 * The loop is capped at ~60 fps so high-refresh displays don't do 2x the
 * work (the simulation is frame-based, so this also keeps speed consistent).
 */

/* Deterministic PRNG so the noise permutation is stable within a page load. */
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Compact seeded 2D simplex noise (Gustavson-style), output in ~[-1, 1]. */
class SimplexNoise {
    constructor(seed) {
        const rand = mulberry32(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        // Fisher-Yates shuffle for the permutation table.
        for (let i = 255; i > 0; i--) {
            const j = (rand() * (i + 1)) | 0;
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
    }

    noise2D(xin, yin) {
        const F2 = SimplexNoise.F2;
        const G2 = SimplexNoise.G2;
        const GRAD3 = SimplexNoise.GRAD3;
        let n0 = 0, n1 = 0, n2 = 0;

        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;

        const x0 = xin - (i - t);
        const y0 = yin - (j - t);

        // Corner offsets depend on which half of the simplex we landed in.
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        const ii = i & 255;
        const jj = j & 255;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const g = GRAD3[this.permMod12[ii + this.perm[jj]]];
            t0 *= t0;
            n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const g = GRAD3[this.permMod12[ii + i1 + this.perm[jj + j1]]];
            t1 *= t1;
            n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const g = GRAD3[this.permMod12[ii + 1 + this.perm[jj + 1]]];
            t2 *= t2;
            n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
        }

        // Empirical factor scaling the sum into roughly [-1, 1].
        return 70 * (n0 + n1 + n2);
    }
}

SimplexNoise.F2 = 0.5 * (Math.sqrt(3) - 1);
SimplexNoise.G2 = (3 - Math.sqrt(3)) / 6;
SimplexNoise.GRAD3 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [1, 0], [-1, 0],
    [0, 1], [0, -1], [0, 1], [0, -1]
];

class FlowFieldBackground {
    constructor() {
        // Legacy element id kept from the previous background; the canvas
        // and its CSS (css/matrix.css) are reused on purpose.
        this.canvas = document.getElementById('matrixCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.noise = new SimplexNoise((Math.random() * 0xffffffff) | 0);

        this.particles = [];
        this.sparks = [];
        this.mouse = { x: 0, y: 0, active: false };
        this.rafId = null;
        this.resizeRaf = null;
        this.lastFrame = 0;
        this.frameInterval = 1000 / 60;
        this.events = new AbortController();

        this.width = 0;
        this.height = 0;
        this.dpr = 1;

        // Random phase so each visit opens on a different current.
        this.time = Math.random() * 4000;

        this.config = {
            baseSpeed: 0.75,
            maxSpeed: 2.8,       // velocity cap so streaks remain calm
            steer: 0.055,        // how fast particles align with the field
            fieldScale: 0.0015,  // noise zoom: small value = large, calm features
            warpStrength: 160,   // px of domain warp, keeps the flow organic
            winding: 2.4,        // field angle range multiplier (x PI)
            timeDrift: 0.00028,  // slow evolution of the whole field
            fadeAlpha: 0.038,    // trail persistence (lower = longer trails)
            mouseRadius: 180,
            mouseSwirl: 0.5,     // tangential push around the cursor
            mousePull: 0.06,     // whisper of inward pull -> orbiting feel
            glowBoost: 0.25,     // extra alpha for particles near the cursor
            sparkCount: 10,      // subtle micro-sparks per click
            life: { min: 280, max: 920 } // frames before a particle respawns
        };

        // Rich site palette with cyan, indigo, violet, and soft luminous accents
        this.palette = [
            { weight: 0.55, rgb: '206, 224, 255', alpha: 0.13 }, // Soft cyan-white
            { weight: 0.18, rgb: '79, 195, 247', alpha: 0.24 }, // Electric cyan
            { weight: 0.14, rgb: '102, 126, 234', alpha: 0.16 }, // Deep indigo
            { weight: 0.13, rgb: '146, 103, 197', alpha: 0.16 }  // Soft violet
        ];

        this.buildStyleCache();
        this.init();
    }

    buildStyleCache() {
        // Colors are dimmed here instead of with a CSS `filter: brightness()`
        // on the canvas, which would cost a full-screen filter pass per frame.
        // Additive blending is linear, so the result is nearly identical.
        const dim = 0.7;
        const dimRgb = (rgb) => rgb.split(',').map((c) => Math.round(c * dim)).join(', ');
        for (const tone of this.palette) tone.drawRgb = dimRgb(tone.rgb);
        const dotRgb = dimRgb('240, 248, 255');

        // Alpha and line width are quantized so particles can share a path.
        // Steps are small enough that the difference is not visible.
        this.alphaStep = 0.02;
        this.alphaLevels = Math.round(1 / this.alphaStep) + 1;
        this.widthStep = 0.2;
        this.widthLevels = 10; // covers the 0.4px - 1.8px particle range

        this.strokeStyles = [];
        for (const tone of this.palette) {
            for (let a = 0; a < this.alphaLevels; a++) {
                this.strokeStyles.push(`rgba(${tone.drawRgb}, ${(a * this.alphaStep).toFixed(3)})`);
            }
        }
        this.dotStyles = [];
        for (let a = 0; a < this.alphaLevels; a++) {
            this.dotStyles.push(`rgba(${dotRgb}, ${(a * this.alphaStep).toFixed(3)})`);
        }

        const lineBuckets = this.palette.length * this.widthLevels * this.alphaLevels;
        this.lineCounts = new Uint16Array(lineBuckets + 1);
        this.dotCounts = new Uint16Array(this.alphaLevels + 1);
    }

    init() {
        this.bindEvents();
        this.handleResize();

        // Pre-run a short exposure so the first paint is already textured.
        this.warmup(60);
        this.animate();
    }

    bindEvents() {
        const signal = this.events.signal;
        // The canvas has pointer-events: none, so listen on window.
        window.addEventListener('pointermove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        }, { passive: true, signal });

        window.addEventListener('pointerdown', (e) => {
            this.spawnClickBurst(e.clientX, e.clientY);
        }, { passive: true, signal });

        window.addEventListener('pointerout', () => {
            this.mouse.active = false;
        }, { signal });

        // Pause the rAF loop when the tab is hidden to save CPU / battery.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else {
                this.start();
            }
        }, { signal });

        window.addEventListener('resize', () => {
            if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
            this.resizeRaf = requestAnimationFrame(() => {
                this.resizeRaf = null;
                this.handleResize();
            });
        }, { signal });
    }

    start() {
        if (this.rafId) return;
        this.animate();
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    destroy() {
        this.stop();
        this.events.abort();
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.particles = [];
        this.sparks = [];
        // Release the high-DPI drawing buffer when switching to CSS only.
        this.canvas.width = 1;
        this.canvas.height = 1;
    }

    handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Mobile browsers fire resize on scroll when the URL bar collapses;
        // only react to real geometry changes to avoid canvas flicker.
        if (this.width && w === this.width && Math.abs(h - this.height) < 150) return;

        this.width = w;
        this.height = h;
        // The strokes are faint and soft, so a 1x buffer looks nearly the same
        // on HiDPI screens while using a quarter of the memory and fill cost.
        this.dpr = 1;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Density scales with area, clamped for both phones and ultrawides.
        const count = Math.round(Math.min(Math.max((w * h) / 2600, 160), 650));
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle());
        }

        // Scratch buffers for bucketing particles at draw time.
        this.lineKeys = new Int16Array(count);
        this.lineOrder = new Uint16Array(count);
        this.dotKeys = new Int16Array(count);
        this.dotOrder = new Uint16Array(count);

        // Repaint a short exposure so a resize never flashes an empty canvas.
        this.warmup(30);
    }

    pickTone() {
        let roll = Math.random();
        for (let i = 0; i < this.palette.length; i++) {
            roll -= this.palette[i].weight;
            if (roll <= 0) return i;
        }
        return 0;
    }

    createParticle() {
        const toneIndex = this.pickTone();
        const tone = this.palette[toneIndex];
        const { min, max } = this.config.life;

        // 3 Depth layers: 0 (background ambient), 1 (main stream), 2 (foreground highlight)
        const randDepth = Math.random();
        let depth = 1;
        let speedMult = 1.0;
        let widthMult = 1.0;
        let alphaMult = 1.0;

        if (randDepth < 0.25) {
            depth = 0;
            speedMult = 0.65;
            widthMult = 0.6;
            alphaMult = 0.65;
        } else if (randDepth > 0.78) {
            depth = 2;
            speedMult = 1.35;
            widthMult = 1.35;
            alphaMult = 1.25;
        }

        return {
            depth,
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            px: 0,
            py: 0,
            vx: 0,
            vy: 0,
            speed: this.config.baseSpeed * speedMult * (0.75 + Math.random() * 0.5),
            width: (0.7 + Math.random() * 0.5) * widthMult,
            tone: toneIndex,
            baseAlpha: tone.alpha * (0.75 + Math.random() * 0.5) * alphaMult,
            alpha: 0,
            glow: 0,
            life: Math.floor(Math.random() * (min * 0.5)),
            maxLife: min + Math.random() * (max - min),
            fresh: true // no previous point yet -> nothing to draw
        };
    }

    respawn(p) {
        p.x = Math.random() * this.width;
        p.y = Math.random() * this.height;
        p.vx = 0;
        p.vy = 0;
        p.life = 0;
        p.fresh = true;
    }

    spawnClickBurst(x, y) {
        // Emit a subtle, delicate burst of hair-thin micro-sparks on click
        const count = this.config.sparkCount;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.0 + Math.random() * 2.2;
            const tone = this.palette[this.pickTone()];
            this.sparks.push({
                x,
                y,
                px: x,
                py: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rgb: tone.drawRgb,
                size: 0.6 + Math.random() * 0.8,
                alpha: 0.6 + Math.random() * 0.25,
                life: 0,
                maxLife: 25 + Math.random() * 25
            });
        }
    }

    updateParticles() {
        const { fieldScale, warpStrength, winding, steer, maxSpeed } = this.config;
        const t = this.time;
        const m = this.mouse;
        const radius = this.config.mouseRadius;
        const radiusSq = radius * radius;

        const fadeIn = 35;
        const fadeOut = 55;

        for (const p of this.particles) {
            // Smooth life envelope (fade-in on spawn, fade-out near maxLife)
            let lifeEnvelope = 1;
            if (p.life < fadeIn) {
                lifeEnvelope = p.life / fadeIn;
            } else if (p.life > p.maxLife - fadeOut) {
                lifeEnvelope = Math.max(0, (p.maxLife - p.life) / fadeOut);
            }
            p.alpha = p.baseAlpha * lifeEnvelope;

            // Domain-warped flow angle: the warp layer bends the main field
            // so the current curls organically instead of drifting straight.
            const warp = this.noise.noise2D(
                p.x * fieldScale * 0.4 + t * 0.5,
                p.y * fieldScale * 0.4 - t * 0.3
            );
            const angle = this.noise.noise2D(
                (p.x + warp * warpStrength) * fieldScale + t,
                (p.y - warp * warpStrength) * fieldScale - t * 0.7
            ) * Math.PI * winding;

            p.vx += (Math.cos(angle) * p.speed - p.vx) * steer;
            p.vy += (Math.sin(angle) * p.speed - p.vy) * steer;

            // Cursor vortex: tangential swirl + slight inward pull.
            let proximity = 0;
            if (m.active) {
                const dx = p.x - m.x;
                const dy = p.y - m.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < radiusSq && distSq > 0.5) {
                    const dist = Math.sqrt(distSq);
                    proximity = 1 - dist / radius;
                    const falloff = proximity * proximity;
                    p.vx += (-dy / dist) * falloff * this.config.mouseSwirl
                        + (-dx / dist) * falloff * this.config.mousePull;
                    p.vy += (dx / dist) * falloff * this.config.mouseSwirl
                        + (-dy / dist) * falloff * this.config.mousePull;
                }
            }
            // Smooth the glow so the highlight eases in and out.
            p.glow += (proximity - p.glow) * 0.12;

            const speedSq = p.vx * p.vx + p.vy * p.vy;
            if (speedSq > maxSpeed * maxSpeed) {
                const scale = maxSpeed / Math.sqrt(speedSq);
                p.vx *= scale;
                p.vy *= scale;
            }

            p.px = p.x;
            p.py = p.y;
            p.x += p.vx;
            p.y += p.vy;

            // Wrap at the edges; mark fresh so no cross-screen streak is drawn.
            if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
                p.x = (p.x + this.width) % this.width;
                p.y = (p.y + this.height) % this.height;
                p.fresh = true;
            }

            if (++p.life > p.maxLife) {
                this.respawn(p);
            }
        }
    }

    updateSparks() {
        const drag = 0.91;
        const { fieldScale } = this.config;
        const t = this.time;
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.px = s.x;
            s.py = s.y;

            // Gently blend spark velocity with noise field as it slows down
            const angle = this.noise.noise2D(s.x * fieldScale + t, s.y * fieldScale - t) * Math.PI * 2;
            s.vx = s.vx * drag + Math.cos(angle) * 0.15;
            s.vy = s.vy * drag + Math.sin(angle) * 0.15;

            s.x += s.vx;
            s.y += s.vy;
            s.life++;

            if (s.life >= s.maxLife) {
                this.sparks.splice(i, 1);
            }
        }
    }

    fade() {
        // Erase a fraction of the previous frame towards transparency so
        // the CSS backdrop behind the canvas keeps showing through.
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.config.fadeAlpha})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /* Counting sort: groups particle indices in `order` by their bucket key
       (keys < 0 are skipped). Afterwards counts[k] is the end offset of
       bucket k, and bucket k starts where bucket k - 1 ends. */
    sortByKey(keys, n, counts, order) {
        counts.fill(0);
        for (let i = 0; i < n; i++) {
            if (keys[i] >= 0) counts[keys[i] + 1]++;
        }
        for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
        for (let i = 0; i < n; i++) {
            const k = keys[i];
            if (k >= 0) order[counts[k]++] = i;
        }
    }

    drawParticles() {
        const ctx = this.ctx;
        const particles = this.particles;
        const n = particles.length;
        const { alphaStep, alphaLevels, widthStep, widthLevels, lineKeys, dotKeys } = this;
        const glowBoost = this.config.glowBoost;

        for (let i = 0; i < n; i++) {
            const p = particles[i];
            lineKeys[i] = -1;
            dotKeys[i] = -1;
            if (p.fresh) {
                p.fresh = false;
                continue;
            }
            const alpha = Math.min(1, p.alpha + p.glow * glowBoost);
            const a = Math.round(alpha / alphaStep);
            if (a === 0) continue;

            const w = Math.min(widthLevels - 1, Math.round(p.width / widthStep));
            lineKeys[i] = (p.tone * widthLevels + w) * alphaLevels + a;

            // A subtle bright dot at the head of foreground particles
            if (p.depth === 2 && (p.glow > 0.1 || Math.random() < 0.12)) {
                dotKeys[i] = Math.round((alpha * 0.75) / alphaStep);
            }
        }

        // Additive blending gives a soft glow where currents overlap. It is
        // also order-independent, so batching does not change the result.
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        const lineCounts = this.lineCounts;
        const lineOrder = this.lineOrder;
        this.sortByKey(lineKeys, n, lineCounts, lineOrder);
        let start = 0;
        for (let k = 0; k < lineCounts.length - 1; k++) {
            const end = lineCounts[k];
            if (end === start) continue;

            const a = k % alphaLevels;
            const toneWidth = (k - a) / alphaLevels;
            const w = toneWidth % widthLevels;
            const tone = (toneWidth - w) / widthLevels;

            ctx.strokeStyle = this.strokeStyles[tone * alphaLevels + a];
            ctx.lineWidth = w * widthStep;
            ctx.beginPath();
            for (let j = start; j < end; j++) {
                const p = particles[lineOrder[j]];
                ctx.moveTo(p.px, p.py);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            start = end;
        }

        const dotCounts = this.dotCounts;
        const dotOrder = this.dotOrder;
        this.sortByKey(dotKeys, n, dotCounts, dotOrder);
        start = 0;
        for (let a = 0; a < dotCounts.length - 1; a++) {
            const end = dotCounts[a];
            if (end === start) continue;

            if (a > 0) {
                ctx.fillStyle = this.dotStyles[a];
                ctx.beginPath();
                for (let j = start; j < end; j++) {
                    const p = particles[dotOrder[j]];
                    const r = p.width * 0.75;
                    ctx.moveTo(p.x + r, p.y);
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            start = end;
        }
    }

    drawSparks() {
        if (!this.sparks.length) return;
        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'lighter';

        for (const s of this.sparks) {
            const lifeRatio = 1 - s.life / s.maxLife;
            const alpha = (s.alpha * lifeRatio * lifeRatio).toFixed(3);
            if (alpha <= 0) continue;

            ctx.strokeStyle = `rgba(${s.rgb}, ${alpha})`;
            ctx.lineWidth = s.size * lifeRatio;
            ctx.beginPath();
            ctx.moveTo(s.px, s.py);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
        }
    }

    step(withFade) {
        if (withFade) this.fade();
        this.updateSparks();
        this.updateParticles();
        this.drawParticles();
        this.drawSparks();
        this.time += this.config.timeDrift;
    }

    warmup(steps) {
        for (let i = 0; i < steps; i++) {
            this.step(false);
        }
    }

    animate(now = performance.now()) {
        this.rafId = requestAnimationFrame((t) => this.animate(t));

        // Cap at ~60 fps; keep the remainder so 120/144 Hz average out to 60.
        const elapsed = now - this.lastFrame;
        if (elapsed < this.frameInterval * 0.9) return;
        this.lastFrame = now - (elapsed % this.frameInterval);

        this.step(true);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Keep this query in sync with the static backdrop in css/matrix.css.
    const staticBackground = window.matchMedia(
        '(max-width: 1024px), (pointer: coarse), (prefers-reduced-motion: reduce)'
    );
    let background = null;

    function updateBackground() {
        if (staticBackground.matches) {
            if (background) background.destroy();
            background = null;
        } else if (!background) {
            background = new FlowFieldBackground();
            if (document.hidden) background.stop();
        }
    }

    staticBackground.addEventListener('change', updateBackground);
    updateBackground();
});
