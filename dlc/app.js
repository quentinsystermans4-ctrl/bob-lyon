/**
 * BOB • Suivi des DLC & Traçabilité Hygiène
 * Logique principale avec OCR d'étiquette, distinction DLC/DLUO et alertes multi-lots
 */

// =============================================================================
// 1. INITIALISATION & DONNÉES PAR DÉFAUT
// =============================================================================

const DEFAULT_PRODUCTS = [
  // Charcuterie
  { id: 'jambon_blanc', name: 'Jambon Blanc', category: 'charcuterie', icon: '🥓', batches: [] },
  { id: 'jambon_sec', name: 'Jambon Sec', category: 'charcuterie', icon: '🥓', batches: [] },
  { id: 'chorizo', name: 'Chorizo déjà tranché', category: 'charcuterie', icon: '🥓', batches: [] },
  
  // Fromages
  { id: 'camembert', name: 'Camembert', category: 'fromage', icon: '🧀', batches: [] },
  { id: 'saint_marcellin', name: 'Saint Marcelin', category: 'fromage', icon: '🧀', batches: [] },
  { id: 'tome', name: 'Tome', category: 'fromage', icon: '🧀', batches: [] },
  { id: 'comte', name: 'Comté', category: 'fromage', icon: '🧀', batches: [] },
  { id: 'chevre', name: 'Chèvre', category: 'fromage', icon: '🧀', batches: [] },
  { id: 'fromage_pizza', name: 'Fromage à pizza', category: 'fromage', icon: '🧀', batches: [] },
  
  // Pâtes
  { id: 'pate_pizza', name: 'Pâte à pizza', category: 'pate', icon: '🍕', batches: [] }
];

const STORAGE_KEYS = {
  PRODUCTS: 'bob_dlc_products_v1',
  PIN: 'bob_dlc_pin_v1',
  UNLOCKED: 'bob_dlc_unlocked_v1',
  REMEMBER: 'bob_dlc_remember_v1'
};

// État global en mémoire
let products = [];
let currentFilterCategory = 'all';
let currentFilterStatus = 'all';
let activeEditingProductId = null;
let currentUploadedPhotoBase64 = null;
let enteredPin = '';

// =============================================================================
// 2. CYCLE DE VIE DE L'APPLICATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  updateLiveDate();
  checkPinAuth();
  renderProducts();
  updateKpiCounts();
  renderMultiLotAlerts();

  // Enregistrement Service Worker pour fonctionnement PWA hors-ligne
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=1.3.0').then(reg => {
      reg.update();
    }).catch(err => {
      console.log('Service Worker non actif en local / dev:', err);
    });
  }
});

const APP_VERSION = 'v1.3.0';

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

  // Initialisation des produits
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
}

function saveProductsToStorage() {
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  updateKpiCounts();
  renderMultiLotAlerts();
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
// 4. CALCULS DES DLC & CODES COULEURS
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

function getStatusFromDays(days) {
  if (days === null || days === undefined) return 'none';
  if (days <= 0) return 'red';
  if (days <= 7) return 'orange';
  return 'green';
}

function getProductStatus(product) {
  if (!product.batches || product.batches.length === 0) return 'none';
  let minDays = Infinity;
  product.batches.forEach(b => {
    const days = getDaysRemaining(b.dlc);
    if (days !== null && days < minDays) minDays = days;
  });
  return getStatusFromDays(minDays);
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
      if (status !== currentFilterStatus) return false;
    }
    return true;
  });

  // Tri automatique : Rouge en premier, puis Orange, puis Vert, puis None
  const statusPriority = { red: 0, orange: 1, green: 2, none: 3 };
  filtered.sort((a, b) => {
    const statusA = getProductStatus(a);
    const statusB = getProductStatus(b);
    if (statusPriority[statusA] !== statusPriority[statusB]) {
      return statusPriority[statusA] - statusPriority[statusB];
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
        const days = getDaysRemaining(batch.dlc);
        const status = getStatusFromDays(days);
        const badgeClass = `badge-${status}`;
        const formattedDate = formatDateFr(batch.dlc);
        const statusText = getStatusBadgeText(days);
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
              <button class="btn-batch-finish" onclick="finishBatch('${prod.id}', '${batch.id}')" title="Marquer ce lot comme consommé/terminé">
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
    if (status === 'red') red++;
    else if (status === 'orange') orange++;
    else if (status === 'green') green++;
  });

  document.getElementById('count-red').textContent = red;
  document.getElementById('count-orange').textContent = orange;
  document.getElementById('count-green').textContent = green;
  document.getElementById('count-total').textContent = products.length;
}

// =============================================================================
// 6. ALERTES MULTI-LOTS & CONFIRMATION DE CONSOMMATION
// =============================================================================

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
  prod.batches = prod.batches.filter(b => b.id !== batchId);
  saveProductsToStorage();
  renderProducts();
  if (navigator.vibrate) navigator.vibrate(35);
}

function snoozeBatchAlert(batchId) {
  const expiry = Date.now() + 12 * 60 * 60 * 1000; // 12h de répit pour le shift
  localStorage.setItem('snooze_lot_' + batchId, expiry.toString());
  renderMultiLotAlerts();
}

