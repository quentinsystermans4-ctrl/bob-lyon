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
      } else if (day === 0) { // Dimanche
        isOpen = false;
        message = 'Fermé le dimanche • Réouverture mardi à 17h';
        dotClass = 'closed';
      } else if (day === 1) { // Lundi
        isOpen = false;
        message = 'Fermé le lundi • Réouverture mardi à 17h';
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
        if (wrapperRect.top < 65) {
          const carteSection = document.getElementById('carte');
          const headerHeight = document.getElementById('main-header')?.offsetHeight || 60;
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
  const header = document.getElementById('main-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
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

function initLightbox() {
  activeLightboxModal = document.getElementById('lightbox-modal');
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeLightboxModal && activeLightboxModal.classList.contains('open')) {
      closeLightbox();
    }
  });
}

window.openLightbox = function(imageSrc, captionText) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');

  if (modal && img) {
    img.src = imageSrc;
    if (caption) caption.textContent = captionText || '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
};
