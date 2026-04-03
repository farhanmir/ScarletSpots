import './style.css'

const revealElements = document.querySelectorAll('.reveal')
const faqTriggers = document.querySelectorAll('.faq-trigger')

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    })
  },
  {
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px',
  },
)

revealElements.forEach((element) => revealObserver.observe(element))

faqTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const isExpanded = trigger.getAttribute('aria-expanded') === 'true'
    const panelId = trigger.getAttribute('aria-controls')
    const panel = panelId ? document.getElementById(panelId) : null

    if (!panel) {
      return
    }

    trigger.setAttribute('aria-expanded', String(!isExpanded))
    panel.hidden = isExpanded
  })
})