function switchCategory(cat) {
  currentFilterCategory = cat;
  document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-${cat}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderProducts();
}

function filterByStatus(status) {
  currentFilterStatus = status;
  renderProducts();
}

function getCategoryLabel(cat) {
  switch (cat) {
    case 'charcuterie': return '🥓 Charcuterie';
    case 'fromage': return '🧀 Fromage';
    case 'pate': return '🍕 Pâte & Pain';
    default: return '🥫 Autre';
  }
}

function getStatusBadgeText(days) {
  if (days < 0) return `Périmé (${Math.abs(days)}j)`;
  if (days === 0) return `Périme AUJOURD'HUI`;
  if (days === 1) return `Demain (J-1)`;
  return `Dans ${days} jours`;
}

function formatDateFr(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
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

  saveProductsToStorage();
  renderProducts();
  closeDlcModal();
}

function finishBatch(productId, batchId) {
  const prod = products.find(p => p.id === productId);
  if (!prod || !prod.batches) return;

  if (confirm(`Confirmer que ce lot de ${prod.name} est consommé / terminé ?`)) {
    prod.batches = prod.batches.filter(b => b.id !== batchId);
    saveProductsToStorage();
    renderProducts();
  }
}

function deleteProduct(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  const confirmMsg = `Retirer "${prod.name}" de la liste des DLC ?\n\n(Pratique si vous n'en servez plus en ce moment. Vous pourrez le réajouter à tout moment via "+ Ajouter un produit")`;
  if (confirm(confirmMsg)) {
    products = products.filter(p => p.id !== productId);
    saveProductsToStorage();
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

  const expiredList = [];
  const urgentList = [];
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
      if (olderDays <= 7) {
        multiLotCheckList.push(`• *${prod.name}* : Le Lot 1 (${olderBatch.type || 'DLC'} ${formatDateFr(olderBatch.dlc)}) est-il consommé pour entamer le Lot 2 ?`);
      }
    }

    prod.batches.forEach((batch, idx) => {
      const days = getDaysRemaining(batch.dlc);
      const batchLabel = prod.batches.length > 1 ? `${prod.name} (Lot ${idx + 1})` : prod.name;
      const formattedDate = formatDateFr(batch.dlc);
      const typeStr = batch.type || 'DLC';

      if (days <= 0) {
        expiredList.push(`• *${batchLabel}* [${typeStr}] : Échu le ${formattedDate} (${days === 0 ? "AUJOURD'HUI" : Math.abs(days) + 'j de retard'})`);
      } else if (days <= 7) {
        urgentList.push(`• *${batchLabel}* [${typeStr}] : dans *${days} jour(s)* (${formattedDate})`);
      } else {
        okList.push(`${prod.name} (${formattedDate})`);
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

  if (expiredList.length > 0) {
    msg += `🔴 *PÉRIMÉ (À RETIRER D'URGENCE) :*\n`;
    msg += expiredList.join('\n') + `\n\n`;
  } else {
    msg += `🔴 *Périmés :* Aucun ✅\n\n`;
  }

  if (urgentList.length > 0) {
    msg += `🟠 *À PASSER EN PRIORITÉ (≤ 7 jours) :*\n`;
    msg += urgentList.join('\n') + `\n\n`;
  } else {
    msg += `🟠 *Urgences :* Rien sous 7 jours 👍\n\n`;
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
  document.getElementById('new-product-name').value = '';
  document.getElementById('add-product-modal').classList.remove('hidden');
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').classList.add('hidden');
}

function confirmAddProduct() {
  const nameInput = document.getElementById('new-product-name');
  const name = nameInput.value.trim();
  const category = document.getElementById('new-product-category').value;

  if (!name) {
    alert('Veuillez entrer un nom de produit.');
    return;
  }

  const newProd = {
    id: 'prod_' + Date.now(),
    name: name,
    category: category,
    icon: category === 'fromage' ? '🧀' : category === 'charcuterie' ? '🥓' : category === 'pate' ? '🍕' : '🥫',
    batches: []
  };

  products.push(newProd);
  saveProductsToStorage();
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
  let csv = '\uFEFFCatégorie;Produit;Numéro Lot;Type (DLC/DLUO);Date Limite;Jours Restants;Statut;Note/Lot Fournisseur;Photo Présente;Dernière Mise à Jour\n';

  products.forEach(prod => {
    if (!prod.batches || prod.batches.length === 0) {
      csv += `"${prod.category}";"${prod.name}";"Aucun";"N/A";"N/A";"N/A";"Non renseigné";"";"Non";"N/A"\n`;
    } else {
      prod.batches.forEach((b, idx) => {
        const days = getDaysRemaining(b.dlc);
        const status = getStatusFromDays(days);
        const statusLabel = status === 'red' ? 'Périmé' : status === 'orange' ? 'À consommer (≤7j)' : 'Conforme (>7j)';
        csv += `"${prod.category}";"${prod.name}";"Lot ${idx + 1}";"${b.type || 'DLC'}";"${b.dlc}";"${days}";"${statusLabel}";"${b.note || ''}";"${b.photo ? 'Oui' : 'Non'}";"${b.updatedAt || ''}"\n`;
      });
    }
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const todayIso = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `RAPPORT_DLC_BOB_${todayIso}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
