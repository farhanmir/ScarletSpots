// @ts-nocheck
/* global __APP_VERSION__, __GIT_SHA__, __BUILD_TIME__ */

import { useState, useRef } from 'react'
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion'

/* ─── Design tokens ───────────────────────────────────────────────────── */
const SCARLET = '#e5373a'
const APP_STORE_URL = 'https://apps.apple.com'
const SUPPORT_EMAIL = 'support@scarletspots.app'

/* ─── Reusable animation presets ─────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1], delay },
  }),
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={styles.navbar}
    >
      <div style={styles.navInner} className="nav-inner">
        <div style={styles.logoWrapper}>
          <PinIcon size={20} />
          <span style={styles.logoText}>ScarletSpots</span>
        </div>
        <div style={styles.navLinks}>
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#faq">FAQ</NavLink>
          <DownloadBtn small />
        </div>
      </div>
    </motion.nav>
  )
}

function NavLink({ href, children }) {
  return (
    <motion.a
      href={href}
      style={styles.navLink}
      whileHover={{ color: '#fafafa' }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.a>
  )
}

function DownloadBtn({ small }) {
  return (
    <motion.a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...styles.downloadBtn,
        ...(small ? styles.downloadBtnSmall : {}),
      }}
      whileHover={{
        scale: 1.04,
        boxShadow: '0 0 28px rgba(229,55,58,0.45)',
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <AppleIcon size={small ? 14 : 18} />
      {small ? 'Download' : 'Download on the App Store'}
    </motion.a>
  )
}

/* ─── Hero ────────────────────────────────────────────────────────────── */
function Hero() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, 80])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  return (
    <section ref={ref} style={styles.hero} className="hero-grid">
      {/* Radial glow */}
      <div style={styles.heroGlow} aria-hidden="true" />

      <motion.div style={{ y, opacity }}>
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          style={styles.heroContent}
          className="hero-content"
        >
          {/* Eyebrow */}
          <motion.div variants={fadeUp} custom={0} style={styles.eyebrow}>
            <span style={styles.eyebrowDot} />
            Built for Rutgers students
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={fadeUp} custom={0.05} style={styles.heroTitle}>
            Campus parking,{' '}
            <span style={styles.scarletText}>finally</span>
            {' '}solved.
          </motion.h1>

          {/* Sub */}
          <motion.p variants={fadeUp} custom={0.1} style={styles.heroSub} className="hero-sub">
            See which lots have open spots right now. Find where your friends
            parked. Navigate back to your car — even offline.
          </motion.p>

          {/* CTA */}
          <motion.div variants={fadeUp} custom={0.15} style={styles.heroCta} className="hero-cta">
            <DownloadBtn />
            <span style={styles.ctaNote}>iOS · Free · No ads</span>
          </motion.div>

          {/* Stats */}
          <motion.div variants={fadeUp} custom={0.2} style={styles.statsRow} className="stats-row">
            {[
              { n: '245+', l: 'Lots mapped' },
              { n: 'Live', l: 'Occupancy data' },
              { n: '100%', l: 'Crowd-sourced' },
            ].map((s) => (
              <div key={s.l} style={styles.statItem}>
                <span style={styles.statNum}>{s.n}</span>
                <span style={styles.statLabel}>{s.l}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Visual — Phone mockup */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={styles.phoneWrapper}
      >
        <PhoneMockup />
      </motion.div>
    </section>
  )
}

/* ─── Features ────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <OccupancyIcon />,
    title: 'Real-time lot occupancy',
    body: 'Color-coded markers update live as students park and leave. Know before you drive.',
  },
  {
    icon: <FriendsIcon />,
    title: 'See where friends are parked',
    body: 'The Friends tab shows which lot each friend is parked at — without any location sharing.',
  },
  {
    icon: <OfflineIcon />,
    title: 'Works completely offline',
    body: "All 245 lot polygons are bundled in the app. The map loads instantly, no internet needed.",
  },
]

function FeatureCard({ icon, title, body, index }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      style={styles.featureCard}
    >
      <motion.div
        style={styles.featureIconWrap}
        whileHover={{ backgroundColor: 'rgba(229,55,58,0.18)' }}
        transition={{ duration: 0.2 }}
      >
        {icon}
      </motion.div>
      <h3 style={styles.featureTitle}>{title}</h3>
      <p style={styles.featureBody}>{body}</p>
    </motion.div>
  )
}

function Features() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="features" style={styles.section} className="section">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55 }}
        style={styles.sectionHeader}
      >
        <p style={styles.sectionEyebrow}>What it does</p>
        <h2 style={styles.sectionTitle}>Everything you need, nothing you don't.</h2>
      </motion.div>

      <div style={styles.featuresGrid}>
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} {...f} index={i} />
        ))}
      </div>
    </section>
  )
}

/* ─── How it works ────────────────────────────────────────────────────── */
const STEPS = [
  {
    num: '01',
    title: 'Sign in with your Rutgers email',
    body: "Only @rutgers.edu and @scarletmail.rutgers.edu accounts. That's it.",
  },
  {
    num: '02',
    title: 'Park — the app detects it automatically',
    body: "Precise geofencing detects when you've entered a lot. Your session starts, and the occupancy count goes up for everyone.",
  },
  {
    num: '03',
    title: 'Leave — occupancy updates in seconds',
    body: 'When you drive out, your session ends and the live count drops. Campus-wide updates happen via WebSocket, no polling.',
  },
]

function StepCard({ num, title, body, index }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.1 }}
      style={styles.step}
    >
      <span style={styles.stepNum}>{num}</span>
      <h3 style={styles.stepTitle}>{title}</h3>
      <p style={styles.stepBody}>{body}</p>
    </motion.div>
  )
}

