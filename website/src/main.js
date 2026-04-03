import './style.css'

/**
 * ScarletSpots Landing Page - Premium Interactive Experience
 * Features: Scroll animations, FAQ accordion, form handling, and smooth interactions
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations()
  initFAQAccordion()
  initFormHandling()
  initSmoothInteractions()
})

// ============================================================================
// SCROLL ANIMATIONS WITH INTERSECTION OBSERVER
// ============================================================================

function initScrollAnimations() {
  const revealElements = document.querySelectorAll('.reveal-element')

  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger animation for multiple elements
        setTimeout(() => {
          entry.target.classList.add('in-view')
        }, index * 50)

        observer.unobserve(entry.target)
      }
    })
  }, observerOptions)

  revealElements.forEach((element) => {
    observer.observe(element)
  })
}

// ============================================================================
// FAQ ACCORDION FUNCTIONALITY
// ============================================================================

function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item')

  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question')

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active')

      // Close all other items
      faqItems.forEach((otherItem) => {
        if (otherItem !== item) {
          otherItem.classList.remove('active')
        }
      })

      // Toggle current item
      if (isActive) {
        item.classList.remove('active')
      } else {
        item.classList.add('active')
      }
    })
  })

  // Close FAQ when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.faq-container')) {
      faqItems.forEach((item) => {
        item.classList.remove('active')
      })
    }
  })
}

// ============================================================================
// FORM HANDLING
// ============================================================================

function initFormHandling() {
  const form = document.getElementById('waitlist-form')

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()

      const formData = new FormData(form)
      const email = formData.get('email') || form.querySelector('input[type="email"]').value
      const university = formData.get('university') || form.querySelectorAll('input[type="text"]')[1].value

      // Validate email
      if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error')
        return
      }

      if (!university.trim()) {
        showNotification('Please enter your university name', 'error')
        return
      }

      // Simulate form submission
      const submitButton = form.querySelector('button[type="submit"]')
      const originalText = submitButton.textContent

      submitButton.textContent = 'Joining...'
      submitButton.disabled = true

      setTimeout(() => {
        submitButton.textContent = '✓ Added to waitlist!'
        showNotification(`Thanks for joining! We'll notify you when ScarletSpots arrives at ${university}.`, 'success')

        // Reset form
        form.reset()

        // Restore button after 3 seconds
        setTimeout(() => {
          submitButton.textContent = originalText
          submitButton.disabled = false
        }, 3000)
      }, 1000)
    })
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function showNotification(message, type = 'info') {
  // Create notification element with map-themed styling
  const notification = document.createElement('div')
  notification.innerHTML = `<span style="margin-right: 8px;">${type === 'success' ? '📍' : type === 'error' ? '⚠️' : '🧭'}</span>${message}`
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background: ${type === 'success' ? '#3d8c40' : type === 'error' ? '#ef4444' : '#4285f4'};
    color: white;
    border-radius: 12px;
    font-weight: 600;
    z-index: 9999;
    animation: slideUp 300ms ease-out forwards;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    max-width: 320px;
    display: flex;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
  `

  document.body.appendChild(notification)

  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideDown 300ms ease-out forwards'
    setTimeout(() => {
      notification.remove()
    }, 300)
  }, 4000)
}

// ============================================================================
// SMOOTH INTERACTIONS
// ============================================================================

function initSmoothInteractions() {
  // Button hover effects
  const buttons = document.querySelectorAll('.btn')
  buttons.forEach((button) => {
    button.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)'
    })

    button.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0)'
    })
  })

  // Smooth scroll for navigation links
  const navLinks = document.querySelectorAll('.nav-link')
  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href')

      if (href.startsWith('#')) {
        e.preventDefault()

        const targetId = href.substring(1)
        const targetElement = document.getElementById(targetId)

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          })
        }
      }
    })
  })

  // Device mockup hover effect
  const deviceMockup = document.querySelector('.device-placeholder')
  if (deviceMockup) {
    deviceMockup.addEventListener('mousemove', (e) => {
      const rect = deviceMockup.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const centerX = rect.width / 2
      const centerY = rect.height / 2

      const rotateX = (y - centerY) / 10
      const rotateY = (centerX - x) / 10

      deviceMockup.style.transform = `
        translateY(-8px) 
        scale(1.02) 
        rotateX(${rotateX}deg) 
        rotateY(${rotateY}deg)
      `
      deviceMockup.style.transformStyle = 'preserve-3d'
    })

    deviceMockup.addEventListener('mouseleave', () => {
      deviceMockup.style.transform = 'translateY(0) scale(1) rotateX(0) rotateY(0)'
    })
  }

  // CTA button glow effect - map-themed blue glow
  const glowButton = document.querySelector('.glow-button')
  if (glowButton) {
    glowButton.addEventListener('mouseenter', function () {
      this.style.boxShadow = `
        0 0 30px rgba(66, 133, 244, 0.6), 
        0 0 60px rgba(66, 133, 244, 0.4),
        inset 0 0 20px rgba(66, 133, 244, 0.2)
      `
    })

    glowButton.addEventListener('mouseleave', function () {
      this.style.boxShadow = '0 4px 15px rgba(66, 133, 244, 0.4)'
    })
  }
}

// ============================================================================
// PARALLAX EFFECT FOR GLOW ELEMENTS (OPTIONAL)
// ============================================================================

function initParallax() {
  window.addEventListener('scroll', () => {
    const glows = document.querySelectorAll('.glow')

    glows.forEach((glow) => {
      const rect = glow.getBoundingClientRect()
      const speed = 0.5
      glow.style.transform = `translateY(${window.scrollY * speed}px)`
    })
  })
}

// Initialize parallax if needed
// initParallax()

// ============================================================================
// HMR SUPPORT FOR VITE
// ============================================================================

if (import.meta.hot) {
  import.meta.hot.accept()
}
