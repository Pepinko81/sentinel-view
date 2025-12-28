/**
 * Keynote Animated Canvas Background
 * Creates moving gradient and particle effects
 */

export function initKeynoteCanvas() {
  const canvas = document.getElementById('keynote-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Animation state
  let time = 0;
  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
  }> = [];

  // Create particles
  for (let i = 0; i < 30; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.3 + 0.1,
    });
  }

  function animate() {
    time += 0.01;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw animated gradient background
    const gradient1 = ctx.createLinearGradient(
      Math.sin(time) * 200 + canvas.width / 2,
      Math.cos(time) * 200 + canvas.height / 2,
      Math.sin(time + Math.PI) * 200 + canvas.width / 2,
      Math.cos(time + Math.PI) * 200 + canvas.height / 2
    );
    gradient1.addColorStop(0, 'rgba(7, 17, 30, 0.8)');
    gradient1.addColorStop(0.5, 'rgba(14, 27, 46, 0.6)');
    gradient1.addColorStop(1, 'rgba(58, 240, 255, 0.1)');

    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw radial gradient overlay
    const gradient2 = ctx.createRadialGradient(
      canvas.width * 0.3 + Math.sin(time * 0.5) * 100,
      canvas.height * 0.3 + Math.cos(time * 0.5) * 100,
      0,
      canvas.width * 0.3 + Math.sin(time * 0.5) * 100,
      canvas.height * 0.3 + Math.cos(time * 0.5) * 100,
      canvas.width * 0.8
    );
    gradient2.addColorStop(0, 'rgba(58, 240, 255, 0.15)');
    gradient2.addColorStop(0.5, 'rgba(138, 43, 226, 0.1)');
    gradient2.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Wrap around edges
      if (particle.x < 0) particle.x = canvas.width;
      if (particle.x > canvas.width) particle.x = 0;
      if (particle.y < 0) particle.y = canvas.height;
      if (particle.y > canvas.height) particle.y = 0;

      // Draw particle
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(58, 240, 255, ${particle.opacity * (0.5 + Math.sin(time + particle.x) * 0.5)})`;
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }

  animate();
}

