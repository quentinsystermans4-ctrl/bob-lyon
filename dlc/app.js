/**
 * BOB • Suivi des DLC & Traçabilité Hygiène
 * Logique principale avec OCR d'étiquette, distinction DLC/DLUO et alertes multi-lots
 */

// =============================================================================
// 1. INITIALISATION & DONNÉES PAR DÉFAUT
// =============================================================================

const DEFAULT_PRODUCTS = [
  // Charcuterie
  { id: 'jambon_blanc', name: 'Jambon Blanc', category: 'charcuterie', icon: '🥓', batches: [], order: 1 },
  { id: 'jambon_sec', name: 'Jambon Sec', category: 'charcuterie', icon: '🥓', batches: [], order: 2 },
  { id: 'chorizo', name: 'Chorizo déjà tranché', category: 'charcuterie', icon: '🥓', batches: [], order: 3 },
  
  // Fromages
  { id: 'camembert', name: 'Camembert', category: 'fromage', icon: '🧀', batches: [], order: 4 },
  { id: 'saint_marcellin', name: 'Saint Marcelin', category: 'fromage', icon: '🧀', batches: [], order: 5 },
  { id: 'tome', name: 'Tome', category: 'fromage', icon: '🧀', batches: [], order: 6 },
  { id: 'comte', name: 'Comté', category: 'fromage', icon: '🧀', batches: [], order: 7 },
  { id: 'chevre', name: 'Chèvre', category: 'fromage', icon: '🧀', batches: [], order: 8 },
  { id: 'fromage_pizza', name: 'Fromage à pizza', category: 'fromage', icon: '🧀', batches: [], order: 9 },
  
  // Pâtes
  { id: 'pate_pizza', name: 'Pâte à pizza', category: 'pate', icon: '🍕', batches: [], order: 10 }
];

const STORAGE_KEYS = {
  PRODUCTS: 'bob_dlc_products_v1',
  PIN: 'bob_dlc_pin_v1',
  UNLOCKED: 'bob_dlc_unlocked_v1',
  REMEMBER: 'bob_dlc_remember_v1',
  ARCHIVES: 'bob_dlc_archives_v1'
};

// État global en mémoire
let products = [];
let archivedBatches = [];
let pendingFinishBatch = null;
let currentFilterCategory = 'all';
let currentFilterStatus = 'all';
let activeEditingProductId = null;
let currentUploadedPhotoBase64 = null;
let enteredPin = '';
let db = null;
let isApplyingCloudSnapshot = false;

// Configuration officielle Google Firebase Firestore (Projet BOB DLC)
const firebaseConfig = {
  apiKey: "AIzaSyCH-DwoGHPujHVxsZh3FhmUJoXcijWc8zs",
  authDomain: "bob-lyon-dlc.firebaseapp.com",
  projectId: "bob-lyon-dlc",
  storageBucket: "bob-lyon-dlc.firebasestorage.app",
  messagingSenderId: "332508055011",
  appId: "1:332508055011:web:af11466ed2fa54cf77ccd6"
};

// =============================================================================
// 2. CYCLE DE VIE DE L'APPLICATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  updateLiveDate();
  updateVersionDisplay();
  checkPinAuth();
  renderCategoryTabs();
  renderProducts();
  updateKpiCounts();
  renderCriticalDlcAlerts();
  renderMultiLotAlerts();
  updateArchiveBadge();
  initFirebase();

  // Enregistrement Service Worker pour fonctionnement PWA hors-ligne
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=1.5.1').then(reg => {
      reg.update();
    }).catch(err => {
      console.log('Service Worker non actif en local / dev:', err);
    });
  }
});

const APP_VERSION = 'v1.5.1';

function updateVersionDisplay() {
  const hEl = document.getElementById('header-version-text');
  const fEl = document.getElementById('footer-version-text');
  if (hEl) hEl.textContent = APP_VERSION;
  if (fEl) fEl.textContent = APP_VERSION;
}

async function forceAppUpdate() {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) {}
  }
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let reg of registrations) {
        await reg.unregister();
      }
    } catch (e) {}
  }
  // Rechargement complet en ignorant le cache
  window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
}

function initStorage() {
  // Initialisation du Code PIN si inexistant (défaut '1234')
  if (!localStorage.getItem(STORAGE_KEYS.PIN)) {
    localStorage.setItem(STORAGE_KEYS.PIN, '1234');
  }

  // Initialisation des produits locaux
  const stored = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
  if (stored) {
    try {
      products = JSON.parse(stored);
    } catch (e) {
      console.error('Erreur lecture stockage, restauration défauts', e);
      products = [...DEFAULT_PRODUCTS];
      saveProductsToStorage();
    }
  } else {
    products = [...DEFAULT_PRODUCTS];
    saveProductsToStorage();
  }

  // Initialisation du registre d'archives HACCP
  const storedArchives = localStorage.getItem(STORAGE_KEYS.ARCHIVES);
  if (storedArchives) {
    try {
      archivedBatches = JSON.parse(storedArchives);
    } catch (e) {
      archivedBatches = [];
    }
  } else {
    archivedBatches = [];
  }
  updateArchiveBadge();
}

function countTotalBatches(items = products) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, p) => acc + (p.batches ? p.batches.length : 0), 0);
}

function updateCloudStatus(status, text) {
  const badge = document.getElementById('cloud-status-badge');
  const textEl = document.getElementById('cloud-status-text');
  if (!badge || !textEl) return;
  badge.className = 'cloud-status-badge ' + status;
  textEl.textContent = text;
}

// =============================================================================
// SYNCHRONISATION FIREBASE FIRESTORE TEMPS RÉEL (Collection 'products')
// =============================================================================

function initFirebase() {
  if (!window.firebase) {
    console.warn('SDK Firebase non disponible.');
    updateCloudStatus('offline', 'Local seul');
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();

    // Persistance hors-ligne pour travail en cave/réserve
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      console.log('Persistance hors-ligne Firestore:', err.code);
    });

    listenToCloudInventory();
    listenToCloudArchives();
  } catch (err) {
    console.error('Erreur init Firebase:', err);
    updateCloudStatus('error', 'Erreur Cloud');
  }
}

function listenToCloudArchives() {
  if (!db) return;
  db.collection('archived_batches').onSnapshot(snapshot => {
    if (!snapshot.empty) {
      const cloudArchives = [];
      snapshot.forEach(doc => cloudArchives.push(doc.data()));
      cloudArchives.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
      archivedBatches = cloudArchives;
      localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(archivedBatches));
      updateArchiveBadge();
      renderArchivesList();
    }
  }, err => console.warn('Erreur écoute archives Cloud:', err));
}

function listenToCloudInventory() {
  if (!db) return;
  updateCloudStatus('connecting', 'Connexion...');

  const colRef = db.collection('products');

  colRef.onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    if (!snapshot.empty) {
      const cloudProducts = [];
      snapshot.forEach(doc => {
        cloudProducts.push(doc.data());
      });

      // Tri par order
      cloudProducts.sort((a, b) => (a.order || 999) - (b.order || 999));

      const cloudBatches = countTotalBatches(cloudProducts);
      const localBatches = countTotalBatches(products);

      // Si le Cloud n'a aucun lot (0) et que CET appareil a de vrais lots enregistrés (ex: iPhone de Quentin),
      // on pousse immédiatement nos lots locaux vers Firestore !
      if (cloudBatches === 0 && localBatches > 0) {
        console.log(`Cloud sans lots. Envoi de nos ${localBatches} lots vers Firestore...`);
        pushAllLocalProductsToCloud(true);
        return;
      }

      // Synchronisation normale depuis le cloud
      isApplyingCloudSnapshot = true;
      products = cloudProducts;
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      renderCategoryTabs();
      renderProducts();
      updateKpiCounts();
      renderCriticalDlcAlerts();
      renderMultiLotAlerts();
      isApplyingCloudSnapshot = false;

      if (snapshot.metadata.hasPendingWrites) {
        updateCloudStatus('connecting', 'Synchronisation...');
      } else {
        updateCloudStatus('online', 'Équipe synchronisée');
      }
      return;
    }

    // Si la collection Firestore est complètement vide (0 document)
    const localBatches = countTotalBatches(products);
    if (localBatches > 0) {
      console.log(`Collection vide. Initialisation avec nos ${products.length} produits (${localBatches} lots)...`);
      pushAllLocalProductsToCloud(true);
    } else {
      updateCloudStatus('online', 'Cloud connecté');
    }
  }, (err) => {
    console.warn('Erreur écoute temps réel Cloud:', err);
    if (err.code === 'permission-denied') {
      updateCloudStatus('warning', 'Règles Firebase');
    } else {
      updateCloudStatus('offline', 'Hors-ligne');
    }
  });
}

