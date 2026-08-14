document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menuBtn');
  const mobilePanel = document.getElementById('mobilePanel');
  if (menuBtn && mobilePanel) {
    menuBtn.addEventListener('click', () => {
      mobilePanel.classList.toggle('open');
    });
    mobilePanel.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => mobilePanel.classList.remove('open'));
    });
  }

  const header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 8) {
        header.classList.add('bg-black/70', 'backdrop-blur-md', 'border-white/10');
      } else {
        header.classList.remove('bg-black/70', 'backdrop-blur-md', 'border-white/10');
      }
    });
  }

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-up');
        entry.target.style.opacity = 1;
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => { el.style.opacity = 0; io.observe(el); });
});
