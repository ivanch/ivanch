class MatrixBackground {
    constructor() {
        this.canvas = document.getElementById('matrixCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.dots = [];
        this.connections = [];
        this.mouse = { x: -9999, y: -9999, active: false };
        this.rafId = null;
        this.isRunning = true;
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.config = {
            dotCount: this.getMobileDotCount(),
            dotSpeed: 0.2,
            connectionDuration: { min: 2000, max: 6000 },
            connectionChance: 0.0002,
            maxConnections: this.getMobileMaxConnections(),
            dotSize: 3,
            mouseRadius: 110,
            mouseForce: 0.6,
            // Palette synced to the UI accent tokens
            colors: {
                dotDefault: 'rgba(230, 240, 255, 0.78)',
                dotDefaultGlow: 'rgba(180, 220, 255, 0.40)',
                dotConnected: 'rgba(120, 190, 245, 0.85)',
                dotConnectedGlow: 'rgba(79, 195, 247, 0.55)',
                connection: {
                    start: 'rgba(102, 126, 234, 0.22)',
                    middle: 'rgba(118, 75, 162, 0.62)',
                    end: 'rgba(79, 195, 247, 0.22)'
                }
            }
        };

        this.init();
    }

    getMobileDotCount() {
        if (window.innerWidth <= 480) return 35;
        if (window.innerWidth <= 768) return 45;
        if (window.innerWidth >= 2100) return 100;
        return 50;
    }

    getMobileMaxConnections() {
        if (window.innerWidth <= 480) return 4;
        if (window.innerWidth <= 768) return 6;
        return 8;
    }

    init() {
        this.handleResize();
        this.bindEvents();
        this.animate();
    }

    bindEvents() {
        // Pointer reactivity — push dots away from cursor for a "matrix repel" feel.
        // Touch devices are included; the dot pushes happen only while touched.
        window.addEventListener('pointermove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        }, { passive: true });

        window.addEventListener('pointerout', () => {
            this.mouse.active = false;
            this.mouse.x = -9999;
            this.mouse.y = -9999;
        });

        // Pause the rAF loop when the tab is hidden to save CPU / battery.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else {
                this.start();
            }
        });

        // Resize is debounced via rAF; disabled on mobile for perf parity with original.
        if (window.innerWidth > 768) {
            let resizeRaf = null;
            window.addEventListener('resize', () => {
                if (resizeRaf) cancelAnimationFrame(resizeRaf);
                resizeRaf = requestAnimationFrame(() => this.handleResize());
            });
        }
    }

    start() {
        if (this.rafId || !this.isRunning) return;
        this.animate();
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.config.dotCount = this.getMobileDotCount();
        this.config.maxConnections = this.getMobileMaxConnections();
        this.createDots();
    }

    createDots() {
        this.dots = [];
        for (let i = 0; i < this.config.dotCount; i++) {
            this.createDot();
        }
    }

    createDot() {
        const startX = Math.random() * (this.canvas.width - 20) + 10;
        const startY = Math.random() * (this.canvas.height - 20) + 10;

        const angle = Math.random() * Math.PI * 2;
        const speed = this.config.dotSpeed * (0.8 + Math.random() * 0.4);
        const baseVelocityX = Math.cos(angle) * speed;
        const baseVelocityY = Math.sin(angle) * speed;

        this.dots.push({
            x: startX,
            y: startY,
            vx: baseVelocityX,
            vy: baseVelocityY,
            baseVx: baseVelocityX,
            baseVy: baseVelocityY,
            wanderPhase: Math.random() * Math.PI * 2,
            wanderSpeed: 0.01 + Math.random() * 0.01,
            opacity: Math.random() * 0.3 + 0.7,
            size: this.config.dotSize + Math.random() * 2,
            connectionCount: 0
        });
    }

    updateDots() {
        const radius = this.config.mouseRadius;
        const radiusSq = radius * radius;
        const force = this.config.mouseForce;

        this.dots.forEach(dot => {
            // Mouse repulsion
            if (this.mouse.active) {
                const dx = dot.x - this.mouse.x;
                const dy = dot.y - this.mouse.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < radiusSq && distSq > 0.5) {
                    const dist = Math.sqrt(distSq);
                    const strength = (1 - dist / radius) * force;
                    dot.vx += (dx / dist) * strength;
                    dot.vy += (dy / dist) * strength;
                }
            }

            dot.x += dot.vx;
            dot.y += dot.vy;

            // Ease back to a gentle autonomous drift after pointer interaction.
            dot.wanderPhase += dot.wanderSpeed;
            const wanderX = Math.cos(dot.wanderPhase) * 0.03;
            const wanderY = Math.sin(dot.wanderPhase * 0.8) * 0.03;
            dot.vx += (dot.baseVx + wanderX - dot.vx) * 0.02;
            dot.vy += (dot.baseVy + wanderY - dot.vy) * 0.02;

            const maxX = this.canvas.width - dot.size;
            const maxY = this.canvas.height - dot.size;
            if (dot.x <= 0 || dot.x >= maxX) {
                dot.vx = -dot.vx;
                dot.x = Math.max(0, Math.min(maxX, dot.x));
            }
            if (dot.y <= 0 || dot.y >= maxY) {
                dot.vy = -dot.vy;
                dot.y = Math.max(0, Math.min(maxY, dot.y));
            }
        });
    }

    drawDots() {
        this.dots.forEach(dot => {
            const isConnected = dot.connectionCount > 0;
            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, dot.size / 2, 0, Math.PI * 2);
            this.ctx.fillStyle = isConnected ? this.config.colors.dotConnected : this.config.colors.dotDefault;
            this.ctx.globalAlpha = dot.opacity;
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = isConnected ? this.config.colors.dotConnectedGlow : this.config.colors.dotDefaultGlow;
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
    }

    createConnection(dot1, dot2) {
        if (this.connections.length >= this.config.maxConnections) return;

        dot1.connectionCount++;
        dot2.connectionCount++;

        this.connections.push({
            dot1: dot1,
            dot2: dot2,
            startTime: Date.now(),
            duration: Math.random() * (this.config.connectionDuration.max - this.config.connectionDuration.min) + this.config.connectionDuration.min
        });
    }

    updateConnections() {
        this.connections = this.connections.filter(conn => {
            const elapsed = Date.now() - conn.startTime;
            if (elapsed > conn.duration) {
                conn.dot1.connectionCount--;
                conn.dot2.connectionCount--;
                return false;
            }
            return true;
        });
    }

    drawConnections() {
        this.connections.forEach(conn => {
            const { dot1, dot2, startTime, duration } = conn;
            const elapsed = Date.now() - startTime;
            const opacity = Math.min(1, elapsed / 500);

            const gradient = this.ctx.createLinearGradient(dot1.x, dot1.y, dot2.x, dot2.y);
            gradient.addColorStop(0, this.config.colors.connection.start);
            gradient.addColorStop(0.5, this.config.colors.connection.middle);
            gradient.addColorStop(1, this.config.colors.connection.end);

            this.ctx.beginPath();
            this.ctx.moveTo(dot1.x, dot1.y);
            this.ctx.lineTo(dot2.x, dot2.y);

            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = opacity;

            const pulse = (Math.sin((elapsed / 2000) * Math.PI * 2) + 1) / 2;
            this.ctx.shadowBlur = 4 + pulse * 6;
            this.ctx.shadowColor = 'rgba(118, 75, 162, 0.5)';

            this.ctx.stroke();
        });
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
    }

    tryCreateConnections() {
        for (let i = 0; i < this.dots.length; i++) {
            for (let j = i + 1; j < this.dots.length; j++) {
                if (Math.random() < this.config.connectionChance) {
                    const dot1 = this.dots[i];
                    const dot2 = this.dots[j];

                    const dx = dot2.x - dot1.x;
                    const dy = dot2.y - dot1.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 150 && distance > 30) {
                        const alreadyConnected = this.connections.some(conn =>
                            (conn.dot1 === dot1 && conn.dot2 === dot2) ||
                            (conn.dot1 === dot2 && conn.dot2 === dot1)
                        );
                        if (!alreadyConnected) {
                            this.createConnection(dot1, dot2);
                        }
                    }
                }
            }
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.prefersReducedMotion) {
            this.updateDots();
            this.updateConnections();
            this.tryCreateConnections();
        }

        this.drawConnections();
        this.drawDots();

        this.rafId = requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MatrixBackground();
});
