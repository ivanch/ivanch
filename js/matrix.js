class MatrixBackground {
    constructor() {
        this.canvas = document.getElementById('matrixCanvas');
        this.dots = [];
        this.connections = [];
        this.config = {
            dotCount: 50,
            dotSpeed: 0.2, // pixels per frame
            connectionDuration: { min: 2000, max: 6000 }, // milliseconds
            connectionChance: 0.0002, // chance per frame per dot pair
            maxConnections: 8, // maximum simultaneous connections
            dotSize: 3,
            colors: {
                dotDefault: 'rgba(255, 255, 255, 0.8)',
                dotDefaultGlow: 'rgba(255, 255, 255, 0.4)',
                dotConnected: 'rgba(100, 149, 237, 0.8)',
                dotConnectedGlow: 'rgba(100, 149, 237, 0.6)',
                connection: {
                    start: 'rgba(100, 149, 237, 0)',
                    middle: 'rgba(138, 43, 226, 0.8)',
                    end: 'rgba(100, 149, 237, 0)'
                }
            }
        };
        
        this.init();
    }

    init() {
        this.createDots();
        this.animate();
        this.handleResize();
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        // Recreate dots with new screen dimensions
        // Clear previous DOM elements to avoid orphan/sticky dots
        this.clearCanvas();
        this.createDots();
    }

    clearCanvas() {
        // Remove all dot and connection elements from the canvas
        try {
            while (this.canvas.firstChild) {
                this.canvas.removeChild(this.canvas.firstChild);
            }
        } catch (e) {
            // ignore
        }
        // Reset arrays
        this.dots = [];
        this.connections = [];
    }

    createDots() {
        this.dots = [];
        for (let i = 0; i < this.config.dotCount; i++) {
            this.createDot();
        }
    }

    createDot() {
        const dot = document.createElement('div');
        dot.className = 'matrix-dot';
        
        // Random starting position within screen bounds
        const startX = Math.random() * (window.innerWidth - 20) + 10;
        const startY = Math.random() * (window.innerHeight - 20) + 10;
        
        // Random movement direction (flying in all directions)
        let velocityX = 0, velocityY = 0;
        let attempts = 0;
        while ((Math.abs(velocityX) < 0.15 || Math.abs(velocityY) < 0.15) && attempts < 10) {
            const angle = Math.random() * Math.PI * 2;
            const speed = this.config.dotSpeed * (0.8 + Math.random() * 0.4); // Ensure minimum speed
            velocityX = Math.cos(angle) * speed;
            velocityY = Math.sin(angle) * speed;
            attempts++;
        }
        // Final fallback if still too low
        if (Math.abs(velocityX) < 0.15) velocityX = velocityX < 0 ? -0.15 : 0.15;
        if (Math.abs(velocityY) < 0.15) velocityY = velocityY < 0 ? -0.15 : 0.15;
        const dotData = {
            element: dot,
            x: startX,
            y: startY,
            vx: velocityX,
            vy: velocityY,
            opacity: Math.random() * 0.3 + 0.7,
            size: this.config.dotSize + Math.random() * 2,
            isConnected: false,
            connectionCount: 0,
            stuckFrames: 0 // Track how long dot is stuck
        };

        // Set initial styles (white by default)
        dot.style.left = startX + 'px';
        dot.style.top = startY + 'px';
        dot.style.width = dotData.size + 'px';
        dot.style.height = dotData.size + 'px';
        dot.style.opacity = dotData.opacity;
        dot.style.background = this.config.colors.dotDefault;
        dot.style.boxShadow = `0 0 6px ${this.config.colors.dotDefaultGlow}, 0 0 12px rgba(255, 255, 255, 0.2)`;
        
        this.canvas.appendChild(dot);
        this.dots.push(dotData);
    }

    updateDots() {
        this.dots.forEach((dot, index) => {
            // Update position
            dot.x += dot.vx;
            dot.y += dot.vy;

            // Track if dot is stuck (velocity very low for several frames)
            if (Math.abs(dot.vx) < 0.03 && Math.abs(dot.vy) < 0.03) {
                dot.stuckFrames = (dot.stuckFrames || 0) + 1;
            } else {
                dot.stuckFrames = 0;
            }
            // If stuck for more than 30 frames, give a strong nudge
            if (dot.stuckFrames > 30) {
                const angle = Math.random() * Math.PI * 2;
                const speed = this.config.dotSpeed * (0.8 + Math.random() * 0.4);
                dot.vx = Math.cos(angle) * speed;
                dot.vy = Math.sin(angle) * speed;
                dot.stuckFrames = 0;
            } else {
                // Prevent dots from getting stuck - add small random nudge if velocity is too low
                if (Math.abs(dot.vx) < 0.05) {
                    dot.vx += (Math.random() - 0.5) * 0.1;
                }
                if (Math.abs(dot.vy) < 0.05) {
                    dot.vy += (Math.random() - 0.5) * 0.1;
                }
            }

            // Bounce off screen edges (consider dot size so centers stay inside)
            const maxX = window.innerWidth - dot.size;
            const maxY = window.innerHeight - dot.size;
            if (dot.x <= 0 || dot.x >= maxX) {
                dot.vx = -dot.vx;
                dot.x = Math.max(0, Math.min(maxX, dot.x));
            }
            if (dot.y <= 0 || dot.y >= maxY) {
                dot.vy = -dot.vy;
                dot.y = Math.max(0, Math.min(maxY, dot.y));
            }

            // Update DOM element position (top-left)
            dot.element.style.left = dot.x + 'px';
            dot.element.style.top = dot.y + 'px';

            // Update dot color based on connection status
            if (dot.connectionCount > 0 && !dot.isConnected) {
                dot.isConnected = true;
                dot.element.style.background = this.config.colors.dotConnected;
                dot.element.style.boxShadow = `0 0 6px ${this.config.colors.dotConnectedGlow}, 0 0 12px rgba(100, 149, 237, 0.3)`;
            } else if (dot.connectionCount === 0 && dot.isConnected) {
                dot.isConnected = false;
                dot.element.style.background = this.config.colors.dotDefault;
                dot.element.style.boxShadow = `0 0 6px ${this.config.colors.dotDefaultGlow}, 0 0 12px rgba(255, 255, 255, 0.2)`;
            }
        });
    }

    createConnection(dot1, dot2) {
        if (this.connections.length >= this.config.maxConnections) {
            return;
        }

        const connection = document.createElement('div');
        connection.className = 'connection-line';
        
    // Calculate center positions of dots
    const dot1Rect = dot1.element.getBoundingClientRect();
    const dot2Rect = dot2.element.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const dot1CenterX = dot1Rect.left - canvasRect.left + dot1Rect.width / 2;
    const dot1CenterY = dot1Rect.top - canvasRect.top + dot1Rect.height / 2;
    const dot2CenterX = dot2Rect.left - canvasRect.left + dot2Rect.width / 2;
    const dot2CenterY = dot2Rect.top - canvasRect.top + dot2Rect.height / 2;

    const dx = dot2CenterX - dot1CenterX;
    const dy = dot2CenterY - dot1CenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Position and style the connection line from center to center
    const lineHalf = 1;
    connection.style.left = Math.round(dot1CenterX) + 'px';
    connection.style.top = Math.round(dot1CenterY - lineHalf) + 'px';
    connection.style.width = Math.round(distance) + 'px';
    connection.style.transformOrigin = '0 50%';
    connection.style.transform = `rotate(${angle}deg)`;
        connection.style.background = `linear-gradient(90deg, 
            ${this.config.colors.connection.start} 0%, 
            ${this.config.colors.connection.middle} 50%, 
            ${this.config.colors.connection.end} 100%)`;
        
        this.canvas.appendChild(connection);
        
        // Fade in
        setTimeout(() => {
            connection.classList.add('active');
        }, 50);
        
        const connectionData = {
            element: connection,
            dot1: dot1,
            dot2: dot2,
            startTime: Date.now(),
            duration: Math.random() * (this.config.connectionDuration.max - this.config.connectionDuration.min) + this.config.connectionDuration.min
        };
        
        // Mark dots as connected
        dot1.connectionCount++;
        dot2.connectionCount++;
        
        this.connections.push(connectionData);
    }

    updateConnections() {
        this.connections.forEach((connection, index) => {
            const elapsed = Date.now() - connection.startTime;
            
            // Update connection position as dots move (using center positions)
            const dot1Rect = connection.dot1.element.getBoundingClientRect();
            const dot2Rect = connection.dot2.element.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            const dot1CenterX = dot1Rect.left - canvasRect.left + dot1Rect.width / 2;
            const dot1CenterY = dot1Rect.top - canvasRect.top + dot1Rect.height / 2;
            const dot2CenterX = dot2Rect.left - canvasRect.left + dot2Rect.width / 2;
            const dot2CenterY = dot2Rect.top - canvasRect.top + dot2Rect.height / 2;

            const dx = dot2CenterX - dot1CenterX;
            const dy = dot2CenterY - dot1CenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            const lineHalf = 1;
            connection.element.style.left = Math.round(dot1CenterX) + 'px';
            connection.element.style.top = Math.round(dot1CenterY - lineHalf) + 'px';
            connection.element.style.width = Math.round(distance) + 'px';
            connection.element.style.transformOrigin = '0 50%';
            connection.element.style.transform = `rotate(${angle}deg)`;
            
            // Remove expired connections
            if (elapsed > connection.duration) {
                connection.element.classList.remove('active');
                
                // Mark dots as no longer connected
                connection.dot1.connectionCount--;
                connection.dot2.connectionCount--;
                
                setTimeout(() => {
                    connection.element.remove();
                }, 500); // Wait for fade out
                this.connections.splice(index, 1);
            }
        });
    }

    tryCreateConnections() {
        // Randomly try to create connections between nearby dots
        for (let i = 0; i < this.dots.length; i++) {
            for (let j = i + 1; j < this.dots.length; j++) {
                if (Math.random() < this.config.connectionChance) {
                    const dot1 = this.dots[i];
                    const dot2 = this.dots[j];
                    
                    // Calculate distance between dot centers
                    const dot1CenterX = dot1.x + dot1.size / 2;
                    const dot1CenterY = dot1.y + dot1.size / 2;
                    const dot2CenterX = dot2.x + dot2.size / 2;
                    const dot2CenterY = dot2.y + dot2.size / 2;
                    
                    const dx = dot2CenterX - dot1CenterX;
                    const dy = dot2CenterY - dot1CenterY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 150 && distance > 30) {
                        // Check if these dots are already connected
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
        this.updateDots();
        this.updateConnections();
        this.tryCreateConnections();
        
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize the matrix background when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MatrixBackground();
});
