/**
 * BOB - BLONDE OU BRUNE (Lyon 1er)
 * Interactive Front-End Script
 */

document.addEventListener('DOMContentLoaded', () => {
  initLiveScheduleStatus();
  initCarteTabs();
  initMobileDrawer();
  initStickyHeader();
  initScrollSpy();
  initLightbox();
  initDynamicBeers();
  initDynamicAgenda();
  initAnalyticsAndTracking();
});

/* --------------------------------------------------------------------------
   1. LIVE SCHEDULE STATUS (Calcul en temps réel des horaires d'ouverture)
   -------------------------------------------------------------------------- */
function initLiveScheduleStatus() {
  const statusTextTop = document.getElementById('live-status-text');
  const statusPillTop = document.getElementById('live-status-pill');
  const statusTextDrawer = document.getElementById('drawer-status-text');
  
  function updateStatus() {
    // Obtenir l'heure courante (fuseau Europe/Paris)
    const now = new Date();
    // Use Intl for French time if possible
    const parisTimeStr = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const parisDate = new Date(parisTimeStr);

    const day = parisDate.getDay(); // 0 = Dimanche, 1 = Lundi, 2 = Mardi, ..., 6 = Samedi
    const hours = parisDate.getHours();
    const minutes = parisDate.getMinutes();
    const currentTimeInMinutes = hours * 60 + minutes;

    let isOpen = false;
    let message = '';
    let dotClass = '';

    // Schedule Rules for BOB Lyon:
    // Mardi - Vendredi (2, 3, 4, 5) : 17h00 (1020m) à 01h00 (+1d, 60m)
    // Samedi (6) : 16h00 (960m) à 01h00 (+1d, 60m)
    // Dimanche (0) & Lundi (1) : Fermé

    // Traitement pour après-minuit (00h00 - 01h00) qui correspond à la nuit de la veille :
    if (hours < 1) { // entre 00h00 et 00h59
      if (day >= 3 && day <= 6) { // Nuit de Mercredi à Samedi (jour 3,4,5,6 matin = nuit Mar,Mer,Jeu,Ven)
        isOpen = true;
        message = 'Ouvert actuellement (ferme à 01h)';
        dotClass = '';
      } else if (day === 0) { // Dimanche matin 00h-01h = nuit de Samedi
        isOpen = true;
        message = 'Ouvert actuellement (ferme à 01h)';
        dotClass = '';
      } else {
        isOpen = false;
      }
    } else {
      // Journée normale
      if (day >= 2 && day <= 5) { // Mardi à Vendredi
        if (currentTimeInMinutes >= 17 * 60) { // De 17h00 à 23h59
          isOpen = true;
          // Check Happy Hour
          if (currentTimeInMinutes < 20 * 60) {
            message = 'Ouvert • ⚡ HAPPY HOUR en cours !';
          } else {
            message = 'Ouvert actuellement (ferme à 01h)';
          }
          dotClass = '';
        } else {
          isOpen = false;
          message = 'Fermé • Ouvre aujourd’hui à 17h00';
          dotClass = 'soon';
        }
      } else if (day === 6) { // Samedi
        if (currentTimeInMinutes >= 16 * 60) { // De 16h00 à 23h59
          isOpen = true;
          if (currentTimeInMinutes >= 17 * 60 && currentTimeInMinutes < 20 * 60) {
            message = 'Ouvert • ⚡ HAPPY HOUR en cours !';
          } else {
            message = 'Ouvert actuellement (ferme à 01h)';
          }
          dotClass = '';
        } else {
          isOpen = false;
          message = 'Fermé • Ouvre aujourd’hui à 16h00';
          dotClass = 'soon';
        }
      } else if (day === 1) { // Lundi : 17h00 à 23h00
        if (currentTimeInMinutes >= 17 * 60 && currentTimeInMinutes < 23 * 60) {
          isOpen = true;
          if (currentTimeInMinutes < 20 * 60) {
            message = 'Ouvert • ⚡ HAPPY HOUR en cours !';
          } else {
            message = 'Ouvert actuellement (ferme à 23h)';
          }
          dotClass = '';
        } else if (currentTimeInMinutes < 17 * 60) {
          isOpen = false;
          message = 'Fermé • Ouvre aujourd’hui à 17h00';
          dotClass = 'soon';
        } else {
          isOpen = false;
          message = 'Fermé actuellement • Réouverture mardi à 17h';
          dotClass = 'closed';
        }
      } else if (day === 0) { // Dimanche : Fermé
        isOpen = false;
        message = 'Fermé le dimanche • Réouverture lundi à 17h';
        dotClass = 'closed';
      }
    }

    if (statusTextTop) statusTextTop.textContent = message;
    if (statusTextDrawer) statusTextDrawer.textContent = message;

    // Dot class
    const dot = statusPillTop ? statusPillTop.querySelector('.status-dot') : null;
    if (dot) {
      dot.className = 'status-dot ' + dotClass;
    }

    // Highlight current day in table
    highlightScheduleRow(day);
  }

  function highlightScheduleRow(day) {
    const rowMap = {
      2: 'row-tuesday',
      3: 'row-wednesday',
      4: 'row-thursday',
      5: 'row-friday',
      6: 'row-saturday',
      0: 'row-sunday',
      1: 'row-monday'
    };

    const targetId = rowMap[day];
    if (targetId) {
      document.querySelectorAll('.hours-table tr').forEach(r => r.classList.remove('active-today'));
      const activeRow = document.getElementById(targetId);
      if (activeRow) {
        activeRow.classList.add('active-today');
      }
    }
  }

  updateStatus();
  setInterval(updateStatus, 60000); // Mise à jour chaque minute
}

