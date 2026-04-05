import re
import os

filepath = r"c:\Users\Farhan Mir\Desktop\Projects\ScarletSpots\website\index.html"

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Nav menu
text = text.replace(
    '<a href="#technical" class="nav-link">How It Works</a>\n          <a href="#faq" class="nav-link">FAQ</a>\n          <a href="#waitlist" class="nav-link">Expand Map</a>',
    '<a href="#faq" class="nav-link">FAQ</a>'
)

# 2. Ticker section
text = re.sub(r'<!-- Live Data Stream Ticker -->.*?</section>', '', text, flags=re.DOTALL)

# 3. Hero content (subtitle, mockup, buttons)
hero_replace = r'''<p class="hero-subtitle">Navigate Rutgers parking effortlessly. See real-time spot availability, find where your friends are parked, and navigate to the nearest open spot.</p>

          <!-- Navigation CTAs -->
          <div class="cta-buttons" style="margin-top: 3rem; margin-bottom: 3rem;">
            <button class="btn btn-primary glow-button">
              <span class="btn-icon">📍</span>
              Download on the App Store
            </button>
          </div>'''
text = re.sub(r'<p class="hero-subtitle".*?</button>\n          </div>', hero_replace, text, flags=re.DOTALL)

# 4. Credibility Badges
text = text.replace(
    '<span>✓ Live location tracking</span>\n            <span>✓ Turn-by-turn directions</span>',
    '<span>✓ Real-time occupancy</span>\n            <span>✓ Precision offline maps</span>'
)

# 5. Features Grid
target_features = '''        <div class="feature-card feature-card-2 reveal-element">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
          <h3>Smart Route Navigation</h3>
          <p>Get optimized routes to the nearest available spot. Our algorithm factors in real-time traffic, lot capacity, and your parking permit type.</p>
        </div>'''
text = text.replace(target_features, '')

text = text.replace(
    '<h3>Compass Navigation</h3>\n          <p>Built-in compass integration guides you to your parked car. Works offline with cached map tiles—perfect for underground garages.</p>',
    '<h3>Offline Companion</h3>\n          <p>Local static map data and built-in compass navigation work anywhere. Find your car easily, even in an underground parking garage with zero cell service.</p>'
)
text = text.replace('feature-card-4', 'feature-card-3')

# 6. Remove Technical and Waitlist sections
text = re.sub(r'<!-- Technical Deep Dive - Data Layers -->.*?</section>', '', text, flags=re.DOTALL)
text = re.sub(r'<!-- Campus Expansion - New Territory Section -->.*?</section>', '', text, flags=re.DOTALL)

# 7. FAQ Section (remove accuracy, battery, contribute, android)
text = re.sub(r'<div class="faq-item reveal-element">\n\s*<button class="faq-question">\n\s*<span>How accurate.*?</div>\n\s*</div>', '', text, flags=re.DOTALL)
text = re.sub(r'<div class="faq-item reveal-element">\n\s*<button class="faq-question">\n\s*<span>Will it drain my battery.*?</div>\n\s*</div>', '', text, flags=re.DOTALL)
text = re.sub(r'<div class="faq-item reveal-element">\n\s*<button class="faq-question">\n\s*<span>Can I contribute.*?</div>\n\s*</div>', '', text, flags=re.DOTALL)
text = re.sub(r'<div class="faq-item reveal-element">\n\s*<button class="faq-question">\n\s*<span>When is the Android map.*?</div>\n\s*</div>', '', text, flags=re.DOTALL)

# 8. Footer Section
text = text.replace(
    '<li><a href="#">Android Beta</a></li>\n            <li><a href="#">Web Map (Coming Soon)</a></li>',
    ''
)
text = text.replace(
    '<div class="footer-section">\n          <h4>Map Data</h4>\n          <ul>\n            <li><a href="#">Coverage Areas</a></li>\n            <li><a href="#">Report an Issue</a></li>\n            <li><a href="#">Contribute Data</a></li>\n          </ul>\n        </div>',
    ''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
print("Updated index.html")
