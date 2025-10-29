class MatrixBackground {
    constructor() {
        this.canvas = document.getElementById('matrixCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.dots = [];
        this.connections = [];
        this.config = {
            dotCount: this.getMobileDotCount(),
            dotSpeed: 0.2,
            connectionDuration: { min: 2000, max: 6000 },
            connectionChance: 0.0002,
            maxConnections: this.getMobileMaxConnections(),
            dotSize: 3,
            colors: {
                dotDefault: 'rgba(255, 255, 255, 0.8)',
                dotDefaultGlow: 'rgba(255, 255, 255, 0.4)',
                dotConnected: 'rgba(100, 149, 237, 0.8)',
                dotConnectedGlow: 'rgba(100, 149, 237, 0.6)',
                connection: {
                    start: 'rgba(100, 149, 237, 0.2)',
                    middle: 'rgba(138, 43, 226, 0.6)',
                    end: 'rgba(100, 149, 237, 0.2)'
                }
            }
        };

        this.init();
    }

    getMobileDotCount() {
        // Reduce dot count on mobile devices for better performance
        if (window.innerWidth <= 480) return 25;
        if (window.innerWidth <= 768) return 35;
        return 50;
    }

    getMobileMaxConnections() {
        // Reduce max connections on mobile devices for better performance
        if (window.innerWidth <= 480) return 4;
        if (window.innerWidth <= 768) return 6;
        return 8;
    }

    init() {
        this.handleResize();
        this.animate();

        // Prevent resizing for mobile performance reasons
        // window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Update mobile-specific configurations
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

        let velocityX = 0, velocityY = 0;
        let attempts = 0;
        while ((Math.abs(velocityX) < 0.15 || Math.abs(velocityY) < 0.15) && attempts < 10) {
            const angle = Math.random() * Math.PI * 2;
            const speed = this.config.dotSpeed * (0.8 + Math.random() * 0.4);
            velocityX = Math.cos(angle) * speed;
            velocityY = Math.sin(angle) * speed;
            attempts++;
        }
        if (Math.abs(velocityX) < 0.15) velocityX = velocityX < 0 ? -0.15 : 0.15;
        if (Math.abs(velocityY) < 0.15) velocityY = velocityY < 0 ? -0.15 : 0.15;

        this.dots.push({
            x: startX,
            y: startY,
            vx: velocityX,
            vy: velocityY,
            opacity: Math.random() * 0.3 + 0.7,
            size: this.config.dotSize + Math.random() * 2,
            connectionCount: 0,
            stuckFrames: 0
        });
    }

    updateDots() {
        this.dots.forEach(dot => {
            dot.x += dot.vx;
            dot.y += dot.vy;

            if (Math.abs(dot.vx) < 0.03 && Math.abs(dot.vy) < 0.03) {
                dot.stuckFrames++;
            } else {
                dot.stuckFrames = 0;
            }

            if (dot.stuckFrames > 30) {
                const angle = Math.random() * Math.PI * 2;
                const speed = this.config.dotSpeed * (0.8 + Math.random() * 0.4);
                dot.vx = Math.cos(angle) * speed;
                dot.vy = Math.sin(angle) * speed;
                dot.stuckFrames = 0;
            } else {
                if (Math.abs(dot.vx) < 0.05) dot.vx += (Math.random() - 0.5) * 0.1;
                if (Math.abs(dot.vy) < 0.05) dot.vy += (Math.random() - 0.5) * 0.1;
            }

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
            const opacity = Math.min(1, elapsed / 500); // Fade in

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

            // Pulsing effect
            const pulse = (Math.sin((elapsed / 2000) * Math.PI * 2) + 1) / 2; // 2-second pulse cycle
            this.ctx.shadowBlur = 4 + pulse * 6;
            this.ctx.shadowColor = 'rgba(138, 43, 226, 0.4)';

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

        this.updateDots();
        this.updateConnections();
        this.tryCreateConnections();

        this.drawConnections();
        this.drawDots();

        requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MatrixBackground();
});