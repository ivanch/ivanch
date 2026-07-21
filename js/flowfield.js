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
        this.pulses = [];
        this.mouse = { x: 0, y: 0, active: false };
        this.rafId = null;
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.width = 0;
        this.height = 0;
        this.dpr = 1;

        // Random phase so each visit opens on a different current.
        this.time = Math.random() * 4000;

        this.config = {
            baseSpeed: 0.75,
            maxSpeed: 2.4,       // velocity cap so ripples can't fling streaks
            steer: 0.055,        // how fast particles align with the field
            fieldScale: 0.0016,  // noise zoom: small value = large, calm features
            warpStrength: 150,   // px of domain warp, keeps the flow organic
            winding: 2.4,        // field angle range multiplier (x PI)
            timeDrift: 0.00028,  // slow evolution of the whole field
            fadeAlpha: 0.035,    // trail persistence (lower = longer trails)
            mouseRadius: 160,
            mouseSwirl: 0.5,     // tangential push around the cursor
            mousePull: 0.06,     // whisper of inward pull -> orbiting feel
            glowBoost: 0.2,      // extra alpha for particles near the cursor
            maxPulses: 4,
            pulseSpeed: 3.4,
            pulseRadius: 280,
            pulseBand: 46,       // px band around the ring that pushes particles
            pulseStrength: 0.55,
            life: { min: 260, max: 900 } // frames before a particle respawns
        };

        // Mostly near-white hairlines, with a few accent-tinted currents
        // sampled from the site palette (cyan / indigo / violet).
        this.palette = [
            { weight: 0.62, rgb: '206, 224, 255', alpha: 0.125 },
            { weight: 0.14, rgb: '79, 195, 247', alpha: 0.22 },
            { weight: 0.12, rgb: '102, 126, 234', alpha: 0.115 },
            { weight: 0.12, rgb: '146, 103, 197', alpha: 0.115 }
        ];

        this.init();
    }

    init() {
        this.bindEvents();
        this.handleResize();

        if (this.prefersReducedMotion) {
            // Single long-exposure render; no animation loop at all.
            this.warmup(180);
            return;
        }

        // Pre-run a short exposure so the first paint is already textured.
        this.warmup(60);
        this.animate();
    }

    bindEvents() {
        // The canvas has pointer-events: none, so listen on window.
        window.addEventListener('pointermove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        }, { passive: true });

        window.addEventListener('pointerdown', (e) => {
            this.spawnPulse(e.clientX, e.clientY);
        }, { passive: true });

        window.addEventListener('pointerout', () => {
            this.mouse.active = false;
        });

        // Pause the rAF loop when the tab is hidden to save CPU / battery.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else if (!this.prefersReducedMotion) {
                this.start();
            }
        });

        let resizeRaf = null;
        window.addEventListener('resize', () => {
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => this.handleResize());
        });
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

    handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Mobile browsers fire resize on scroll when the URL bar collapses;
        // only react to real geometry changes to avoid canvas flicker.
        if (this.width && w === this.width && Math.abs(h - this.height) < 150) return;

        this.width = w;
        this.height = h;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Density scales with area, clamped for both phones and ultrawides.
        const count = Math.round(Math.min(Math.max((w * h) / 2600, 160), 650));
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle());
        }

        // Repaint a short exposure so a resize never flashes an empty canvas.
        this.warmup(30);
    }

    pickTone() {
        let roll = Math.random();
        for (const tone of this.palette) {
            roll -= tone.weight;
            if (roll <= 0) return tone;
        }
        return this.palette[0];
    }

    createParticle() {
        const tone = this.pickTone();
        const { min, max } = this.config.life;
        return {
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            px: 0,
            py: 0,
            vx: 0,
            vy: 0,
            speed: this.config.baseSpeed * (0.7 + Math.random() * 0.6),
            width: 0.7 + Math.random() * 0.6,
            rgb: tone.rgb,
            alpha: tone.alpha * (0.7 + Math.random() * 0.6),
            glow: 0,
            life: 0,
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

    spawnPulse(x, y) {
        if (this.pulses.length >= this.config.maxPulses) this.pulses.shift();
        this.pulses.push({ x, y, r: 0 });
    }

    updateParticles() {
        const { fieldScale, warpStrength, winding, steer, maxSpeed } = this.config;
        const t = this.time;
        const m = this.mouse;
        const radius = this.config.mouseRadius;
        const radiusSq = radius * radius;

        for (const p of this.particles) {
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

            // Click / tap ripples shove particles radially outward.
            for (const pulse of this.pulses) {
                const dx = p.x - pulse.x;
                const dy = p.y - pulse.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const offset = Math.abs(dist - pulse.r);
                if (offset < this.config.pulseBand) {
                    const push = (1 - offset / this.config.pulseBand) * this.config.pulseStrength;
                    p.vx += (dx / dist) * push;
                    p.vy += (dy / dist) * push;
                }
            }

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

    updatePulses() {
        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const pulse = this.pulses[i];
            pulse.r += this.config.pulseSpeed;
            if (pulse.r > this.config.pulseRadius) this.pulses.splice(i, 1);
        }
    }

    fade() {
        // Erase a fraction of the previous frame towards transparency so
        // the CSS backdrop behind the canvas keeps showing through.
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.config.fadeAlpha})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawParticles() {
        const ctx = this.ctx;
        // Additive blending gives a soft glow where currents overlap.
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        for (const p of this.particles) {
            if (p.fresh) {
                p.fresh = false;
                continue;
            }
            const alpha = Math.min(1, p.alpha + p.glow * this.config.glowBoost);
            ctx.strokeStyle = `rgba(${p.rgb}, ${alpha.toFixed(3)})`;
            ctx.lineWidth = p.width;
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
    }

    drawPulses() {
        if (!this.pulses.length) return;
        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1;
        for (const pulse of this.pulses) {
            const fadeOut = 1 - pulse.r / this.config.pulseRadius;
            ctx.strokeStyle = `rgba(79, 195, 247, ${(fadeOut * 0.45).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    step(withFade) {
        if (withFade) this.fade();
        this.updatePulses();
        this.updateParticles();
        this.drawParticles();
        this.drawPulses();
        this.time += this.config.timeDrift;
    }

    warmup(steps) {
        for (let i = 0; i < steps; i++) {
            this.step(false);
        }
    }

    animate() {
        this.step(true);
        this.rafId = requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FlowFieldBackground();
});
