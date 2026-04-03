import './style.css';

/* ================================================================
   NAVIGATION — scroll state
   ================================================================ */
const header = document.getElementById('site-header');
if (header) {
  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load
}

/* ================================================================
   SCROLL REVEAL — IntersectionObserver
   ================================================================ */

// Pre-calculate stagger delays so we don't query the DOM inside the callback.
const revealEls = Array.from(document.querySelectorAll('.reveal'));
revealEls.forEach((el) => {
  const siblings = el.parentElement
    ? Array.from(el.parentElement.querySelectorAll('.reveal'))
    : [el];
  const idx = siblings.indexOf(el);
  if (idx > 0) el.style.transitionDelay = `${idx * 0.08}s`;
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);

revealEls.forEach((el) => revealObserver.observe(el));

/* ================================================================
   FAQ ACCORDION
   ================================================================ */
const accordionItems = document.querySelectorAll('.accordion-item');

/**
 * Close an accordion item.
 * Uses a fallback timeout in case transitionend never fires
 * (e.g., when transitions are disabled or interrupted).
 */
function closeItem(item) {
  if (!item.classList.contains('open')) return;
  const trigger = item.querySelector('.accordion-trigger');
  const panel = item.querySelector('.accordion-panel');
  if (!trigger || !panel) return;

  item.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');
  panel.style.maxHeight = '';

  let settled = false;
  const hide = () => {
    if (settled) return;
    settled = true;
    panel.classList.remove('panel-open');
  };

  panel.addEventListener('transitionend', hide, { once: true });
  // Fallback: hide after transition duration + buffer (500 ms)
  setTimeout(hide, 500);
}

/**
 * Open an accordion item.
 */
function openItem(item) {
  const trigger = item.querySelector('.accordion-trigger');
  const panel = item.querySelector('.accordion-panel');
  if (!trigger || !panel) return;

  panel.classList.add('panel-open');
  // Force reflow so the max-height transition fires from 0
  panel.getBoundingClientRect();
  item.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  panel.style.maxHeight = panel.scrollHeight + 'px';
}

accordionItems.forEach((item) => {
  const trigger = item.querySelector('.accordion-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');

    // Close all other items first
    accordionItems.forEach((other) => {
      if (other !== item) closeItem(other);
    });

    if (isOpen) {
      closeItem(item);
    } else {
      openItem(item);
    }
  });
});

/* ================================================================
   WAITLIST FORM — basic feedback
   ================================================================ */
const form = document.getElementById('waitlist-form');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button[type="submit"]');
    if (!input || !btn) return;

    const email = input.value.trim();
    if (!email) return;

    btn.textContent = '✓ You\'re on the list!';
    btn.disabled = true;
    btn.style.opacity = '0.8';
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}