/* --------------------------------------------------------------------------
   2. CARTE TABS NAVIGATION
   -------------------------------------------------------------------------- */
function initCarteTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabsWrapper = document.querySelector('.carte-tabs-wrapper');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');

      // Update button active state
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Center active tab in horizontal scroll (for mobile swipe)
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

      // Update pane active state
      tabPanes.forEach(pane => {
        pane.classList.remove('active');
      });
      const activePane = document.getElementById(targetId);
      if (activePane) {
        activePane.classList.add('active');
      }

      // If user is scrolled below the sticky bar, smoothly scroll to top of carte category
      if (tabsWrapper) {
        const wrapperRect = tabsWrapper.getBoundingClientRect();
        const topGroup = document.getElementById('sticky-top-group');
        const headerHeight = topGroup ? topGroup.offsetHeight : (document.getElementById('main-header')?.offsetHeight || 100);
        if (wrapperRect.top < headerHeight + 15) {
          const carteSection = document.getElementById('carte');
          const targetY = (carteSection?.offsetTop || 0) + 120 - headerHeight;
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      }
    });
  });
}

/* --------------------------------------------------------------------------
   3. MOBILE DRAWER MENU
   -------------------------------------------------------------------------- */
function initMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const closeBtn = document.getElementById('drawer-close');
  const overlay = drawer ? drawer.querySelector('.drawer-overlay') : null;
  const drawerLinks = document.querySelectorAll('.drawer-link');

  function openDrawer() {
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDrawer() {
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });
}

/* --------------------------------------------------------------------------
   4. STICKY HEADER EFFECT
   -------------------------------------------------------------------------- */
function initStickyHeader() {
  const stickyGroup = document.getElementById('sticky-top-group') || document.getElementById('main-header');
  const header = document.getElementById('main-header');
  if (!stickyGroup) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 20) {
          stickyGroup.classList.add('scrolled');
          if (header) header.classList.add('scrolled');
        } else {
          stickyGroup.classList.remove('scrolled');
          if (header) header.classList.remove('scrolled');
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   5. SCROLL SPY (Active Nav Links on Scroll)
   -------------------------------------------------------------------------- */
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.desktop-nav .nav-link');

  if (!sections.length || !navLinks.length) return;

  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));
}

/* --------------------------------------------------------------------------
   6. LIGHTBOX MODAL FOR PHOTOS
   -------------------------------------------------------------------------- */
let activeLightboxModal = null;
let lastFocusedElement = null;

function initLightbox() {
  activeLightboxModal = document.getElementById('lightbox-modal');
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeLightboxModal && activeLightboxModal.classList.contains('open')) {
      closeLightbox();
    }
  });

  // Keyboard navigation (Enter / Space) for accessible photo triggers
  document.querySelectorAll('.mosaic-item, .priv-card-media').forEach((item) => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });
}

window.openLightbox = function(imageSrc, captionText) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const closeBtn = modal ? modal.querySelector('.lightbox-close') : null;

  lastFocusedElement = document.activeElement;

  if (modal && img) {
    img.src = imageSrc;
    img.alt = captionText || 'Photo agrandie du BOB';
    if (caption) caption.textContent = captionText || '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 50);
    }
  }
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }
};

/* --------------------------------------------------------------------------
   7. CARTE DYNAMIQUE (Chargement depuis assets/data/beers.json)
   -------------------------------------------------------------------------- */