function HowItWorks() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section style={{ ...styles.section, borderTop: '1px solid rgba(255,255,255,0.05)' }} className="section">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55 }}
        style={styles.sectionHeader}
      >
        <p style={styles.sectionEyebrow}>How it works</p>
        <h2 style={styles.sectionTitle}>Three steps. That&apos;s the whole app.</h2>
      </motion.div>

      <div style={styles.stepsGrid}>
        {STEPS.map((s, i) => (
          <StepCard key={s.num} num={s.num} title={s.title} body={s.body} index={i} />
        ))}
      </div>
    </section>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Does it work offline?',
    a: "Yes. Every lot's location, name, and polygon is bundled in the app. The map loads and the compass works with zero cell service. Live occupancy data needs a connection, but you can always find your car.",
  },
  {
    q: 'Is my location data private?',
    a: 'Friend visibility is lot-level only and always opt-in. ScarletSpots stores the lot you parked in and may store session coordinates needed for parked-car return and parking-session features.',
  },
  {
    q: 'Is ScarletSpots free?',
    a: 'Completely free. No ads, no premium tier, no data selling. It\'s built by Rutgers students, for Rutgers students.',
  },
]

function FAQItem({ q, a, i }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: i * 0.08 }}
      style={styles.faqItem}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={styles.faqQ}
        aria-expanded={open}
      >
        <span>{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25 }}
          style={styles.faqIcon}
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <p style={styles.faqA}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function FAQ() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="faq" style={{ ...styles.section, borderTop: '1px solid rgba(255,255,255,0.05)' }} className="section">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55 }}
        style={styles.sectionHeader}
      >
        <p style={styles.sectionEyebrow}>FAQ</p>
        <h2 style={styles.sectionTitle}>Quick answers.</h2>
      </motion.div>
      <div style={styles.faqList}>
        {FAQS.map((f, i) => <FAQItem key={f.q} {...f} i={i} />)}
      </div>
    </section>
  )
}

/* ─── CTA Banner ──────────────────────────────────────────────────────── */
function CTABanner() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section style={{ ...styles.section, borderTop: '1px solid rgba(255,255,255,0.05)' }} className="section">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={styles.ctaBanner}
      >
        <div style={styles.ctaBannerGlow} aria-hidden="true" />
        <PinIcon size={32} />
        <h2 style={styles.ctaBannerTitle}>Stop driving in circles.</h2>
        <p style={styles.ctaBannerSub}>
          Download ScarletSpots and see available parking lots before you leave the building.
        </p>
        <DownloadBtn />
        <p style={{ color: '#555', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          Rutgers University · iOS · Free
        </p>
      </motion.div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerInner} className="footer-inner">
        <div style={styles.footerBrand}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <PinIcon size={16} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>ScarletSpots</span>
          </div>
          <p style={styles.footerTagline}>Real-time parking for Rutgers. Always free.</p>
        </div>

        <div style={styles.footerCols} className="footer-cols">
          <div style={styles.footerCol}>
            <p style={styles.footerColHead}>App</p>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink} className="footer-link">Download for iOS</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.footerLink} className="footer-link">App Support</a>
          </div>
          <div style={styles.footerCol}>
            <p style={styles.footerColHead}>Legal</p>
            <a href="/privacy.html" style={styles.footerLink} className="footer-link">Privacy Policy</a>
            <a href="/terms.html" style={styles.footerLink} className="footer-link">Terms of Service</a>
          </div>
        </div>
      </div>
      <p style={styles.footerCopy}>© 2026 ScarletSpots</p>
    </footer>
  )
}

