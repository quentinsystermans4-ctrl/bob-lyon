/**
 * BOB • Suivi des DLC & Traçabilité Hygiène
 * Logique principale de l'application
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

  // Enregistrement Service Worker pour fonctionnement PWA hors-ligne
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('Service Worker non actif en local / dev:', err);
    });
  }
});

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
      // Synchronisation : s'assurer que tous les produits par défaut existent
      DEFAULT_PRODUCTS.forEach(defProd => {
        if (!products.some(p => p.id === defProd.id)) {
          products.push(defProd);
        }
      });
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
    // Vibration tactile si supportée
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

/**
 * Calcule le nombre de jours restants jusqu'à la DLC
 * @param {string} dlcDateStr Format YYYY-MM-DD
 * @returns {number} Nombre de jours (positif = futur, 0 = aujourd'hui, négatif = passé)
 */
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

/**
 * Détermine le statut visuel d'une DLC :
 * - Rouge : <= 0 jour
 * - Orange : 1 à 7 jours
 * - Vert : > 7 jours
 */
function getStatusFromDays(days) {
  if (days === null || days === undefined) return 'none';
  if (days <= 0) return 'red';
  if (days <= 7) return 'orange';
  return 'green';
}

/**
 * Récupère le statut global d'un produit (basé sur le lot le plus urgent)
 */
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
    // Si même statut, trier par DLC la plus proche
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

        html += `
          <div class="batch-row">
            <div class="batch-left">
              <span class="batch-status-badge ${badgeClass}">${statusText}</span>
              <div class="batch-meta">
                <strong>${formattedDate}</strong>
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
// 6. MODALE SAISIE DLC (REMPLACER vs 2e LOT)
// =============================================================================

function openDlcModal(productId) {
  activeEditingProductId = productId;
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('modal-product-name').textContent = prod.name;
  document.getElementById('modal-category').textContent = getCategoryLabel(prod.category);
  
  // Date par défaut : aujourd'hui ou dans 7 jours
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  document.getElementById('input-dlc-date').value = defaultDate.toISOString().split('T')[0];
  
  // Reset champs
  document.getElementById('input-lot-note').value = '';
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
}

function toggleBatchAction(action) {
  const radio = document.querySelector(`input[name="batchAction"][value="${action}"]`);
  if (radio) radio.checked = true;

  document.getElementById('label-replace').classList.toggle('active', action === 'replace');
  document.getElementById('label-add').classList.toggle('active', action === 'add');
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
    alert('Veuillez sélectionner une date de DLC.');
    return;
  }

  const note = document.getElementById('input-lot-note').value.trim();
  const actionRadio = document.querySelector('input[name="batchAction"]:checked');
  const batchAction = actionRadio ? actionRadio.value : 'replace';

  const newBatch = {
    id: 'batch_' + Date.now(),
    dlc: dlcDate,
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

  // Trier les lots par date de DLC croissante (le plus urgent en premier)
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

// =============================================================================
// 7. GESTION DES PHOTOS & COMPRESSION CANVAS
// =============================================================================

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Lecture du fichier image
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Compression via Canvas pour éviter de surcharger la mémoire
      const canvas = document.getElementById('compress-canvas');
      const ctx = canvas.getContext('2d');

      const MAX_DIM = 900; // Résolution max largement suffisante pour lire l'étiquette
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

      // Qualité JPEG 0.72 (taille finale ~80-120Ko)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
      currentUploadedPhotoBase64 = compressedDataUrl;

      // Affichage aperçu
      document.getElementById('img-preview').src = compressedDataUrl;
      document.getElementById('photo-preview-box').classList.remove('hidden');
      document.getElementById('btn-camera-label').classList.add('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  currentUploadedPhotoBase64 = null;
  const previewBox = document.getElementById('photo-preview-box');
  const cameraLabel = document.getElementById('btn-camera-label');
  const cameraInput = document.getElementById('camera-input');

  if (previewBox) previewBox.classList.add('hidden');
  if (cameraLabel) cameraLabel.classList.remove('hidden');
  if (cameraInput) cameraInput.value = '';
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
// 8. ENVOI SUR LE GROUPE WHATSAPP
// =============================================================================

function shareToWhatsAppGroup() {
  const todayOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = new Date().toLocaleDateString('fr-FR', todayOptions);
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const expiredList = [];
  const urgentList = [];
  const okList = [];
  const emptyList = [];

  products.forEach(prod => {
    if (!prod.batches || prod.batches.length === 0) {
      emptyList.push(prod.name);
      return;
    }

    prod.batches.forEach((batch, idx) => {
      const days = getDaysRemaining(batch.dlc);
      const batchLabel = prod.batches.length > 1 ? `${prod.name} (Lot ${idx + 1})` : prod.name;
      const formattedDate = formatDateFr(batch.dlc);

      if (days <= 0) {
        expiredList.push(`• *${batchLabel}* : Échu le ${formattedDate} (${days === 0 ? "AUJOURD'HUI" : Math.abs(days) + 'j de retard'})`);
      } else if (days <= 7) {
        urgentList.push(`• *${batchLabel}* : dans *${days} jour(s)* (${formattedDate})`);
      } else {
        okList.push(`${prod.name} (${formattedDate})`);
      }
    });
  });

  // Construction du message WhatsApp élégant
  let msg = `🍺 *BOB • POINT DLC & HYGIÈNE* 🍺\n`;
  msg += `📅 _${capitalizedDate}_\n\n`;

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
    msg += `⚪ *Sans DLC renseignée :* ${emptyList.join(', ')}\n\n`;
  }

  msg += `📲 *Mettre à jour l'outil :* https://www.boblyon.fr/dlc/`;

  // Ouverture WhatsApp
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// =============================================================================
// 9. AJOUT DE PRODUIT HORS-CARTE & PARAMÈTRES
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

  // Ouvre directement la modale DLC pour ce nouveau produit
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
  let csv = '\uFEFFCatégorie;Produit;Numéro Lot;Date DLC;Jours Restants;Statut;Note;Photo Présente;Dernière Mise à Jour\n';

  products.forEach(prod => {
    if (!prod.batches || prod.batches.length === 0) {
      csv += `"${prod.category}";"${prod.name}";"Aucun";"N/A";"N/A";"Non renseigné";"";"Non";"N/A"\n`;
    } else {
      prod.batches.forEach((b, idx) => {
        const days = getDaysRemaining(b.dlc);
        const status = getStatusFromDays(days);
        const statusLabel = status === 'red' ? 'Périmé' : status === 'orange' ? 'À consommer (≤7j)' : 'Conforme (>7j)';
        csv += `"${prod.category}";"${prod.name}";"Lot ${idx + 1}";"${b.dlc}";"${days}";"${statusLabel}";"${b.note || ''}";"${b.photo ? 'Oui' : 'Non'}";"${b.updatedAt || ''}"\n`;
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