async function initDynamicBeers() {
  const pressionsGrid = document.getElementById('pressions-grid');
  const bouteillesGrid = document.getElementById('bouteilles-grid');
  const flightContainer = document.getElementById('flight-banner-container');

  if (!pressionsGrid && !bouteillesGrid) return;

  try {
    const response = await fetch('assets/data/beers.json');
    if (!response.ok) {
      console.info('Chargement beers.json : utilisation du rendu HTML existant.');
      return;
    }
    const data = await response.json();

    // 1. Rendu du Flight Découverte (si présent)
    if (flightContainer && data.flight) {
      const f = data.flight;
      flightContainer.innerHTML = `
        <div class="flight-banner-content">
          <div class="flight-badge-group">
            <span class="badge-pulse"><i class="fa-solid fa-beer-mug-empty"></i> ${escapeHtml(f.badge || 'FLIGHT DÉCOUVERTE')}</span>
            <span class="beer-style-tag style-blonde">${escapeHtml(f.size || '4 x 12,5 cl')}</span>
          </div>
          <h4 class="flight-title">${escapeHtml(f.title)}</h4>
          <p class="flight-desc">${f.description}</p>
        </div>
        <div class="flight-price-box">
          <span class="flight-price-label">La Planche</span>
          <span class="flight-price-val">${escapeHtml(f.price)}</span>
          <span class="flight-price-sub">${escapeHtml(f.sub || "Au choix sur l'ardoise")}</span>
        </div>
      `;
    }

    // 2. Rendu des Pressions (9 becs)
    if (pressionsGrid && Array.isArray(data.pressions)) {
      const cardsHtml = data.pressions.map((beer, idx) => {
        const featuredClass = beer.featured ? ' border-gold-soft' : '';
        const badgeHtml = beer.badge 
          ? `<span class="badge-pulse badge-guest"><i class="fa-solid fa-rotate"></i> ${escapeHtml(beer.badge)}</span>` 
          : '';
        const hhHtml = beer.priceHH50 ? `
          <div class="price-hh">
            <span class="hh-label">HH 50cl :</span>
            <span class="hh-val">${escapeHtml(beer.priceHH50)}</span>
          </div>` : '';

        return `
          <div class="menu-item-card${featuredClass}" id="${escapeHtml(beer.id || 'pression-' + (idx + 1))}">
            <div class="card-top">
              <div class="item-badge-row">
                ${badgeHtml}
                <span class="beer-style-tag ${escapeHtml(beer.styleClass || 'style-blonde')}">${escapeHtml(beer.style)}</span>
                <span class="origin-tag">${escapeHtml(beer.brewery)} • ${escapeHtml(beer.abv)}</span>
              </div>
              <div class="price-container">
                <div class="price-regular">
                  <span class="price-size">25cl : <strong>${escapeHtml(beer.price25)}</strong></span>
                  <span class="price-size">50cl : <strong>${escapeHtml(beer.price50)}</strong></span>
                </div>
                ${hhHtml}
              </div>
            </div>
            <h4 class="item-title">${escapeHtml(beer.name)}</h4>
            <p class="item-desc">${beer.description}</p>
          </div>
        `;
      }).join('');

      pressionsGrid.innerHTML = cardsHtml;
    }

    // 3. Rendu des Cans et Bouteilles
    if (bouteillesGrid && Array.isArray(data.bouteilles)) {
      const bouteillesHtml = data.bouteilles.map((item, idx) => {
        return `
          <div class="menu-item-card" id="${escapeHtml(item.id || 'bouteille-' + (idx + 1))}">
            <div class="card-top">
              <div class="item-badge-row">
                <span class="beer-style-tag ${escapeHtml(item.styleClass || 'style-canette')}">${escapeHtml(item.type)}</span>
                <span class="origin-tag">${escapeHtml(item.format)}</span>
              </div>
              <div class="price-list-vertical">
                <div class="price-line">Sur place : <strong>${escapeHtml(item.priceDineIn)}</strong></div>
                <div class="price-line">À emporter : <strong>${escapeHtml(item.priceTakeaway)}</strong></div>
              </div>
            </div>
            <h4 class="item-title">${escapeHtml(item.name)}</h4>
            <p class="item-desc">${escapeHtml(item.description)}</p>
          </div>
        `;
      }).join('');

      bouteillesGrid.innerHTML = bouteillesHtml;
    }

  } catch (err) {
    console.warn('Erreur lors du chargement de la carte dynamique :', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* --------------------------------------------------------------------------
   8. TRACKING ANALYTICS & CONVERSIONS (Privateaser, Appels, Maps, Social)
   -------------------------------------------------------------------------- */
function initAnalyticsAndTracking() {
  function sendTrackingEvent(eventName, eventLabel) {
    // 1. GoatCounter (0 cookie, conforme RGPD)
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count({
        path: 'event/' + eventName,
        title: eventLabel || eventName,
        event: true
      });
    }
    // 2. Google Analytics 4 (si configuré ultérieurement)
    if (window.gtag && typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        event_category: 'interaction',
        event_label: eventLabel
      });
    }
  }

  // Écoute globale des clics avec délégation
  document.addEventListener('click', (e) => {
    const targetLink = e.target.closest('a');
    if (!targetLink) return;

    const href = targetLink.getAttribute('href') || '';
    const customTrack = targetLink.getAttribute('data-track');

    if (customTrack) {
      const label = targetLink.getAttribute('data-label') || targetLink.textContent.trim();
      sendTrackingEvent(customTrack, label);
    } else if (href.includes('privateaser.com')) {
      sendTrackingEvent('privateaser_reservation', 'Réservation Privateaser');
    } else if (href.startsWith('tel:')) {
      sendTrackingEvent('phone_call', href);
    } else if (href.includes('goo.gl/maps') || href.includes('google.com/maps')) {
      sendTrackingEvent('google_maps_click', 'Accès Google Maps');
    } else if (href.includes('instagram.com')) {
      sendTrackingEvent('social_instagram', '@leboblyon');
    }
  });
}