/* ─── Icon components ─────────────────────────────────────────────────── */
function PinIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill={SCARLET}
      />
      <circle cx="12" cy="9" r="2.5" fill="white" />
    </svg>
  )
}

function AppleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function OccupancyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={SCARLET} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function FriendsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={SCARLET} strokeWidth="1.8" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function OfflineIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={SCARLET} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={SCARLET} stroke="none" />
    </svg>
  )
}

/* ─── Phone mockup ────────────────────────────────────────────────────── */
function PhoneMockup() {
  return (
    <div style={styles.phone} aria-hidden="true" role="presentation">
      <div style={styles.phoneNotch} />
      {/* Simulated map screen */}
      <div style={styles.phoneScreen}>
        <div style={styles.mapBg}>
          {/* Grid */}
          <div style={styles.mapGrid} />
          {/* Lot markers */}
          {[
            { top: '30%', left: '35%', color: '#22c55e', label: '12 open' },
            { top: '52%', left: '55%', color: '#f59e0b', label: '3 open' },
            { top: '68%', left: '30%', color: '#e5373a', label: 'Full' },
          ].map((m, i) => (
            <motion.div
              key={i}
              style={{ ...styles.mapMarker, top: m.top, left: m.left }}
              animate={{ y: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 2.5 + i * 0.4, ease: 'easeInOut', delay: i * 0.5 }}
            >
              <div style={{ ...styles.markerDot, background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
              <div style={styles.markerLabel}>{m.label}</div>
            </motion.div>
          ))}
          {/* Session chip */}
          <div style={styles.sessionChip}>
            <span style={{ ...styles.sessionDot }} />
            Parked at Lot 68
          </div>
        </div>
        {/* Bottom bar */}
        <div style={styles.phoneBottomBar}>
          {['🗺', '🧭', '👥'].map((icon, i) => (
            <span key={i} style={{ fontSize: '1.2rem', opacity: i === 0 ? 1 : 0.4 }}>{icon}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────────── */
const styles = {
  navbar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(13,13,13,0.8)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  navInner: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 2rem',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 700,
    fontSize: '1.05rem',
    letterSpacing: '-0.01em',
  },
  logoText: { color: '#fafafa' },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  navLink: {
    color: '#888',
    fontSize: '0.9rem',
    fontWeight: 500,
    transition: 'color 0.15s',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#e5373a',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.95rem',
    padding: '0.65rem 1.4rem',
    borderRadius: 10,
    letterSpacing: '-0.01em',
    boxShadow: '0 0 18px rgba(229,55,58,0.3)',
  },
  downloadBtnSmall: {
    fontSize: '0.82rem',
    padding: '0.5rem 1rem',
    borderRadius: 8,
    boxShadow: 'none',
  },

  /* Hero */
  hero: {
    minHeight: '100vh',
    maxWidth: 1100,
    margin: '0 auto',
    padding: '7rem 2rem 5rem',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4rem',
    alignItems: 'center',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: '10%',
    left: '-10%',
    width: 600,
    height: 600,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(229,55,58,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
    eyebrowDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#e5373a',
    boxShadow: '0 0 8px #e5373a',
  },
  heroTitle: {
    fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.03em',
    color: '#fafafa',
  },
  scarletText: {
    color: '#e5373a',
    fontStyle: 'italic',
  },
  heroSub: {
    fontSize: '1.05rem',
    lineHeight: 1.7,
    color: '#888',
    maxWidth: 480,
  },
  heroCta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    flexWrap: 'wrap',
  },
  ctaNote: {
    fontSize: '0.8rem',
    color: '#555',
    fontWeight: 500,
  },
  statsRow: {
    display: 'flex',
    gap: '2rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    flexWrap: 'wrap',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  statNum: {
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: '#fafafa',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#555',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  phoneWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },

  /* Phone mockup */
  phone: {
    width: 270,
    background: '#141414',
    borderRadius: 36,
    border: '1px solid rgba(255,255,255,0.1)',
    padding: 12,
    boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), 0 0 60px rgba(229,55,58,0.08)',
    position: 'relative',
  },
  phoneNotch: {
    width: 80,
    height: 6,
    background: '#222',
    borderRadius: 4,
    margin: '0 auto 10px',
  },
  phoneScreen: {
    background: '#0d0d0d',
    borderRadius: 24,
    overflow: 'hidden',
    height: 440,
    display: 'flex',
    flexDirection: 'column',
  },
  mapBg: {
    flex: 1,
    position: 'relative',
    background: '#111',
    overflow: 'hidden',
  },
  mapGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
    backgroundSize: '28px 28px',
  },
  mapMarker: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transform: 'translate(-50%, -50%)',
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
  },
  markerLabel: {
    background: 'rgba(20,20,20,0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fafafa',
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  },
  sessionChip: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(20,20,20,0.95)',
    border: '1px solid rgba(229,55,58,0.3)',
    color: '#fafafa',
    fontSize: 10,
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  },
  sessionDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#e5373a',
    boxShadow: '0 0 6px #e5373a',
  },
  phoneBottomBar: {
    height: 52,
    background: '#141414',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '0 1rem',
  },

  /* Sections */
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '6rem 2rem',
  },
  sectionHeader: {
    marginBottom: '3.5rem',
  },
  sectionEyebrow: {
    fontSize: '0.78rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#e5373a',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: '#fafafa',
    maxWidth: 600,
    lineHeight: 1.2,
  },

  /* Features */
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.25rem',
  },
  featureCard: {
    background: '#141414',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    cursor: 'default',
    transition: 'border-color 0.2s',
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'rgba(229,55,58,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  featureTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#fafafa',
    letterSpacing: '-0.015em',
  },
  featureBody: {
    fontSize: '0.92rem',
    lineHeight: 1.65,
    color: '#777',
  },

  /* How it works */
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '2rem',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '0 0 2rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  stepNum: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#e5373a',
    letterSpacing: '0.08em',
  },
  stepTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#fafafa',
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
  },
  stepBody: {
    fontSize: '0.9rem',
    lineHeight: 1.65,
    color: '#666',
  },

  /* FAQ */
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    maxWidth: 720,
  },
  faqItem: {
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  faqQ: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.4rem 0',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fafafa',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    gap: '1rem',
  },
  faqIcon: {
    fontSize: '1.3rem',
    color: '#555',
    flexShrink: 0,
    display: 'inline-block',
    lineHeight: 1,
  },
  faqA: {
    fontSize: '0.92rem',
    lineHeight: 1.7,
    color: '#777',
    paddingBottom: '1.4rem',
  },

  /* CTA Banner */
  ctaBanner: {
    background: '#141414',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 28,
    padding: '4rem 2rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.2rem',
    position: 'relative',
    overflow: 'hidden',
  },
  ctaBannerGlow: {
    position: 'absolute',
    top: '-40%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 500,
    height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(229,55,58,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  ctaBannerTitle: {
    fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: '#fafafa',
    position: 'relative',
  },
  ctaBannerSub: {
    fontSize: '1rem',
    color: '#777',
    maxWidth: 480,
    lineHeight: 1.65,
    position: 'relative',
  },

  /* Footer */
  footer: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '3rem 2rem 2rem',
    maxWidth: 1100,
    margin: '0 auto',
  },
  footerInner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '3rem',
    flexWrap: 'wrap',
    marginBottom: '2.5rem',
  },
  footerBrand: {
    maxWidth: 260,
  },
  footerTagline: {
    fontSize: '0.85rem',
    color: '#555',
    lineHeight: 1.6,
  },
  footerCols: {
    display: 'flex',
    gap: '3rem',
    flexWrap: 'wrap',
  },
  footerCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  footerColHead: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#555',
    marginBottom: '0.25rem',
  },
  footerLink: {
    fontSize: '0.88rem',
    color: '#777',
    transition: 'color 0.15s',
  },
  footerCopy: {
    fontSize: '0.78rem',
    color: '#444',
    paddingTop: '1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
}

/* ─── Hidden version badge (triggered by ?debug in the URL) ──────────────── */
// Access: scarletspots.com?debug  — invisible to normal visitors.
// Shows website version, git SHA, and build timestamp for diagnostics.
function VersionBadge() {
  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug')
  if (!isDebug) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      background: 'rgba(10,10,10,0.92)',
      border: '1px solid rgba(229,55,58,0.35)',
      borderRadius: 10,
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '0.72rem',
      color: '#aaa',
      backdropFilter: 'blur(12px)',
      lineHeight: 1.7,
      maxWidth: 260,
    }}>
      <div style={{ color: '#e5373a', fontWeight: 700, marginBottom: 4 }}>⚙ Debug Info</div>
      <div><span style={{ color: '#555' }}>website </span>{__APP_VERSION__}</div>
      <div><span style={{ color: '#555' }}>sha     </span>{__GIT_SHA__}</div>
      <div><span style={{ color: '#555' }}>built   </span>{new Date(__BUILD_TIME__).toLocaleString()}</div>
    </div>
  )
}

/* ─── App ─────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
      <VersionBadge />
    </>
  )
}
