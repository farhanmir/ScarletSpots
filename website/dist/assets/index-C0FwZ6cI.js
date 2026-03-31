(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})(),document.querySelector(`#app`).innerHTML=`
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
`;var e=()=>{let e=document.querySelectorAll(`.feature-card`),t=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.style.opacity=`1`,e.target.style.transform=`translateY(0)`,t.unobserve(e.target))})},{threshold:.1});e.forEach((e,n)=>{e.style.opacity=`0`,e.style.transform=`translateY(20px)`,e.style.transitionDelay=`${n*.1}s`,t.observe(e)});let n=document.getElementById(`cta-btn`);n.addEventListener(`click`,()=>{n.style.transform=`scale(0.95)`,setTimeout(()=>{n.style.transform=`translateY(-2px)`},150)})};document.addEventListener(`DOMContentLoaded`,e),e();