/* --------------------------------------------------------------------------
   9. AGENDA DYNAMIQUE DE LA SEMAINE (Chargement depuis assets/data/agenda.json)
   -------------------------------------------------------------------------- */
async function initDynamicAgenda() {
  const agendaContainer = document.getElementById('dynamic-weekly-agenda');
  if (!agendaContainer) return;

  try {
    const response = await fetch('assets/data/agenda.json');
    if (!response.ok) return;
    const data = await response.json();

    if (!data || !Array.isArray(data.events) || data.events.length === 0) return;

    const eventsHtml = data.events.map((ev, idx) => {
      const badgeHtml = ev.badge ? `<span class="event-tag"><i class="fa-solid fa-tag text-gold"></i> ${escapeHtml(ev.badge)}</span>` : '';
      const iconClass = ev.categoryIcon || 'fa-solid fa-calendar-check';

      return `
        <div class="event-card weekly-highlight" id="${escapeHtml(ev.id || 'weekly-ev-' + (idx + 1))}">
          <div>
            <div class="event-icon-box">
              <i class="${escapeHtml(iconClass)}"></i>
            </div>
            <div class="event-meta">
              <span class="event-timing">${escapeHtml(ev.day)} • ${escapeHtml(ev.time)}</span>
              <h4 class="event-title">${escapeHtml(ev.title)}</h4>
            </div>
            <p class="event-desc">${escapeHtml(ev.description)}</p>
          </div>
          <div class="event-footer">
            ${badgeHtml}
            <div class="event-card-action">
              <a href="https://www.privateaser.com/lieu/45402-bob-blonde-ou-brune" 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 class="btn btn-primary btn-xs btn-block" 
                 data-track="privateaser_weekly_event" 
                 data-label="${escapeHtml(ev.title)}">
                <i class="fa-solid fa-calendar-check"></i> Réserver pour ce soir
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    agendaContainer.innerHTML = `
      <div class="weekly-banner-box">
        <div class="weekly-banner-badge">
          <span class="badge-pulse"><i class="fa-solid fa-calendar-days"></i> AU PROGRAMME CETTE SEMAINE</span>
          <span class="weekly-dates">${escapeHtml(data.currentWeekDates || '')}</span>
        </div>
        <h3 class="weekly-banner-title">${escapeHtml(data.currentWeekTheme || data.currentWeekTitle || 'Cette semaine au BOB')}</h3>
        <p class="weekly-banner-sub"><i class="fa-solid fa-bolt text-gold"></i> ${escapeHtml(data.happyHourNotice || 'Happy Hour tous les soirs 17h - 20h')} • 12 rue Imbert Colomès</p>
      </div>
      <div class="events-grid weekly-grid">
        ${eventsHtml}
      </div>
    `;
  } catch (err) {
    console.info('Agenda dynamique : aucun événement chargé, affichage des activités permanentes.');
  }
}