function saveSingleProductToCloud(prod) {
  if (!db || !prod) return;
  db.collection('products').doc(prod.id).set(prod)
    .then(() => updateCloudStatus('online', 'Équipe synchronisée'))
    .catch(err => {
      console.warn('Erreur set product:', err);
      if (err.code === 'permission-denied') {
        updateCloudStatus('warning', 'Règles Firebase');
      } else {
        updateCloudStatus('offline', 'Hors-ligne');
      }
    });
}

function deleteProductFromCloud(productId) {
  if (!db || !productId) return;
  db.collection('products').doc(productId).delete()
    .catch(err => console.warn('Erreur delete product:', err));
}

function pushAllLocalProductsToCloud(silent = false) {
  if (!db) return;
  updateCloudStatus('connecting', 'Envoi au Cloud...');

  const promises = products.map((prod, idx) => {
    const toSave = { ...prod, order: prod.order !== undefined ? prod.order : idx + 1 };
    return db.collection('products').doc(prod.id).set(toSave);
  });

  Promise.all(promises).then(() => {
    updateCloudStatus('online', 'Équipe synchronisée');
    if (!silent) {
      alert(`✅ ${products.length} produits (${countTotalBatches(products)} lots) synchronisés sur le Cloud pour toute l'équipe !`);
      closeSettingsModal();
    }
  }).catch(err => {
    console.warn('Erreur push Cloud:', err);
    if (err.code === 'permission-denied') {
      updateCloudStatus('warning', 'Règles Firebase');
    } else {
      updateCloudStatus('offline', 'Hors-ligne');
    }
  });
}

function pushLocalToCloud() {
  if (!db) {
    alert('Firebase non initialisé sur cet appareil.');
    return;
  }
  const batches = countTotalBatches(products);
  if (confirm(`Envoyer tout le stock de cet appareil (${products.length} produits, ${batches} lots) sur le Cloud ?\n\nTous vos collègues recevront ces données instantanément.`)) {
    pushAllLocalProductsToCloud();
  }
}

function pullCloudToLocal() {
  if (!db) {
    alert('Firebase non initialisé sur cet appareil.');
    return;
  }
  db.collection('products').get().then((snapshot) => {
    if (!snapshot.empty) {
      const cloudProducts = [];
      snapshot.forEach(doc => cloudProducts.push(doc.data()));
      cloudProducts.sort((a, b) => (a.order || 999) - (b.order || 999));
      products = cloudProducts;
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      renderCategoryTabs();
      renderProducts();
      updateKpiCounts();
      renderCriticalDlcAlerts();
      renderMultiLotAlerts();
      alert(`✅ ${products.length} produits récupérés du Cloud !`);
      closeSettingsModal();
    } else {
      alert('Aucun produit trouvé sur le Cloud pour le moment.');
    }
  }).catch(err => {
    alert('Erreur lors de la récupération Cloud : ' + (err.message || err));
  });
}

function saveProductsToStorage(specificProduct = null) {
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  renderCategoryTabs();
  updateKpiCounts();
  renderCriticalDlcAlerts();
  renderMultiLotAlerts();
  if (!isApplyingCloudSnapshot && db) {
    if (specificProduct) {
      saveSingleProductToCloud(specificProduct);
    } else {
      pushAllLocalProductsToCloud(true);
    }
  }
}

function updateLiveDate() {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = new Date().toLocaleDateString('fr-FR', options);
  const capitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const el = document.getElementById('live-date');
  if (el) el.textContent = capitalized;
}

// =============================================================================
// 3. SÉCURITÉ & CODE PIN (Défaut 1234)
// =============================================================================

function checkPinAuth() {
  const pinScreen = document.getElementById('pin-screen');
  const isRemembered = localStorage.getItem(STORAGE_KEYS.REMEMBER) === 'true';
  const isUnlockedSession = sessionStorage.getItem(STORAGE_KEYS.UNLOCKED) === 'true';

  if (isRemembered || isUnlockedSession) {
    pinScreen.classList.add('hidden');
  } else {
    pinScreen.classList.remove('hidden');
    clearPin();
  }
}

function pressPin(num) {
  if (enteredPin.length < 4) {
    enteredPin += num;
    updatePinDots();
  }

  if (enteredPin.length === 4) {
    validatePin();
  }
}

function deletePin() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
    document.getElementById('pin-error').classList.add('hidden');
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (i <= enteredPin.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  }
}

function validatePin() {
  const correctPin = localStorage.getItem(STORAGE_KEYS.PIN) || '1234';
  const rememberCheckbox = document.getElementById('remember-device');

  if (enteredPin === correctPin) {
    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem(STORAGE_KEYS.REMEMBER, 'true');
    }
    sessionStorage.setItem(STORAGE_KEYS.UNLOCKED, 'true');
    document.getElementById('pin-screen').classList.add('hidden');
    clearPin();
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => {
      clearPin();
    }, 800);
  }
}

function lockApp() {
  localStorage.removeItem(STORAGE_KEYS.REMEMBER);
  sessionStorage.removeItem(STORAGE_KEYS.UNLOCKED);
  closeSettingsModal();
  document.getElementById('pin-screen').classList.remove('hidden');
  clearPin();
}

function updateBarPin() {
  const input = document.getElementById('settings-new-pin');
  const newPin = input.value.trim();
  if (newPin.length !== 4 || isNaN(newPin)) {
    alert('Veuillez entrer un code PIN composé de 4 chiffres exactement.');
    return;
  }
  localStorage.setItem(STORAGE_KEYS.PIN, newPin);
  alert(`Code PIN mis à jour avec succès : ${newPin}`);
  input.value = '';
  closeSettingsModal();
}

// =============================================================================
// 4. CALCULS DES DLC, DLUO & CODES COULEURS
// =============================================================================

