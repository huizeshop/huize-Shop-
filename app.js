/*
  ============================================================================
  app.js — Fichier central de Huize Shop
  ----------------------------------------------------------------------------
  Ordre de chargement (avant les scripts propres à chaque page) :
      <script src="config.js"></script>
      <script src="app.js"></script>

  Contenu :
    1. CATALOGUE : les produits (UN SEUL endroit) + validation + accès par identifiant
    2. PANIER    : lecture / écriture de localStorage « huize:cart » (format de panier.html)
    3. WHATSAPP  : messages et ouverture (numéro lu dans config.js : HUIZE_CONFIG.whatsappNumber)
    4. ÉVÉNEMENTS huize:* émis par les pages
    5. ACCUEIL   : vedettes, aperçu du catalogue, fenêtre de détails (index.html uniquement)
    6. DÉMARRAGE

  Aucun paiement, aucun compte client, aucune connexion à un serveur.
  ============================================================================
*/
(function () {
  'use strict';
  if (window.__huizeAppLoaded) return; /* évite les doubles écouteurs si le fichier est chargé deux fois */
  window.__huizeAppLoaded = true;

  var CART_KEY = 'huize:cart', MAX_QTY = 99;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ==========================================================================
     1. CATALOGUE
     --------------------------------------------------------------------------
     SCHÉMA D'UN PRODUIT (commun à toutes les pages) :
       id          (obligatoire) texte ou nombre, unique et STABLE (jamais la position)
       name        (obligatoire) nom affiché
       price       (obligatoire) prix en FCFA, nombre >= 0
       image       image principale (chemin ou URL) — facultatif
       images      autres images — facultatif (non utilisé par les pages actuelles)
       category    catégorie — facultatif
       description description — facultatif
       sizes       tailles disponibles, ex. ['S','M'] ou ['40','41'] — facultatif
       variants    variantes (couleur…), ex. ['Noir','Blanc'] — facultatif
       available   true, false ou texte (ex. 'Sur commande') — facultatif ; absent = inconnu
       featured    true pour l'afficher dans « Nos produits en vedette » — facultatif

     POUR METTRE VOS VRAIS PRODUITS : remplissez REAL_PRODUCTS ci-dessous.
     Dès qu'il contient au moins un produit valide, les EXEMPLES TEMPORAIRES disparaissent
     automatiquement, ainsi que la bannière « mode test ».
     (Plus tard, ces données pourront venir de Supabase via HuizeApp.setProducts(liste).)
     ========================================================================== */
  var REAL_PRODUCTS = [
    /* { id: 'chaussure-001', name: 'Nom du produit', price: 15000, image: 'images/chaussure-001.jpg',
         category: 'Chaussures', description: '…', sizes: ['40','41'], available: true, featured: true }, */
  ];

  /* ----- EXEMPLES TEMPORAIRES : produits FICTIFS, uniquement pour tester le rendu ----- */
  function placeholder(label, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="' + color + '"/>' +
      '<text x="200" y="190" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#555">TEST</text>' +
      '<text x="200" y="232" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#666">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var EX = 'Produit fictif pour tester l\u2019affichage. À remplacer par un vrai produit.';
  var EXAMPLE_PRODUCTS = [
    { id: 'test-1', name: '[TEST] T-shirt coton', price: 5000, image: placeholder('T-shirt', '#e8eef5'), description: EX, category: 'Vêtements', available: true, sizes: ['S', 'M', 'L', 'XL'], variants: ['Blanc', 'Noir'], featured: true },
    { id: 'test-2', name: '[TEST] Baskets sport', price: 15000, image: placeholder('Baskets', '#f1ece3'), description: EX, category: 'Chaussures', available: true, sizes: ['40', '41', '42', '43'], featured: true },
    { id: 'test-3', name: '[TEST] Sac à dos', price: 8500, image: placeholder('Sac', '#e9f0e6'), description: EX, category: 'Accessoires', available: true, variants: ['Noir', 'Bleu'], featured: true },
    { id: 'test-4', name: '[TEST] Écouteurs sans fil', price: 12000, image: placeholder('Écouteurs', '#ece8f3'), description: EX, category: 'Électronique', available: true, featured: true },
    { id: 'test-5', name: '[TEST] Lampe de bureau', price: 7000, image: placeholder('Lampe', '#f5efdc'), description: EX, category: 'Maison', available: 'Sur commande' },
    { id: 'test-6', name: '[TEST] Robe d\u2019été', price: 9000, image: placeholder('Robe', '#f5e6ea'), description: EX, category: 'Vêtements', available: true, sizes: ['S', 'M', 'L'] },
    { id: 'test-7', name: '[TEST] Montre classique', price: 18000, image: placeholder('Montre', '#e6e6e6'), description: EX, category: 'Accessoires', available: false },
    { id: 'test-8', name: '[TEST] Chargeur rapide', price: 4500, image: placeholder('Chargeur', '#e3eef0'), description: EX, category: 'Électronique', available: true }
  ];

  function cleanList(a) {
    return Array.isArray(a) ? a.map(function (v) { return v == null ? '' : String(v).trim(); }).filter(Boolean) : [];
  }
  function cleanText(v) { return (v == null || String(v).trim() === '') ? null : String(v).trim(); }

  /* Valide une liste : ignore (avec avertissement) les produits sans id, sans nom, au prix invalide ou en double. */
  function normalizeProducts(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (p, i) {
      var why = null;
      if (!p || typeof p !== 'object') why = 'objet invalide';
      else if (p.id == null || String(p.id).trim() === '') why = 'identifiant manquant';
      else if (typeof p.name !== 'string' || !p.name.trim()) why = 'nom manquant';
      else if (typeof p.price !== 'number' || !isFinite(p.price) || p.price < 0) why = 'prix invalide';
      else if (seen[String(p.id)]) why = 'identifiant en double';
      if (why) { if (window.console) console.warn('[Huize Shop] Produit ignoré (#' + i + ') : ' + why, p); return; }
      seen[String(p.id)] = true;
      var q = { id: p.id, name: p.name.trim(), price: p.price,
        image: cleanText(p.image) || '', images: cleanList(p.images), category: cleanText(p.category),
        description: cleanText(p.description), sizes: cleanList(p.sizes), variants: cleanList(p.variants),
        featured: p.featured === true };
      if (typeof p.available === 'boolean' || (typeof p.available === 'string' && p.available.trim())) q.available = p.available;
      out.push(q);
    });
    return out;
  }

  var usingExamples = false;
  /* Choix initial : vrais produits s'il y en a, sinon exemples temporaires. */
  (function () {
    var real = normalizeProducts(REAL_PRODUCTS);
    if (real.length) { window.HUIZE_PRODUCTS = real; usingExamples = false; }
    else { window.HUIZE_PRODUCTS = normalizeProducts(EXAMPLE_PRODUCTS); usingExamples = true; }
    window.HUIZE_TEST_DATA = usingExamples; /* remplace tout indicateur défini par un ancien fichier */
  })();

  function products() { return Array.isArray(window.HUIZE_PRODUCTS) ? window.HUIZE_PRODUCTS : []; }
  function getProduct(id) { return products().filter(function (p) { return String(p.id) === String(id); })[0]; }
  function hasPrice(p) { return !!p && typeof p.price === 'number' && isFinite(p.price); }
  function fmt(n) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'; }

  /* Remplace le catalogue (ex. données reçues plus tard) et prévient les pages. */
  function setProducts(list) {
    window.HUIZE_PRODUCTS = normalizeProducts(list);
    usingExamples = false; window.HUIZE_TEST_DATA = false;
    document.dispatchEvent(new CustomEvent('huize:products-ready', { detail: window.HUIZE_PRODUCTS }));
  }

  /* ==========================================================================
     2. PANIER — clé « huize:cart », lignes { id, name, price, image, quantity, size, variant }
     (format identique à celui lu par panier.html et commande-whatsapp.html)
     ========================================================================== */
  function lineKey(it) { return [it.id, it.size || '', it.variant || ''].join('|'); }

  function readCart() {
    var raw = null, arr, out = [];
    try { raw = window.localStorage.getItem(CART_KEY); } catch (e) { return []; }
    if (!raw) return [];
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(arr)) return [];
    arr.forEach(function (it) {
      var q = Math.floor(Number(it && it.quantity)), pr = Number(it && it.price);
      if (!it || it.id == null || typeof it.name !== 'string' || !it.name.trim() || !(q >= 1)) return; /* ligne ancienne ou invalide */
      out.push({ id: it.id, name: it.name, price: isFinite(pr) && pr >= 0 ? pr : null, image: it.image || '',
        quantity: Math.min(q, MAX_QTY), size: cleanText(it.size), variant: cleanText(it.variant) });
    });
    return out;
  }
  function writeCart(cart) {
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); return true; }
    catch (e) { return false; }
  }
  /* Ajoute (ou augmente) une ligne. Deux tailles ou variantes différentes = deux lignes. */
  function addToCart(product, size, variant, qty) {
    var p = getProduct(product && product.id) || product;
    var n = Math.max(1, Math.floor(Number(qty)) || 1);
    var cart = readCart();
    var line = { id: p.id, name: p.name, price: hasPrice(p) ? p.price : null, image: p.image || '', quantity: n, size: cleanText(size), variant: cleanText(variant) };
    var found = cart.filter(function (x) { return lineKey(x) === lineKey(line); })[0];
    if (found) found.quantity = Math.min(MAX_QTY, found.quantity + n); else cart.push(line);
    return writeCart(cart);
  }
  function setQuantity(key, quantity) {
    var cart = readCart(), q = Math.floor(Number(quantity));
    cart = cart.map(function (it) { if (lineKey(it) === key) it.quantity = Math.min(MAX_QTY, q); return it; })
      .filter(function (it) { return it.quantity >= 1; }); /* quantité < 1 : l'article est retiré */
    return writeCart(cart);
  }
  function removeFromCart(key) { return writeCart(readCart().filter(function (it) { return lineKey(it) !== key; })); }
  function clearCart() { return writeCart([]); }

  /* Totaux : le prix du catalogue prévaut ; sinon le prix enregistré est signalé « non confirmé ». */
  function cartTotals() {
    var subtotal = 0, count = 0, allConfirmed = true;
    readCart().forEach(function (it) {
      var p = getProduct(it.id), price = p && hasPrice(p) ? p.price : null;
      count += it.quantity;
      if (price == null) { allConfirmed = false; price = it.price; }
      if (price == null) return;
      subtotal += price * it.quantity;
    });
    return { count: count, subtotal: subtotal, total: subtotal, pricesConfirmed: allConfirmed };
  }
  function updateCartCount() {
    var n = cartTotals().count;
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n < 1; });
  }

  /* ==========================================================================
     3. WHATSAPP — numéro lu UNIQUEMENT dans window.HUIZE_CONFIG.whatsappNumber (config.js)
     ========================================================================== */
  var toastTimer = null;
  function notify(text) {
    var t = $('.toast');
    if (!t) {
      t = document.createElement('p'); t.className = 'toast'; t.setAttribute('role', 'status');
      /* Style minimal intégré : le message reste lisible même sans règle CSS dédiée. */
      t.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:calc(100% - 32px);padding:10px 16px;border-radius:8px;background:#111;color:#fff;font-size:.9rem;z-index:60;margin:0';
      document.body.appendChild(t);
    }
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function waNumber() {
    var n = window.HUIZE_CONFIG && window.HUIZE_CONFIG.whatsappNumber;
    n = n == null ? '' : String(n).replace(/\D/g, '');
    return n.length >= 8 ? n : '';
  }
  /* Ouvre WhatsApp avec un message prérempli. Le client relit et envoie lui-même ; rien n'est confirmé. */
  function openWhatsApp(text) {
    if (!waNumber()) { notify('Le numéro WhatsApp de la boutique n\u2019est pas configuré (config.js).'); return false; }
    var w = window.open('https://wa.me/' + waNumber() + (text ? '?text=' + encodeURIComponent(text) : ''), '_blank', 'noopener');
    if (!w) { notify('Votre navigateur a bloqué l\u2019ouverture de WhatsApp. Autorisez les fenêtres pour ce site.'); return false; }
    return true;
  }
  function optionsText(size, variant) {
    var o = []; if (size) o.push('Taille : ' + size); if (variant) o.push('Variante : ' + variant); return o;
  }
  function productMessage(product, size, variant, qty) {
    var p = getProduct(product && product.id) || product, o = optionsText(cleanText(size), cleanText(variant));
    var n = Math.max(1, Math.floor(Number(qty)) || 1);
    return ['Bonjour Huize Shop, je souhaite commander :', '',
      '1. ' + p.name + (o.length ? ' (' + o.join(', ') + ')' : '') + ' — quantité : ' + n + (hasPrice(p) ? ' — ' + fmt(p.price) + ' l\u2019unité' : ''),
      '', 'Merci de confirmer la disponibilité et le montant final.'].join('\n');
  }
  function questionMessage(product) {
    var p = product && (getProduct(product.id) || product);
    return p ? 'Bonjour Huize Shop, j\u2019aimerais obtenir des renseignements sur ce produit : ' + p.name + '. Pouvez-vous m\u2019aider, s\u2019il vous plaît ?'
      : 'Bonjour Huize Shop, j\u2019aimerais obtenir des renseignements sur vos produits. Pouvez-vous m\u2019aider, s\u2019il vous plaît ?';
  }
  /* Message du panier : prix et total seulement s'ils proviennent du catalogue. */
  function cartMessage() {
    var cart = readCart(), total = 0, all = true;
    var out = ['Bonjour Huize Shop, je souhaite passer une commande. Voici les articles qui m\u2019intéressent :', ''];
    cart.forEach(function (it, i) {
      var p = getProduct(it.id), pr = p && hasPrice(p) ? p.price : null, o = optionsText(it.size, it.variant);
      out.push((i + 1) + '. ' + (p ? p.name : it.name) + (o.length ? ' (' + o.join(', ') + ')' : '') + ' — quantité : ' + it.quantity +
        (pr != null ? ' — ' + fmt(pr) + ' l\u2019unité' : ' — prix à confirmer'));
      if (pr == null) all = false; else total += pr * it.quantity;
    });
    out.push('');
    if (all && cart.length) out.push('Total estimé : ' + fmt(total));
    out.push('Merci de confirmer leur disponibilité, le montant final et les modalités de livraison.');
    return out.join('\n');
  }

  /* ==========================================================================
     4. ÉVÉNEMENTS huize:* — preventDefault() signale à la page que l'action est prise en charge
     ========================================================================== */
  document.addEventListener('huize:add-to-cart', function (e) {
    var d = e.detail || {}, p = d.product && (getProduct(d.product.id) || d.product);
    if (!p) return;
    e.preventDefault();
    if (p.available === false) { notify('Ce produit n\u2019est pas disponible.'); return; }
    if (addToCart(p, d.size, d.variant, d.quantity)) notify(p.name + ' a été ajouté au panier.');
    else notify('Impossible d\u2019enregistrer le panier dans ce navigateur (stockage local indisponible).');
  });
  document.addEventListener('huize:order-whatsapp', function (e) {
    var d = e.detail || {}, p = d.product && (getProduct(d.product.id) || d.product);
    if (!p || !waNumber()) return; /* sans numéro : non pris en charge, la page affiche son propre message */
    e.preventDefault();
    if (p.available === false) { notify('Ce produit n\u2019est pas disponible.'); return; }
    openWhatsApp(productMessage(p, d.size, d.variant, d.quantity));
  });
  document.addEventListener('huize:contact-whatsapp', function (e) {
    if (!waNumber()) return;
    e.preventDefault();
    openWhatsApp(questionMessage(e.detail && e.detail.product));
  });
  document.addEventListener('huize:open-cart', function (e) { e.preventDefault(); window.location.href = 'panier.html'; });
  window.addEventListener('storage', function (e) { if (e.key === CART_KEY) updateCartCount(); });

  /* Émet un événement ; retourne true si une page ou app.js l'a pris en charge. */
  function emit(name, detail) { return document.dispatchEvent(new CustomEvent('huize:' + name, { cancelable: true, detail: detail })) === false; }
  var NOT_WIRED = {
    'add-to-cart': 'Le panier n\u2019a pas pu être utilisé : aucun produit n\u2019a été ajouté.',
    'order-whatsapp': 'WhatsApp n\u2019est pas configuré : aucune commande n\u2019a été préparée.',
    'contact-whatsapp': 'WhatsApp n\u2019est pas configuré.'
  };
  function run(action, detail) { if (!emit(action, detail)) notify(NOT_WIRED[action] || 'Action indisponible.'); }

  function testBanner() {
    if (!usingExamples || $('.test-banner')) return;
    var b = document.createElement('p');
    b.className = 'test-banner';
    b.style.cssText = 'margin:0;padding:8px 16px;background:#fff3cd;color:#5c4600;border-bottom:1px solid #e6d28a;font-size:.85rem;text-align:center';
    b.textContent = 'Mode test : les produits et les prix affichés sont des exemples fictifs. Ne passez pas de vraie commande.';
    var skip = $('.skip');
    if (skip && skip.nextSibling) document.body.insertBefore(b, skip.nextSibling); else document.body.insertBefore(b, document.body.firstChild);
  }

  /* ==========================================================================
     5. ACCUEIL (index.html) — détecté par la présence de [data-featured]
     ========================================================================== */
  function initHome() {
    var all = products();
    var current = null, lastTrigger = null, msg = null;
    var modal = $('[data-product-modal]'), track = $('[data-featured-track]'), grid = $('[data-catalog-grid]');
    var tf = $('#tpl-featured'), tc = $('#tpl-card');
    if (!track || !grid || !tf || !tc) return; /* structure absente : on ne fait rien */

    /* En-tête et boutons « boutique » : index.html n'a pas de script propre */
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]'); if (!b) return;
      var a = b.dataset.action;
      if (a === 'go-shop') window.location.href = 'boutique.html';
      else if (a === 'contact-whatsapp') run('contact-whatsapp', {});
      else if (a === 'open-cart') run('open-cart', {});
    });

    function fillImage(img, p) { if (!img) return; if (p.image) { img.src = p.image; img.alt = p.name; } else img.remove(); }

    /* --- Produits en vedette --- */
    var feat = all.filter(function (p) { return p.featured === true; });
    if (feat.length) {
      feat.forEach(function (p, i) {
        var li = tf.content.firstElementChild.cloneNode(true), a = li.querySelector('[data-featured-link]');
        li.dataset.productId = p.id;
        li.setAttribute('role', 'group'); li.setAttribute('aria-roledescription', 'diapositive');
        li.setAttribute('aria-label', (i + 1) + ' sur ' + feat.length);
        li.querySelector('[data-field="name"]').textContent = p.name;
        fillImage(li.querySelector('img'), p);
        a.setAttribute('role', 'button'); a.tabIndex = 0; a.setAttribute('aria-label', 'Voir les détails de ' + p.name);
        track.appendChild(li);
      });
      var e1 = $('[data-featured-empty]'), v1 = $('[data-featured-viewport]');
      if (e1) e1.hidden = true; if (v1) v1.hidden = false;
      initCarousel();
    }

    /* --- Aperçu du catalogue (8 premiers produits) --- */
    var preview = all.slice(0, 8);
    if (preview.length) {
      preview.forEach(function (p) {
        var li = tc.content.firstElementChild.cloneNode(true);
        li.dataset.productId = p.id;
        li.querySelector('[data-field="name"]').textContent = p.name;
        var pr = li.querySelector('[data-field="price"]'); if (hasPrice(p)) pr.textContent = fmt(p.price); else pr.remove();
        fillImage(li.querySelector('img'), p);
        li.querySelector('.card__main').setAttribute('aria-label', 'Voir les détails de ' + p.name);
        var cart = li.querySelector('[data-action="add-to-cart"]'), wa = li.querySelector('[data-action="order-whatsapp"]');
        cart.setAttribute('aria-label', 'Ajouter ' + p.name + ' au panier');
        wa.setAttribute('aria-label', 'Commander ' + p.name + ' sur WhatsApp');
        if (p.available === false) { cart.disabled = true; wa.disabled = true; }
        grid.appendChild(li);
      });
      var e2 = $('[data-catalog-empty]'); if (e2) e2.hidden = true;
    }

    /* --- Clics : les icônes panier / WhatsApp sont des boutons distincts du bouton d'ouverture --- */
    function onProductClick(e) {
      var b = e.target.closest('[data-action]'); if (!b) return;
      var li = b.closest('[data-product-id]'); if (!li) return;
      var p = getProduct(li.dataset.productId); if (!p) { notify('Ce produit est introuvable.'); return; }
      var a = b.dataset.action;
      if (a === 'open-product') openProduct(p, b, null);
      else if (a === 'add-to-cart' || a === 'order-whatsapp') {
        if (p.sizes.length || p.variants.length) openProduct(p, b, a); /* choix requis avant l'action */
        else run(a, { product: p, size: null, variant: null });
      }
    }
    grid.addEventListener('click', onProductClick);
    track.addEventListener('click', onProductClick);
    track.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-featured-link]')) { e.preventDefault(); e.target.click(); }
    });

    /* --- Fenêtre de détails (celle déjà présente dans index.html) --- */
    function row(rowSel, valSel, text) { var r = $(rowSel, modal); r.hidden = !text; $(valSel, modal).textContent = text || ''; }
    function buildOptions(sel, listSel, values, name) {
      var box = $(sel, modal), l = $(listSel, modal); l.textContent = ''; box.hidden = values.length === 0;
      values.forEach(function (v) {
        var lab = document.createElement('label'), i = document.createElement('input'), s = document.createElement('span');
        lab.className = 'opt'; i.type = 'radio'; i.name = name; i.value = v; s.textContent = v;
        i.addEventListener('change', function () { msg.textContent = ''; });
        lab.appendChild(i); lab.appendChild(s); l.appendChild(lab);
      });
    }
    function chosen(name) { var r = modal.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }
    function openProduct(p, trigger, action) {
      if (!modal || typeof modal.showModal !== 'function') return;
      if (!msg) {
        msg = document.createElement('p'); msg.className = 'modal__msg'; msg.setAttribute('role', 'alert');
        var acts = $('.modal__actions', modal); acts.parentNode.insertBefore(msg, acts);
      }
      current = p; lastTrigger = trigger; msg.textContent = '';
      $('[data-modal-name]', modal).textContent = p.name;
      var pr = $('[data-modal-price]', modal); pr.hidden = !hasPrice(p); pr.textContent = hasPrice(p) ? fmt(p.price) : '';
      var d = $('[data-modal-description]', modal); d.hidden = !p.description; d.textContent = p.description || '';
      var im = $('[data-modal-image]', modal);
      if (p.image) { im.src = p.image; im.alt = p.name; im.hidden = false; } else { im.hidden = true; im.removeAttribute('src'); im.alt = ''; }
      row('[data-modal-category-row]', '[data-modal-category]', p.category);
      var av = typeof p.available === 'string' ? p.available : (p.available === true ? 'Disponible' : (p.available === false ? 'Indisponible' : ''));
      row('[data-modal-availability-row]', '[data-modal-availability]', av);
      buildOptions('[data-modal-sizes]', '[data-modal-sizes-list]', p.sizes, 'size');
      buildOptions('[data-modal-variants]', '[data-modal-variants-list]', p.variants, 'variant');
      $('[data-modal-cart]', modal).disabled = $('[data-modal-whatsapp]', modal).disabled = p.available === false;
      if (action) msg.textContent = 'Veuillez choisir ' + (p.sizes.length && p.variants.length ? 'une taille et une variante' : (p.sizes.length ? 'une taille' : 'une variante')) + ' avant de continuer.';
      modal.showModal();
      $('[data-action="close-modal"]', modal).focus();
    }
    function submit(action) {
      var p = current; if (!p) return;
      var size = chosen('size'), variant = chosen('variant');
      if (p.sizes.length && !size) { msg.textContent = 'Veuillez choisir une taille.'; modal.querySelector('input[name="size"]').focus(); return; }
      if (p.variants.length && !variant) { msg.textContent = 'Veuillez choisir une variante.'; modal.querySelector('input[name="variant"]').focus(); return; }
      msg.textContent = '';
      run(action, { product: p, size: size, variant: variant });
    }
    if (modal) {
      $('[data-modal-cart]', modal).addEventListener('click', function () { submit('add-to-cart'); });
      $('[data-modal-whatsapp]', modal).addEventListener('click', function () { submit('order-whatsapp'); });
      $('[data-action="close-modal"]', modal).addEventListener('click', function () { modal.close(); });
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
      modal.addEventListener('close', function () { current = null; if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus(); });
    }

    /* --- Carrousel : défilement toutes les 3 s, pause à l'interaction, respect de prefers-reduced-motion --- */
    function initCarousel() {
      var car = $('[data-featured]'), btn = $('[data-action="toggle-carousel"]');
      var path = btn && btn.querySelector('path');
      var delay = Number(car.dataset.autoplayDelay) || 3000;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var timer = null, stopped = false, temp = false;
      function canScroll() { return track.scrollWidth > track.clientWidth + 2; }
      function step() {
        var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
        var w = track.firstElementChild.getBoundingClientRect().width;
        track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + w, behavior: 'smooth' });
      }
      function sync() {
        clearInterval(timer); timer = null;
        var active = !reduce && !stopped && !temp && canScroll();
        if (active) timer = setInterval(step, delay);
        track.setAttribute('aria-live', active ? 'off' : 'polite');
        if (btn) {
          btn.hidden = reduce || !canScroll();
          btn.setAttribute('aria-label', stopped ? btn.dataset.labelPlay : btn.dataset.labelPause);
          if (path) path.setAttribute('d', stopped ? 'M8 5l11 7-11 7z' : 'M9 5v14M15 5v14');
        }
      }
      if (btn) btn.addEventListener('click', function () { stopped = !stopped; sync(); });
      car.addEventListener('mouseenter', function () { temp = true; sync(); });
      car.addEventListener('mouseleave', function () { temp = false; sync(); });
      car.addEventListener('focusin', function () { temp = true; sync(); });
      car.addEventListener('focusout', function () { temp = false; sync(); });
      track.addEventListener('pointerdown', function () { stopped = true; sync(); }); /* le visiteur reprend la main */
      track.addEventListener('keydown', function () { stopped = true; sync(); });
      window.addEventListener('resize', sync);
      sync();
    }
  }

  /* ==========================================================================
     6. DÉMARRAGE — chaque bloc vérifie les éléments de la page avant d'agir
     ========================================================================== */
  function init() {
    testBanner();
    updateCartCount();
    if ($('[data-featured]')) initHome();
    /* Boutique : filet de sécurité si le script de la page a démarré avant que les produits soient disponibles */
    var shopGrid = $('#catalog-grid');
    if (shopGrid && shopGrid.children.length === 0 && products().length &&
        window.HuizeBoutique && typeof window.HuizeBoutique.setProducts === 'function') {
      window.HuizeBoutique.setProducts(products());
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* Seul objet global exposé (en plus de HUIZE_PRODUCTS, lu par les pages existantes) */
  window.HuizeApp = {
    products: products, getProduct: getProduct, setProducts: setProducts, normalizeProducts: normalizeProducts,
    cart: { read: readCart, add: addToCart, setQuantity: setQuantity, remove: removeFromCart, clear: clearCart, totals: cartTotals, lineKey: lineKey },
    whatsapp: { open: openWhatsApp, productMessage: productMessage, questionMessage: questionMessage, cartMessage: cartMessage },
    formatPrice: fmt
  };
})();
