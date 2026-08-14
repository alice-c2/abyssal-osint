/* ---------------------------------------------------------
   Red particle network background + mouse-follow red glow.
   Pure canvas / DOM, no external dependencies.
--------------------------------------------------------- */
(function () {
  const canvas = document.getElementById('particles-bg');
  const glow = document.getElementById('mouse-glow');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w, h, particles = [];

  const PARTICLE_COLOR = '220,38,38';   // red-600
  const LINE_COLOR = '239,68,68';       // red-500
  const LINK_DIST = 140;
  const MOUSE_DIST = 160;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mouse = { x: -9999, y: -9999, active: false };
  const glowPos = { x: -9999, y: -9999 };

  function count() {
    const area = w * h;
    return Math.min(110, Math.max(35, Math.round(area / 16000)));
  }

  function resize() {
    w = canvas.offsetWidth = window.innerWidth;
    h = canvas.offsetHeight = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = count();
    if (particles.length === 0) {
      particles = Array.from({ length: target }, makeParticle);
    } else if (particles.length < target) {
      while (particles.length < target) particles.push(makeParticle());
    } else if (particles.length > target) {
      particles.length = target;
    }
  }

  function makeParticle() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.4 + 0.6,
    };
  }

  function step() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x));
      p.y = Math.max(0, Math.min(h, p.y));

      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < MOUSE_DIST) {
          const force = (MOUSE_DIST - d) / MOUSE_DIST;
          p.x += (dx / d) * force * 0.6;
          p.y += (dy / d) * force * 0.6;
        }
      }

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST) {
          ctx.strokeStyle = `rgba(${LINE_COLOR},${(1 - d / LINK_DIST) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }

      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < MOUSE_DIST) {
          ctx.strokeStyle = `rgba(${LINE_COLOR},${(1 - d / MOUSE_DIST) * 0.45})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${PARTICLE_COLOR},0.85)`;
      ctx.shadowColor = 'rgba(239,68,68,0.8)';
      ctx.shadowBlur = 4;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (!reduceMotion) requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    glowPos.x = e.clientX;
    glowPos.y = e.clientY;
    if (glow) {
      glow.style.opacity = '1';
      glow.style.transform = `translate3d(${glowPos.x}px, ${glowPos.y}px, 0) translate(-50%, -50%)`;
    }
  });
  window.addEventListener('mouseleave', () => {
    mouse.active = false;
    if (glow) glow.style.opacity = '0';
  });

  resize();
  if (reduceMotion) {
    step(); // draw a single static frame
  } else {
    requestAnimationFrame(step);
  }
})();