function getDaysRemaining(dlcDateStr) {
  if (!dlcDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [y, m, d] = dlcDateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function getBatchStatus(batch) {
  if (!batch || !batch.dlc) return 'none';
  const days = getDaysRemaining(batch.dlc);
  if (days === null) return 'none';
  const isDLC = (batch.type || 'DLC') === 'DLC';

  if (isDLC) {
    // DLC : Date Limite de Consommation impérative (Santé / Répression des fraudes)
    if (days <= 0) return 'red';           // Périmé sanitaire (interdiction de vente/consommation)
    if (days <= 3) return 'critical-dlc';  // Alerte critique J-3 (Point 1 - priorité service bar)
    if (days <= 7) return 'orange';        // À passer en priorité (≤ 7 jours)
    return 'green';                        // Conforme (> 7 jours)
  } else {
    // DLUO / DDM : Date de Durabilité Minimale (Qualité organoleptique uniquement, aucun danger sanitaire)
    if (days <= 0) return 'dluo-exceeded'; // DLUO dépassée (autorisée à la vente et consommation)
    if (days <= 7) return 'orange-dluo';   // DLUO proche (≤ 7 jours)
    return 'green';                        // Conforme (> 7 jours)
  }
}

function getProductStatus(product) {
  if (!product.batches || product.batches.length === 0) return 'none';
  let hasRed = false;
  let hasCriticalDlc = false;
  let hasOrange = false;
  let hasDluoExceeded = false;
  let hasOrangeDluo = false;
  let hasGreen = false;

  product.batches.forEach(b => {
    const s = getBatchStatus(b);
    if (s === 'red') hasRed = true;
    else if (s === 'critical-dlc') hasCriticalDlc = true;
    else if (s === 'orange') hasOrange = true;
    else if (s === 'dluo-exceeded') hasDluoExceeded = true;
    else if (s === 'orange-dluo') hasOrangeDluo = true;
    else if (s === 'green') hasGreen = true;
  });

  if (hasRed) return 'red';
  if (hasCriticalDlc) return 'critical-dlc';
  if (hasOrange) return 'orange';
  if (hasDluoExceeded) return 'dluo-exceeded';
  if (hasOrangeDluo) return 'orange-dluo';
  if (hasGreen) return 'green';
  return 'none';
}

// =============================================================================
// 5. RENDU DE L'INTERFACE & PRODUITS
// =============================================================================

function renderProducts() {
  const container = document.getElementById('products-list');
  if (!container) return;

  // Filtrage
  let filtered = products.filter(p => {
    if (currentFilterCategory !== 'all' && p.category !== currentFilterCategory) {
      return false;
    }
    if (currentFilterStatus !== 'all') {
      const status = getProductStatus(p);
      if (currentFilterStatus === 'red') {
        if (status !== 'red') return false;
      } else if (currentFilterStatus === 'orange') {
        if (status !== 'orange' && status !== 'critical-dlc' && status !== 'orange-dluo') return false;
      } else if (currentFilterStatus === 'green') {
        if (status !== 'green') return false;
      }
    }
    return true;
  });

  // Tri automatique : Rouge sanitaire en premier, puis Critique J-3, puis Orange, puis DLUO dépassée, puis Vert, puis None
  const statusPriority = {
    'red': 0,
    'critical-dlc': 1,
    'orange': 2,
    'dluo-exceeded': 3,
    'orange-dluo': 4,
    'green': 5,
    'none': 6
  };

  filtered.sort((a, b) => {
    const statusA = getProductStatus(a);
    const statusB = getProductStatus(b);
    const pA = statusPriority[statusA] !== undefined ? statusPriority[statusA] : 9;
    const pB = statusPriority[statusB] !== undefined ? statusPriority[statusB] : 9;
    if (pA !== pB) {
      return pA - pB;
    }
    const minDaysA = a.batches && a.batches.length > 0 ? Math.min(...a.batches.map(b => getDaysRemaining(b.dlc))) : 9999;
    const minDaysB = b.batches && b.batches.length > 0 ? Math.min(...b.batches.map(b => getDaysRemaining(b.dlc))) : 9999;
    return minDaysA - minDaysB;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: var(--text-muted);">
        <i class="fa-solid fa-box-open" style="font-size: 2.2rem; margin-bottom: 12px; color: var(--color-gold);"></i>
        <p>Aucun produit ne correspond à ce filtre.</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(prod => {
    const productStatus = getProductStatus(prod);
    const hasBatches = prod.batches && prod.batches.length > 0;

    html += `
      <div class="product-card status-${productStatus}">
        <div class="product-card-header">
          <div class="product-info">
            <span class="product-category-tag">${getCategoryLabel(prod.category)}</span>
            <h3 class="product-title">${prod.name}</h3>
          </div>
          <div class="product-actions">
            <button class="btn-update-dlc" onclick="openDlcModal('${prod.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
              <span>${hasBatches ? 'Modifier / Ajouter' : 'Définir DLC'}</span>
            </button>
            <button class="btn-delete-product" onclick="deleteProduct('${prod.id}')" title="Supprimer ce produit (ex: arrêt temporaire)">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
    `;

    if (hasBatches) {
      html += `<div class="batches-list">`;
      prod.batches.forEach((batch, index) => {
        const batchStatus = getBatchStatus(batch);
        const badgeClass = `badge-${batchStatus}`;
        const formattedDate = formatDateFr(batch.dlc);
        const statusText = getStatusBadgeText(batch);
        const typeBadge = (batch.type || 'DLC') === 'DLC' 
          ? `<span class="badge-type-dlc">DLC</span>` 
          : `<span class="badge-type-dluo">DLUO</span>`;

        html += `
          <div class="batch-row">
            <div class="batch-left">
              <span class="batch-status-badge ${badgeClass}">${statusText}</span>
              <div class="batch-meta">
                <strong>${typeBadge} ${formattedDate}</strong>
                ${prod.batches.length > 1 ? `<span style="font-size:0.68rem; color:var(--color-gold); margin-left:4px;">(Lot ${index + 1})</span>` : ''}
                ${batch.note ? `<span class="batch-note"><i class="fa-regular fa-note-sticky"></i> ${escapeHtml(batch.note)}</span>` : ''}
              </div>
            </div>
            <div class="batch-right">
              ${batch.photo ? `
                <img src="${batch.photo}" class="batch-photo-thumb" alt="Étiquette" onclick="openLightbox('${batch.photo}', '${escapeHtml(prod.name)} - Lot ${index + 1}')" title="Agrandir l'étiquette">
              ` : ''}
              <button class="btn-batch-finish" onclick="finishBatch('${prod.id}', '${batch.id}')" title="Sortie de stock / Clôturer ce lot pour le registre HACCP">
                <i class="fa-solid fa-check"></i> Terminé
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    } else {
      html += `
        <div class="no-batch-info">
          <i class="fa-regular fa-calendar-xmark"></i> Aucune DLC active renseignée
        </div>
      `;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

function updateKpiCounts() {
  let red = 0;
  let orange = 0;
  let green = 0;

  products.forEach(prod => {
    const status = getProductStatus(prod);
    // Distinction stricte : SEULES les DLC échues (risque sanitaire) comptent dans le rouge !
    if (status === 'red') red++;
    else if (status === 'critical-dlc' || status === 'orange' || status === 'orange-dluo') orange++;
    else if (status === 'green' || status === 'dluo-exceeded') green++;
  });

  const redEl = document.getElementById('count-red');
  const orangeEl = document.getElementById('count-orange');
  const greenEl = document.getElementById('count-green');
  const totalEl = document.getElementById('count-total');

  if (redEl) redEl.textContent = red;
  if (orangeEl) orangeEl.textContent = orange;
  if (greenEl) greenEl.textContent = green;
  if (totalEl) totalEl.textContent = products.length;
}

// =============================================================================
// 6. ALERTES CRITIQUES DLC ≤ 3J & CONFIRMATION MULTI-LOTS
// =============================================================================

function renderCriticalDlcAlerts() {
  const container = document.getElementById('critical-dlc-alerts');
  if (!container) return;

  const criticals = [];
  products.forEach(prod => {
    if (prod.batches && prod.batches.length > 0) {
      prod.batches.forEach((batch, idx) => {
        const isDLC = (batch.type || 'DLC') === 'DLC';
        // RÈGLE STRICTE : Exclusion des DLUO/DDM. Uniquement les denrées sous DLC impérative.
        if (!isDLC) return;

        const days = getDaysRemaining(batch.dlc);
        const snoozeUntil = localStorage.getItem('snooze_crit_' + batch.id);
        const isSnoozed = snoozeUntil && Date.now() < parseInt(snoozeUntil, 10);

        // Alerte critique si DLC arrive à échéance entre 0 et 3 jours (J-3, J-2, J-1, J-0)
        if (days !== null && days <= 3 && days >= 0 && !isSnoozed) {
          criticals.push({
            productId: prod.id,
            productName: prod.name,
            batchId: batch.id,
            lotNum: idx + 1,
            days: days,
            dateStr: formatDateFr(batch.dlc),
            multiple: prod.batches.length > 1
          });
        }
      });
    }
  });

  if (criticals.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  // Trier par urgence croissante (J-0 en premier)
  criticals.sort((a, b) => a.days - b.days);

  let itemsHtml = '';
  criticals.forEach(item => {
    let urgencyText = '';
    if (item.days === 0) {
      urgencyText = `<strong style="color:var(--status-red);">Échoit AUJOURD'HUI</strong>`;
    } else if (item.days === 1) {
      urgencyText = `<strong style="color:#fbbf24;">Échoit DEMAIN (J-1)</strong>`;
    } else {
      urgencyText = `<strong style="color:#fbbf24;">Échoit dans ${item.days} jours (J-${item.days})</strong>`;
    }

    const lotLabel = item.multiple ? ` (Lot ${item.lotNum})` : '';

    itemsHtml += `
      <div class="critical-dlc-item">
        <div class="critical-dlc-info">
          <span>🔥 <strong>${escapeHtml(item.productName)}</strong>${lotLabel} &bull; DLC : ${item.dateStr} &bull; ${urgencyText}</span>
        </div>
        <div class="critical-dlc-actions">
          <button class="btn-critical-consumed" onclick="finishBatch('${item.productId}', '${item.batchId}')" title="Sortir du stock">
            <i class="fa-solid fa-check"></i> Sortir du stock
          </button>
          <button class="btn-batch-finish" style="padding:6px 10px;" onclick="snoozeCriticalAlert('${item.batchId}')" title="Masquer l'alerte pour ce shift (12h)">
            <i class="fa-regular fa-clock"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="critical-dlc-banner">
      <div class="critical-dlc-header">
        <i class="fa-solid fa-fire-flame-curved"></i>
        <span>ALERTE DLC CRITIQUE &le; 3 JOURS (À CONSOMMER EN PRIORITÉ)</span>
      </div>
      <div class="critical-dlc-list">
        ${itemsHtml}
      </div>
    </div>
  `;
  container.classList.remove('hidden');
}

function snoozeCriticalAlert(batchId) {
  const expiry = Date.now() + 12 * 60 * 60 * 1000; // 12h de répit pour le shift
  localStorage.setItem('snooze_crit_' + batchId, expiry.toString());
  renderCriticalDlcAlerts();
}

function renderMultiLotAlerts() {
  const container = document.getElementById('multi-lot-alerts');
  if (!container) return;

  const alerts = [];
  products.forEach(prod => {
    if (prod.batches && prod.batches.length > 1) {
      // Produit avec stock multiple (ex: plusieurs paquets de pâtes à pizza)
      prod.batches.forEach((batch, idx) => {
        const days = getDaysRemaining(batch.dlc);
        const snoozeUntil = localStorage.getItem('snooze_lot_' + batch.id);
        const isSnoozed = snoozeUntil && Date.now() < parseInt(snoozeUntil, 10);
        // Alerte si le lot arrive à échéance (≤ 7 jours) et pas encore confirmé aujourd'hui
        if (days !== null && days <= 7 && !isSnoozed) {
          alerts.push({
            productId: prod.id,
            productName: prod.name,
            batchId: batch.id,
            lotNum: idx + 1,
            days: days,
            dateStr: formatDateFr(batch.dlc),
            type: batch.type || 'DLC'
          });
        }
      });
    }
  });

  if (alerts.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  let html = '';
  alerts.forEach(item => {
    const isExpired = item.days <= 0;
    const timeText = isExpired
      ? `<strong style="color:var(--status-red);">${item.days === 0 ? "aujourd'hui" : Math.abs(item.days) + 'j de retard'}</strong>`
      : `dans <strong>${item.days} jour(s)</strong> (${item.dateStr})`;

    html += `
      <div class="multi-lot-alert-card">
        <div class="alert-card-header">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Vérification Stock Multi-Lots</span>
        </div>
        <div class="alert-card-question">
          Le <strong>Lot ${item.lotNum}</strong> de <strong>${item.productName}</strong> (${item.type} ${item.dateStr}) arrive à échéance ${timeText}. A-t-il été consommé au bar ?
        </div>
        <div class="alert-card-actions">
          <button class="btn-confirm-consumed" onclick="confirmBatchConsumed('${item.productId}', '${item.batchId}')">
            <i class="fa-solid fa-check"></i> Oui, lot terminé
          </button>
          <button class="btn-keep-stock" onclick="snoozeBatchAlert('${item.batchId}')">
            Non, encore en stock
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  container.classList.remove('hidden');
}

function confirmBatchConsumed(productId, batchId) {
  const prod = products.find(p => p.id === productId);
  if (!prod || !prod.batches) return;
  const batch = prod.batches.find(b => b.id === batchId);
  if (batch) {
    archiveBatchRecord(prod, batch, 'consumed');
  }
  prod.batches = prod.batches.filter(b => b.id !== batchId);
  saveProductsToStorage(prod);
  renderProducts();
  renderCriticalDlcAlerts();
  renderMultiLotAlerts();
  if (navigator.vibrate) navigator.vibrate(35);
}

function snoozeBatchAlert(batchId) {
  const expiry = Date.now() + 12 * 60 * 60 * 1000; // 12h de répit pour le shift
  localStorage.setItem('snooze_lot_' + batchId, expiry.toString());
  renderMultiLotAlerts();
}

function getAllCategories() {
  const baseCategories = [
    { id: 'charcuterie', label: '🥓 Charcuterie' },
    { id: 'fromage', label: '🧀 Fromages' },
    { id: 'pate', label: '🍕 Pâtes & Pain' }
  ];

  const found = new Map();
  baseCategories.forEach(c => found.set(c.id, c.label));

  // Scanner toutes les catégories existantes dans la liste des produits actifs
  products.forEach(p => {
    if (p.category && !found.has(p.category)) {
      found.set(p.category, getCategoryLabel(p.category));
    }
  });

  return Array.from(found.entries()).map(([id, label]) => ({ id, label }));
}

function renderCategoryTabs() {
  const nav = document.getElementById('category-tabs-nav') || document.querySelector('.category-tabs');
  if (!nav) return;

  const categories = getAllCategories();

  // Si la catégorie actuellement filtrée n'existe plus dans le stock, retour sur 'all'
  if (currentFilterCategory !== 'all' && !categories.some(c => c.id === currentFilterCategory)) {
    currentFilterCategory = 'all';
  }

  let html = `<button class="tab-btn ${currentFilterCategory === 'all' ? 'active' : ''}" id="tab-all" onclick="switchCategory('all')">Tous</button>`;

  categories.forEach(cat => {
    const isActive = currentFilterCategory === cat.id ? 'active' : '';
    html += `<button class="tab-btn ${isActive}" id="tab-${cat.id}" onclick="switchCategory('${cat.id}')">${escapeHtml(cat.label)}</button>`;
  });

  nav.innerHTML = html;
}

function switchCategory(cat) {
  currentFilterCategory = cat;
  renderCategoryTabs();
  renderProducts();
}

function filterByStatus(status) {
  currentFilterStatus = status;
  renderProducts();
}

function getCategoryLabel(cat) {
  if (!cat) return '🥫 Autre';
  switch (cat) {
    case 'charcuterie': return '🥓 Charcuterie';
    case 'fromage': return '🧀 Fromage';
    case 'pate': return '🍕 Pâte & Pain';
    case 'autre': return '🥫 Autre';
    default: {
      const clean = cat.replace(/_/g, ' ');
      const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
      return `🏷️ ${capitalized}`;
    }
  }
}

function getStatusBadgeText(batchOrDays) {
  let days, type;
  if (typeof batchOrDays === 'object' && batchOrDays !== null) {
    days = getDaysRemaining(batchOrDays.dlc);
    type = batchOrDays.type || 'DLC';
  } else {
    days = batchOrDays;
    type = 'DLC';
  }

  if (type === 'DLC') {
    if (days < 0) return `Périmé (${Math.abs(days)}j)`;
    if (days === 0) return `Périme AUJOURD'HUI`;
    if (days === 1) return `Demain (J-1)`;
    if (days === 2) return `J-2 (Urgent)`;
    if (days === 3) return `J-3 (Priorité)`;
    return `Dans ${days} jours`;
  } else {
    // DLUO / DDM
    if (days < 0) return `DLUO passée (+${Math.abs(days)}j)`;
    if (days === 0) return `DLUO ce jour`;
    if (days <= 7) return `DLUO dans ${days}j`;
    return `DLUO : ${days}j`;
  }
}

function formatDateFr(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTimeFr(isoDateStr) {
  if (!isoDateStr) return '';
  try {
    const d = new Date(isoDateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoDateStr;
  }
}

// =============================================================================
// 7. MODALE SAISIE DLC & CONSERVATION (DLC vs DLUO)
// =============================================================================

function openDlcModal(productId) {
  activeEditingProductId = productId;
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('modal-product-name').textContent = prod.name;
  document.getElementById('modal-category').textContent = getCategoryLabel(prod.category);
  
  // Date par défaut : aujourd'hui + 7 jours
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  document.getElementById('input-dlc-date').value = defaultDate.toISOString().split('T')[0];
  
  // Type par défaut : DLC
  toggleConservationType('DLC');

  // Reset champs & OCR
  document.getElementById('input-lot-note').value = '';
  resetOcrStatus();
  removePhoto();

  // Gestion du choix Remplacement vs 2e Lot
  const choiceContainer = document.getElementById('batch-choice-container');
  if (prod.batches && prod.batches.length > 0) {
    choiceContainer.classList.remove('hidden');
    toggleBatchAction('replace');
  } else {
    choiceContainer.classList.add('hidden');
  }

  document.getElementById('dlc-modal').classList.remove('hidden');
}

function closeDlcModal() {
  document.getElementById('dlc-modal').classList.add('hidden');
  activeEditingProductId = null;
  removePhoto();
  resetOcrStatus();
}

function toggleBatchAction(action) {
  const radio = document.querySelector(`input[name="batchAction"][value="${action}"]`);
  if (radio) radio.checked = true;

  document.getElementById('label-replace').classList.toggle('active', action === 'replace');
  document.getElementById('label-add').classList.toggle('active', action === 'add');
}

function toggleConservationType(type) {
  const radio = document.querySelector(`input[name="conservationType"][value="${type}"]`);
  if (radio) radio.checked = true;

  document.getElementById('label-type-dlc').classList.toggle('active', type === 'DLC');
  document.getElementById('label-type-dluo').classList.toggle('active', type === 'DLUO');

  const titleEl = document.getElementById('label-date-title');
  if (titleEl) {
    titleEl.textContent = type === 'DLC' 
      ? "Date Limite de Consommation (DLC - impératif)" 
      : "Date de Durabilité Minimale (DLUO - de préférence)";
  }
}

function addDaysToDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  document.getElementById('input-dlc-date').value = date.toISOString().split('T')[0];
}

function saveDlc() {
  const prod = products.find(p => p.id === activeEditingProductId);
  if (!prod) return;

  const dlcDate = document.getElementById('input-dlc-date').value;
  if (!dlcDate) {
    alert('Veuillez sélectionner une date de péremption.');
    return;
  }

  const typeRadio = document.querySelector('input[name="conservationType"]:checked');
  const conservationType = typeRadio ? typeRadio.value : 'DLC';
  const note = document.getElementById('input-lot-note').value.trim();
  const actionRadio = document.querySelector('input[name="batchAction"]:checked');
  const batchAction = actionRadio ? actionRadio.value : 'replace';

  const newBatch = {
    id: 'batch_' + Date.now(),
    dlc: dlcDate,
    type: conservationType,
    photo: currentUploadedPhotoBase64,
    note: note,
    updatedAt: new Date().toISOString()
  };

  if (!prod.batches) prod.batches = [];

  if (batchAction === 'replace' || prod.batches.length === 0) {
    // Remplacement direct (écrase les lots en cours)
    prod.batches = [newBatch];
  } else {
    // Ajout d'un lot supplémentaire
    prod.batches.push(newBatch);
  }

  // Trier les lots par date croissante
  prod.batches.sort((a, b) => new Date(a.dlc) - new Date(b.dlc));

  saveProductsToStorage(prod);
  renderProducts();
  closeDlcModal();
}

function archiveBatchRecord(prod, batch, reason = 'consumed') {
  const archiveItem = {
    archiveId: 'arch_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    productId: prod.id,
    productName: prod.name,
    category: prod.category,
    batchId: batch.id,
    dlc: batch.dlc,
    type: batch.type || 'DLC',
    note: batch.note || '',
    photo: batch.photo || null,
    reason: reason, // 'consumed' | 'discarded'
    closedAt: new Date().toISOString()
  };

  archivedBatches.unshift(archiveItem);
  localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(archivedBatches));
  updateArchiveBadge();

  if (db) {
    db.collection('archived_batches').doc(archiveItem.archiveId).set(archiveItem)
      .catch(err => console.warn('Erreur archivage Cloud:', err));
  }
}

function finishBatch(productId, batchId) {
  const prod = products.find(p => p.id === productId);
  if (!prod || !prod.batches) return;
  const batch = prod.batches.find(b => b.id === batchId);
  if (!batch) return;

  pendingFinishBatch = { productId, batchId, prod, batch };

  const nameEl = document.getElementById('finish-modal-product-name');
  const descEl = document.getElementById('finish-modal-desc');
  if (nameEl) {
    nameEl.textContent = `${prod.name} (${batch.type || 'DLC'} ${formatDateFr(batch.dlc)})`;
  }
  if (descEl) {
    descEl.textContent = `Sortie de stock sanitaire. Choisissez le motif pour le registre officiel HACCP :`;
  }

  const modal = document.getElementById('finish-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeFinishModal() {
  const modal = document.getElementById('finish-modal');
  if (modal) modal.classList.add('hidden');
  pendingFinishBatch = null;
}

function confirmFinishWithReason(reason) {
  if (!pendingFinishBatch) return;
  const { productId, batchId, prod, batch } = pendingFinishBatch;

  archiveBatchRecord(prod, batch, reason);

  prod.batches = prod.batches.filter(b => b.id !== batchId);
  saveProductsToStorage(prod);
  closeFinishModal();
  renderProducts();
  updateKpiCounts();
  renderCriticalDlcAlerts();
  renderMultiLotAlerts();
  if (navigator.vibrate) navigator.vibrate(40);
}

function updateArchiveBadge() {
  const el = document.getElementById('archive-count-badge');
  if (el) el.textContent = archivedBatches.length;
}

function openArchivesModal() {
  renderArchivesList();
  const modal = document.getElementById('archives-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeArchivesModal() {
  const modal = document.getElementById('archives-modal');
  if (modal) modal.classList.add('hidden');
}

function renderArchivesList() {
  const container = document.getElementById('archives-list');
  if (!container) return;

  if (!archivedBatches || archivedBatches.length === 0) {
    container.innerHTML = `
      <div class="archive-empty-msg">
        <i class="fa-solid fa-box-archive" style="font-size: 2.2rem; color: var(--color-gold); margin-bottom: 12px;"></i>
        <p>Aucun lot archivé dans le registre sanitaire pour l'instant.</p>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">Dès qu'un lot actif est marqué "Terminé" ou mis au rebut, il est archivé ici pour les contrôles d'hygiène DDPP.</p>
      </div>
    `;
    return;
  }

  let html = '';
  archivedBatches.forEach((item) => {
    const isConsumed = item.reason === 'consumed';
    const tagHtml = isConsumed
      ? `<span class="archive-tag consumed"><i class="fa-solid fa-utensils"></i> Consommé au bar</span>`
      : `<span class="archive-tag discarded"><i class="fa-solid fa-trash-can"></i> Mis au rebut</span>`;

    const closedDateFormatted = formatDateTimeFr(item.closedAt);
    const dlcFormatted = formatDateFr(item.dlc);
    const typeBadge = (item.type || 'DLC') === 'DLC'
      ? `<span class="badge-type-dlc">DLC</span>`
      : `<span class="badge-type-dluo">DLUO</span>`;

    html += `
      <div class="archive-card">
        <div class="archive-card-left">
          <div class="archive-card-title">${escapeHtml(item.productName)}</div>
          <div class="archive-card-meta">
            ${tagHtml}
            <span>${typeBadge} : <strong>${dlcFormatted}</strong></span>
            ${item.note ? ` &bull; <span>Lot : ${escapeHtml(item.note)}</span>` : ''}
            <div style="margin-top:4px; color:var(--text-muted); font-size:0.7rem;">
              <i class="fa-regular fa-calendar-check"></i> Clôturé le ${closedDateFormatted}
            </div>
          </div>
        </div>
        ${item.photo ? `
          <div class="archive-card-right">
            <img src="${item.photo}" class="batch-photo-thumb" alt="Étiquette" onclick="openLightbox('${item.photo}', 'Archive : ${escapeHtml(item.productName)}')" title="Voir l'étiquette">
          </div>
        ` : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

function deleteProduct(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  const confirmMsg = `Retirer "${prod.name}" de la liste des DLC ?\n\n(Pratique si vous n'en servez plus en ce moment. Vous pourrez le réajouter à tout moment via "+ Ajouter un produit")`;
  if (confirm(confirmMsg)) {
    products = products.filter(p => p.id !== productId);
    deleteProductFromCloud(productId);
    saveProductsToStorage();
    renderCategoryTabs();
    renderProducts();
  }
}

function restoreDefaultCatalogue() {
  if (confirm('Restaurer tous les 10 produits de base de la carte Food ?\n(Vos DLC déjà saisies pour ces produits seront conservées)')) {
    DEFAULT_PRODUCTS.forEach(defProd => {
      const existing = products.find(p => p.id === defProd.id);
      if (!existing) {
        products.push({ ...defProd, batches: [] });
      }
    });
    saveProductsToStorage();
    renderCategoryTabs();
    renderProducts();
    closeSettingsModal();
    alert('Catalogue restauré avec succès !');
  }
}

// =============================================================================
// 8. OCR INTELLIGENT D'ÉTIQUETTE (Date, Lot, DLC vs DLUO)
// =============================================================================

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.getElementById('compress-canvas');
      const ctx = canvas.getContext('2d');

      const MAX_DIM = 900;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Compression JPEG 0.72 (~80-120Ko) pour affichage et stockage
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
      currentUploadedPhotoBase64 = compressedDataUrl;

      // Affichage aperçu
      document.getElementById('img-preview').src = compressedDataUrl;
      document.getElementById('photo-preview-box').classList.remove('hidden');
      document.getElementById('btn-camera-label').classList.add('hidden');

      // Pré-traitement spécifique OCR : N&B + rehaussement de contraste pour matrices de points et étiquettes thermiques
      const ocrOptimizedDataUrl = preprocessImageForOcr(canvas);

      // Lancement immédiat de l'analyse OCR intelligente calibrée
      triggerOcrAnalysis(ocrOptimizedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function preprocessImageForOcr(canvas) {
  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = canvas.width;
  ocrCanvas.height = canvas.height;
  const ocrCtx = ocrCanvas.getContext('2d');
  ocrCtx.drawImage(canvas, 0, 0);

  try {
    const imgData = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const data = imgData.data;
    const contrast = 1.4; // 40% de contraste en plus
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ocrCtx.putImageData(imgData, 0, 0);
    return ocrCanvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    return canvas.toDataURL('image/jpeg', 0.75);
  }
}

async function triggerOcrAnalysis(imageDataUrl) {
  const statusBox = document.getElementById('ocr-status-box');
  const loadingEl = document.getElementById('ocr-loading');
  const successEl = document.getElementById('ocr-success');
  const successText = document.getElementById('ocr-success-text');

  if (!window.Tesseract) {
    console.log('Tesseract OCR non disponible, saisie manuelle.');
    return;
  }

  statusBox.classList.remove('hidden');
  loadingEl.classList.remove('hidden');
  successEl.classList.add('hidden');

  try {
    const result = await Tesseract.recognize(imageDataUrl, 'fra+eng', {
      logger: m => {
        if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
          const pct = Math.round((m.progress || 0) * 100);
          loadingEl.innerHTML = `
            <i class="fa-solid fa-wand-magic-sparkles fa-spin text-gold"></i>
            <span>Chargement du scanner (${pct}%)...</span>
          `;
        } else if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          loadingEl.innerHTML = `
            <i class="fa-solid fa-wand-magic-sparkles fa-spin text-gold"></i>
            <span>Lecture de l'étiquette (${pct}%)...</span>
          `;
        }
      }
    });

    const rawText = result && result.data ? result.data.text : '';
    console.log('Texte OCR brut:', rawText);

    const parsed = parseOcrLabelText(rawText);
    const detected = [];

    if (parsed.date) {
      document.getElementById('input-dlc-date').value = parsed.date;
      detected.push(`Date : ${formatDateFr(parsed.date)}`);
    }

    if (parsed.type) {
      toggleConservationType(parsed.type);
      detected.push(`Type : ${parsed.type}`);
    }

    if (parsed.lot) {
      document.getElementById('input-lot-note').value = parsed.lot;
      detected.push(`Lot : ${parsed.lot}`);
    }

    loadingEl.classList.add('hidden');
    if (detected.length > 0) {
      successText.textContent = `✨ Détecté : ${detected.join(' | ')}`;
      successEl.classList.remove('hidden');
      if (navigator.vibrate) navigator.vibrate(35);
    } else {
      successText.textContent = `Photo nette enregistrée. Vérifiez la date ci-dessous.`;
      successEl.classList.remove('hidden');
    }
  } catch (err) {
    console.warn('Erreur analyse OCR:', err);
    loadingEl.classList.add('hidden');
    successText.textContent = `Photo enregistrée. Vous pouvez ajuster les champs manuellement.`;
    successEl.classList.remove('hidden');
  }
}

function parseOcrLabelText(rawText) {
  const text = rawText.replace(/\r?\n/g, ' ');
  const lower = text.toLowerCase();

  // 1. Extraction de toutes les dates candidates
  const foundDates = [];
  
  // Format numérique : DD/MM/YYYY, DD.MM.YY, DD-MM-YYYY, etc.
  const numericDateRegex = /\b(0?[1-9]|[12][0-9]|3[01])[\/\.\-](0?[1-9]|1[012])[\/\.\-](20\d\d|\d{2})\b/g;
  let match;
  while ((match = numericDateRegex.exec(text)) !== null) {
    let day = match[1].padStart(2, '0');
    let month = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) year = '20' + year;
    foundDates.push({
      iso: `${year}-${month}-${day}`,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0]
    });
  }

  // Format texte en français : "15 SEPT 2026", "24 OCTOBRE 26"
  const frenchMonths = {
    'jan': '01', 'fev': '02', 'mar': '03', 'avr': '04', 'mai': '05', 'jui': '06',
    'jul': '07', 'aou': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  const textDateRegex = /\b(0?[1-9]|[12][0-9]|3[01])\s+([a-zA-Zàâéèêîïôûç]{3,9})\.?\s+(20\d\d|\d{2})\b/gi;
  while ((match = textDateRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    let mWord = match[2].toLowerCase().substring(0, 3)
      .replace('é', 'e').replace('û', 'u').replace('ô', 'o');
    let year = match[3];
    if (year.length === 2) year = '20' + year;
    if (frenchMonths[mWord]) {
      foundDates.push({
        iso: `${year}-${frenchMonths[mWord]}-${day}`,
        start: match.index,
        end: match.index + match[0].length,
        raw: match[0]
      });
    }
  }

  // 2. Zones de Date d'Emballage (À EXCLURE ABSOLUMENT)
  // "Emballé le", "Emb le", "Emb.", "Fabriqué le", "Fab le", "Date fabrication", "Conditionné le"
  const packagingRegex = /(?:emball[eé]\s*le|emb\.?\s*le|emb\.?\s*:|date\s*d['’]emballage|fabriqu[eé]\s*le|fab\.?\s*le|fab\.?\s*:|date\s*fabrication|conditionn[eé]\s*le|date\s*conditionnement|\bpck\b|\bpack\b)/gi;
  const packagingPositions = [];
  while ((match = packagingRegex.exec(lower)) !== null) {
    packagingPositions.push({ start: match.index, end: match.index + match[0].length });
  }

  // 3. Zones de Consommation DLC vs DLUO
  // DLC : "A consommer jusqu'au", "Consommer jusqu'a", "Jusqu'au", "DLC"
  const dlcRegex = /(?:a\s*consommer\s*jusqu['’]?(?:au|a)|consommer\s*jusqu['’]?(?:au|a)|jusqu['’]?(?:au|a)|\bdlc\b|au\s*plus\s*tard\s*le)/gi;
  const dlcPositions = [];
  while ((match = dlcRegex.exec(lower)) !== null) {
    dlcPositions.push({ start: match.index, end: match.index + match[0].length });
  }

  // DLUO : "A consommer de preference avant", "De preference avant", "A consommer avant", "DLUO", "DDM"
  const dluoRegex = /(?:a\s*consommer\s*de\s*pr[eé]f[eé]rence\s*avant\s*(?:le)?|de\s*pr[eé]f[eé]rence\s*avant\s*(?:le)?|a\s*consommer\s*avant\s*(?:le)?|\bdluo\b|\bddm\b|durabilit[eé]\s*minimale)/gi;
  const dluoPositions = [];
  while ((match = dluoRegex.exec(lower)) !== null) {
    dluoPositions.push({ start: match.index, end: match.index + match[0].length });
  }

  // 4. Scoring de proximité pour éliminer la date d'emballage et élire la vraie DLC/DLUO
  const scoredDates = [];
  foundDates.forEach(d => {
    let score = 0;
    const datePos = d.start;
    let detectedType = 'DLC';

    // Pénalité massive si la date suit une mention d'emballage (< 45 caractères)
    let isPackagingDate = false;
    packagingPositions.forEach(p => {
      const dist = datePos - p.end;
      if (dist >= 0 && dist <= 45) {
        isPackagingDate = true;
      }
    });
    if (isPackagingDate) {
      score -= 1000;
    }

    // Bonus proximité DLC
    dlcPositions.forEach(p => {
      const dist = datePos - p.end;
      if (dist >= 0 && dist <= 50) {
        score += 1500;
        detectedType = 'DLC';
      } else if (Math.abs(dist) <= 15) {
        score += 800;
        detectedType = 'DLC';
      }
    });

    // Bonus proximité DLUO
    dluoPositions.forEach(p => {
      const dist = datePos - p.end;
      if (dist >= 0 && dist <= 50) {
        score += 1500;
        detectedType = 'DLUO';
      } else if (Math.abs(dist) <= 15) {
        score += 800;
        detectedType = 'DLUO';
      }
    });

    // Bonus si la date est future (une DLC est par définition postérieure à l'emballage)
    try {
      const [y, m, dayNum] = d.iso.split('-').map(Number);
      const targetDate = new Date(y, m - 1, dayNum);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (targetDate >= now) {
        score += 200;
      }
    } catch (e) {}

    scoredDates.push({
      iso: d.iso,
      score: score,
      type: detectedType,
      raw: d.raw
    });
  });

  scoredDates.sort((a, b) => b.score - a.score);

  let bestDate = scoredDates.length > 0 ? scoredDates[0].iso : null;
  let bestType = scoredDates.length > 0 ? scoredDates[0].type : 'DLC';

  // Si score faible mais mots-clés présents globalement
  if (scoredDates.length > 0 && scoredDates[0].score < 500) {
    if (dluoPositions.length > 0 && dlcPositions.length === 0) {
      bestType = 'DLUO';
    } else if (dlcPositions.length > 0 && dluoPositions.length === 0) {
      bestType = 'DLC';
    }
  }

  // 5. Extraction Calibrée du Numéro de Lot (suite de 5 à 10 chiffres en priorité)
  let bestLot = null;

  // Priorité 1 : Mot-clé Lot / L / N° suivi de 5 à 10 chiffres
  const lotKwDigitMatch = lower.match(/(?:lot|n[°o]|l[\.:\s])\s*[:.\s]?\s*(\d{5,10})\b/i);
  if (lotKwDigitMatch) {
    bestLot = lotKwDigitMatch[1];
  } else {
    // Priorité 2 : Mot-clé Lot / L / N° suivi de 4 à 10 caractères alphanumériques
    const lotKwAlphanumMatch = lower.match(/(?:lot|n[°o]|l[\.:\s])\s*[:.\s]?\s*([a-z0-9\-_]{4,10})\b/i);
    if (lotKwAlphanumMatch) {
      bestLot = lotKwAlphanumMatch[1].toUpperCase();
    } else {
      // Priorité 3 : Suite isolée de 5 à 10 chiffres (non contenue dans les dates)
      const digitMatches = text.match(/\b\d{5,10}\b/g);
      if (digitMatches) {
        for (let num of digitMatches) {
          if (!foundDates.some(fd => fd.raw.includes(num))) {
            bestLot = num;
            break;
          }
        }
      }
    }
  }

  return { date: bestDate, type: bestType, lot: bestLot };
}

function resetOcrStatus() {
  const box = document.getElementById('ocr-status-box');
  const loading = document.getElementById('ocr-loading');
  const success = document.getElementById('ocr-success');
  if (box) box.classList.add('hidden');
  if (loading) {
    loading.classList.add('hidden');
    loading.innerHTML = `
      <i class="fa-solid fa-wand-magic-sparkles fa-spin text-gold"></i>
      <span>Lecture intelligente de la date et du lot...</span>
    `;
  }
  if (success) success.classList.add('hidden');
}

function removePhoto() {
  currentUploadedPhotoBase64 = null;
  const previewBox = document.getElementById('photo-preview-box');
  const cameraLabel = document.getElementById('btn-camera-label');
  const cameraInput = document.getElementById('camera-input');

  if (previewBox) previewBox.classList.add('hidden');
  if (cameraLabel) cameraLabel.classList.remove('hidden');
  if (cameraInput) cameraInput.value = '';
  resetOcrStatus();
}

function openLightbox(photoSrc, caption) {
  document.getElementById('lightbox-img').src = photoSrc;
  document.getElementById('lightbox-caption').textContent = caption || 'Étiquette traçabilité';
  document.getElementById('lightbox-modal').classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox-modal').classList.add('hidden');
}

// =============================================================================
// 9. ENVOI SUR LE GROUPE WHATSAPP
// =============================================================================

function shareToWhatsAppGroup() {
  const todayOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = new Date().toLocaleDateString('fr-FR', todayOptions);
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const expiredDlcList = [];
  const expiredDluoList = [];
  const criticalDlcList = []; // J-3, J-2, J-1, J-0 STRICTEMENT DLC
  const urgentDlcList = [];   // J-4 à J-7 DLC
  const approachingDluoList = []; // DLUO ≤ 7j
  const multiLotCheckList = [];
  const okList = [];
  const emptyList = [];

  products.forEach(prod => {
    if (!prod.batches || prod.batches.length === 0) {
      emptyList.push(prod.name);
      return;
    }

    // Détection multi-lots à confirmer
    if (prod.batches.length > 1) {
      const olderBatch = prod.batches[0];
      const olderDays = getDaysRemaining(olderBatch.dlc);
      if (olderDays !== null && olderDays <= 7) {
        multiLotCheckList.push(`• *${prod.name}* : Le Lot 1 (${olderBatch.type || 'DLC'} ${formatDateFr(olderBatch.dlc)}) est-il consommé pour entamer le Lot 2 ?`);
      }
    }

    prod.batches.forEach((batch, idx) => {
      const days = getDaysRemaining(batch.dlc);
      if (days === null) return;
      const batchLabel = prod.batches.length > 1 ? `${prod.name} (Lot ${idx + 1})` : prod.name;
      const formattedDate = formatDateFr(batch.dlc);
      const isDLC = (batch.type || 'DLC') === 'DLC';

      if (isDLC) {
        if (days <= 0) {
          expiredDlcList.push(`• 🔴 *${batchLabel}* : Échu le ${formattedDate} (${days === 0 ? "AUJOURD'HUI" : Math.abs(days) + 'j de retard'}) ⚠️ RETIRER DU SERVICE`);
        } else if (days <= 3) {
          criticalDlcList.push(`• 🔥 *${batchLabel}* : dans *${days} jour(s)* (${formattedDate})`);
        } else if (days <= 7) {
          urgentDlcList.push(`• 🟠 *${batchLabel}* : dans *${days} jour(s)* (${formattedDate})`);
        } else {
          okList.push(`${prod.name} (${formattedDate})`);
        }
      } else {
        // DLUO / DDM (Sécurité sanitaire garantie, qualité à apprécier)
        if (days <= 0) {
          expiredDluoList.push(`• 🔵 *${batchLabel}* [DLUO] : Passée le ${formattedDate} (Vente autorisée - Vérifier aspect/goût)`);
        } else if (days <= 7) {
          approachingDluoList.push(`• 🔵 *${batchLabel}* [DLUO] : dans *${days} jour(s)* (${formattedDate})`);
        } else {
          okList.push(`${prod.name} [DLUO] (${formattedDate})`);
        }
      }
    });
  });

  // Construction du message WhatsApp
  let msg = `🍺 *BOB • POINT DLC & HYGIÈNE* 🍺\n`;
  msg += `📅 _${capitalizedDate}_\n\n`;

  if (multiLotCheckList.length > 0) {
    msg += `⚠️ *À VÉRIFIER AU BAR (Multi-lots) :*\n`;
    msg += multiLotCheckList.join('\n') + `\n\n`;
  }

  if (criticalDlcList.length > 0) {
    msg += `🔥 *ALERTES DLC CRITIQUES (≤ 3 JOURS) :*\n`;
    msg += criticalDlcList.join('\n') + `\n\n`;
  }

  if (expiredDlcList.length > 0) {
    msg += `🔴 *DLC PÉRIMÉES (DANGER SANITAIRE - RETRAIT IMMÉDIAT) :*\n`;
    msg += expiredDlcList.join('\n') + `\n\n`;
  } else {
    msg += `🔴 *DLC Périmées :* Aucune ✅\n\n`;
  }

  if (urgentDlcList.length > 0) {
    msg += `🟠 *DLC À PASSER EN PRIORITÉ (≤ 7 jours) :*\n`;
    msg += urgentDlcList.join('\n') + `\n\n`;
  }

  if (expiredDluoList.length > 0) {
    msg += `ℹ️ *DLUO/DDM DÉPASSÉES (Vente autorisée) :*\n`;
    msg += expiredDluoList.join('\n') + `\n\n`;
  }

  if (approachingDluoList.length > 0) {
    msg += `🔵 *DLUO sous 7 jours :*\n`;
    msg += approachingDluoList.join('\n') + `\n\n`;
  }

  if (okList.length > 0) {
    msg += `🟢 *Stock Conforme (> 7 jours) :*\n`;
    msg += `_${okList.slice(0, 5).join(', ')}${okList.length > 5 ? ' et ' + (okList.length - 5) + ' autres...' : ''}_\n\n`;
  }

  if (emptyList.length > 0) {
    msg += `⚪ *Sans DLC :* ${emptyList.join(', ')}\n\n`;
  }

  msg += `📲 *Mettre à jour l'outil :* https://www.boblyon.fr/dlc/`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// =============================================================================
// 10. AJOUT DE PRODUIT HORS-CARTE & EXPORT
// =============================================================================

function openAddProductModal() {
  const nameInput = document.getElementById('new-product-name');
  if (nameInput) nameInput.value = '';

  const catSelect = document.getElementById('new-product-category');
  if (catSelect) {
    const categories = getAllCategories();
    let opts = '';
    categories.forEach(cat => {
      opts += `<option value="${cat.id}">${escapeHtml(cat.label)}</option>`;
    });
    opts += `<option value="__custom__">➕ + Créer une nouvelle catégorie...</option>`;
    catSelect.innerHTML = opts;
    catSelect.value = categories[0] ? categories[0].id : 'charcuterie';
  }

  const customGroup = document.getElementById('custom-category-group');
  const customInput = document.getElementById('new-custom-category-name');
  if (customGroup) customGroup.classList.add('hidden');
  if (customInput) customInput.value = '';

  document.getElementById('add-product-modal').classList.remove('hidden');
}

function handleCategorySelectChange() {
  const catSelect = document.getElementById('new-product-category');
  const customGroup = document.getElementById('custom-category-group');
  const customInput = document.getElementById('new-custom-category-name');
  if (!catSelect || !customGroup) return;

  if (catSelect.value === '__custom__') {
    customGroup.classList.remove('hidden');
    if (customInput) customInput.focus();
  } else {
    customGroup.classList.add('hidden');
  }
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').classList.add('hidden');
}

function confirmAddProduct() {
  const nameInput = document.getElementById('new-product-name');
  const name = nameInput.value.trim();
  if (!name) {
    alert('Veuillez entrer un nom de produit.');
    return;
  }

  const catSelect = document.getElementById('new-product-category');
  let category = catSelect ? catSelect.value : 'autre';

  if (category === '__custom__') {
    const customInput = document.getElementById('new-custom-category-name');
    const customName = customInput ? customInput.value.trim() : '';
    if (!customName) {
      alert('Veuillez renseigner le nom de la nouvelle catégorie.');
      return;
    }
    // Génération d'un identifiant propre pour la catégorie
    category = customName.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!category) category = 'cat_' + Date.now();
  }

  let icon = '🏷️';
  if (category === 'fromage') icon = '🧀';
  else if (category === 'charcuterie') icon = '🥓';
  else if (category === 'pate') icon = '🍕';

  const newProd = {
    id: 'prod_' + Date.now(),
    name: name,
    category: category,
    icon: icon,
    batches: []
  };

  products.push(newProd);
  saveProductsToStorage();
  renderCategoryTabs();
  renderProducts();
  closeAddProductModal();
  openDlcModal(newProd.id);
}

function openSettingsModal() {
  document.getElementById('settings-new-pin').value = '';
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function exportDlcReport() {
  const todayIso = new Date().toISOString().split('T')[0];
  const nowFr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let csv = '\uFEFF';
  csv += '# =============================================================================\n';
  csv += '# REGISTRE OFFICIEL DE TRAÇABILITÉ SANITAIRE & PLAN DE MAÎTRISE SANITAIRE (PMS)\n';
  csv += '# Établissement : BOB • Blonde ou Brune (SARL BOB LYON)\n';
  csv += '# Adresse : 12 rue Imbert Colomès, 69001 Lyon\n';
  csv += `# Date et heure du relevé : ${nowFr}\n`;
  csv += '# Règlements CE 178/2002 (Art. 18) & CE 852/2004 - Contrôle officiel DDPP\n';
  csv += '# =============================================================================\n\n';

  csv += '### 1. STOCK ACTIF DE DENRÉES ALIMENTAIRES\n';
  csv += 'Catégorie;Produit;Numéro Lot Interne;Type (DLC/DLUO);Date Limite;Jours Restants;Statut Sanitaire;N° Lot Fabricant / Note;Photo Présente;Dernière Mise à Jour\n';

  products.forEach(prod => {
    if (!prod.batches || prod.batches.length === 0) {
      csv += `"${prod.category}";"${prod.name}";"Aucun";"N/A";"N/A";"N/A";"Non renseigné";"";"Non";"N/A"\n`;
    } else {
      prod.batches.forEach((b, idx) => {
        const days = getDaysRemaining(b.dlc);
        const status = getBatchStatus(b);
        const isDLC = (b.type || 'DLC') === 'DLC';
        let statusLabel = '';
        if (isDLC) {
          if (status === 'red') statusLabel = 'PÉRIMÉ (DANGER SANITAIRE)';
          else if (status === 'critical-dlc') statusLabel = 'CRITIQUE (≤ 3 jours)';
          else if (status === 'orange') statusLabel = 'À consommer (≤ 7 jours)';
          else statusLabel = 'Conforme (> 7 jours)';
        } else {
          if (status === 'dluo-exceeded') statusLabel = 'DLUO dépassée (autorisé à la vente)';
          else if (status === 'orange-dluo') statusLabel = 'DLUO proche (≤ 7 jours)';
          else statusLabel = 'Conforme (> 7 jours)';
        }
        csv += `"${prod.category}";"${prod.name}";"Lot ${idx + 1}";"${b.type || 'DLC'}";"${b.dlc}";"${days}";"${statusLabel}";"${b.note || ''}";"${b.photo ? 'Oui' : 'Non'}";"${b.updatedAt || ''}"\n`;
      });
    }
  });

  csv += '\n### 2. REGISTRE D\'ARCHIVES DES SORTIES DE STOCK (Conservation légale 6 mois - Art. 18 CE 178/2002)\n';
  csv += 'Date et Heure de Sortie;Motif de Sortie;Produit;Catégorie;Type (DLC/DLUO);Date Limite;N° Lot Fabricant;Photo Étiquette Archivée\n';

  if (!archivedBatches || archivedBatches.length === 0) {
    csv += '"Aucune archive pour le moment";"";"";"";"";"";"";""\n';
  } else {
    archivedBatches.forEach(item => {
      const reasonLabel = item.reason === 'consumed' ? 'Consommé au bar' : 'Mis au rebut (périmé ou altéré)';
      csv += `"${formatDateTimeFr(item.closedAt)}";"${reasonLabel}";"${item.productName}";"${item.category}";"${item.type || 'DLC'}";"${item.dlc}";"${item.note || ''}";"${item.photo ? 'Oui' : 'Non'}"\n`;
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RAPPORT_HACCP_BOB_${todayIso}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// =============================================================================
// SAUVEGARDE ET RESTAURATION LOCALE JSON
// =============================================================================

function exportBackupData() {
  const data = {
    app: 'BOB DLC',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    batchesCount: countTotalBatches(products),
    archivesCount: archivedBatches.length,
    products: products,
    archivedBatches: archivedBatches
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const todayIso = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `BOB_DLC_SAUVEGARDE_${todayIso}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function importBackupData(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data && Array.isArray(data.products)) {
        const count = countTotalBatches(data.products);
        const archCount = Array.isArray(data.archivedBatches) ? data.archivedBatches.length : 0;
        if (confirm(`Restaurer cette sauvegarde contenant ${data.products.length} produits (${count} lots actifs, ${archCount} archives) ?\n\nCela mettra également à jour le Cloud pour vos collègues.`)) {
          products = data.products;
          if (Array.isArray(data.archivedBatches)) {
            archivedBatches = data.archivedBatches;
            localStorage.setItem(STORAGE_KEYS.ARCHIVES, JSON.stringify(archivedBatches));
            updateArchiveBadge();
            // Pousser les archives vers le Cloud
            if (db) {
              archivedBatches.forEach(arch => {
                db.collection('archived_batches').doc(arch.archiveId).set(arch).catch(err => console.warn(err));
              });
            }
          }
          saveProductsToStorage();
          renderCategoryTabs();
          renderProducts();
          updateKpiCounts();
          renderCriticalDlcAlerts();
          renderMultiLotAlerts();
          alert('✅ Sauvegarde restaurée avec succès ! Les données sont enregistrées et envoyées au Cloud.');
          closeSettingsModal();
        }
      } else {
        alert('Fichier JSON invalide (format BOB DLC non reconnu).');
      }
    } catch (err) {
      alert('Erreur lors de la lecture du fichier JSON : ' + err.message);
    }
  };
  reader.readAsText(file);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
