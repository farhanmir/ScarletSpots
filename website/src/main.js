import './style.css'

document.querySelector('#app').innerHTML = `
  <nav>
    <div class="logo">
      <div class="logo-dot"></div>
      ScarletSpots
    </div>
    <div class="actions">
      <a href="#" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.875rem;">Login</a>
    </div>
  </nav>

  <main class="hero">
    <h1>Intelligent <span>Auto-Parking</span></h1>
    <p>
      Seamlessly find, reserve, and park in available spots using our AI-driven real-time predictive modeling. 
      The future of campus navigation is here.
    </p>
    
    <div class="actions">
      <button class="btn btn-primary" id="cta-btn">Get Started</button>
      <button class="btn btn-secondary">Read Docs</button>
    </div>
  </main>

  <section class="features">
    <div class="feature-card">
      <div class="feature-icon">🎯</div>
      <h3>Real-Time Spot Detection</h3>
      <p>Our computer vision models instantly analyze lot density and camera feeds to guide you right to the open space.</p>
    </div>
    
    <div class="feature-card">
      <div class="feature-icon">⚡</div>
      <h3>Microsecond Latency</h3>
      <p>Powered by a monolithic architecture shifting to a high-throughput edge network, ensuring your data is always live.</p>
    </div>
    
    <div class="feature-card">
      <div class="feature-icon">🔒</div>
      <h3>Secure Reservations</h3>
      <p>Reserve spots securely with encrypted geo-fencing tokens to ensure your parking space is waiting when you arrive.</p>
    </div>
  </section>

  <footer>
    <p>&copy; 2026 ScarletSpots Inc. Architected for scale.</p>
  </footer>
`

// Micro-interactions and simple interactivity
const setupInteractions = () => {
  const cards = document.querySelectorAll('.feature-card');
  
  // Simple intersection observer for scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach((card, index) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transitionDelay = `${index * 0.1}s`;
    observer.observe(card);
  });
  
  // Button click effect
  const btn = document.getElementById('cta-btn');
  btn.addEventListener('click', () => {
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btn.style.transform = 'translateY(-2px)';
    }, 150);
  });
};

document.addEventListener('DOMContentLoaded', setupInteractions);
// For Vite HMR
setupInteractions();
