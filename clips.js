/* SYRA · Clipes — feed vertical de vídeos curtos (estilo TikTok / Shorts / Reels)
 *
 * Carregado ANTES do app.js. Os helpers do app (window.SYRA) só são lidos na hora
 * em que uma função roda, nunca no carregamento do arquivo.
 *
 * Nesta prévia os clipes enviados ficam só neste navegador (IndexedDB) e não
 * são enviados a nenhum servidor. Os 5 clipes de exemplo estão em /clips.
 */
(() => {
  'use strict';

  const S = () => window.SYRA;
  const TABS = ['Para ti', 'Seguindo', 'Estreias'];
  const LIMITS = { mb: 40, seconds: 90 };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.7-9.4-10C1.7 7 3.8 4.2 6.9 4.2c2 0 3.7 1.1 5.1 3 1.4-1.9 3.1-3 5.1-3 3.1 0 5.2 2.8 4.3 6.3-1.4 5.3-9.4 10-9.4 10z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M16 7l-4-4-4 4M12 3v12"/></svg>',
    on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.7-9.4-10C1.7 7 3.8 4.2 6.9 4.2c2 0 3.7 1.1 5.1 3 1.4-1.9 3.1-3 5.1-3 3.1 0 5.2 2.8 4.3 6.3-1.4 5.3-9.4 10-9.4 10z"/></svg>'
  };

  // estado do feed (vive enquanto a página Clipes está aberta)
  let tab = 'Para ti', soundOn = false, hintShown = false;
  let frame = null, feed = null, active = null, io = null, ioNear = null;
  let blobUrls = {}, lastTap = 0, tapTimer = null, previewUrl = '';

  /* ---------- IndexedDB: vídeos enviados pela pessoa ficam só neste navegador ---------- */
  const DB_NAME = 'syra_local_media', STORE = 'clips';
  const openDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('indexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const putBlob = async (key, blob) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  const getBlob = async key => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => reject(req.error);
    });
  };

  /* ---------- dados ---------- */
  const clipPosts = () => S().allPosts().filter(p => p.kind === 'clip');
  const isFollowing = handle => S().read(S().KEYS.follows, []).includes(handle);
  const isLiked = id => !!S().read(S().KEYS.likes, {})[id];
  const commentsOf = id => S().read(S().KEYS.comments, {})[id] || [];
  const likeCount = p => Number(p.likes || 0) + (isLiked(p.id) ? 1 : 0);
  const fmt = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '').replace('.', ',')} mil` : String(n);
  const postOf = slide => clipPosts().find(p => p.id === slide?.dataset.id);
  const vid = slide => slide.querySelector('video');
  const visibleClips = () => {
    const all = clipPosts();
    if (tab === 'Seguindo') return all.filter(p => isFollowing(p.handle));
    if (tab === 'Estreias') return all.filter(p => p.debut);
    return all;
  };

  /* ---------- peças de HTML ---------- */
  function slideHtml(p) {
    const { esc, avatar } = S();
    const liked = isLiked(p.id), following = isFollowing(p.handle);
    return `<article class="clip" data-id="${esc(p.id)}" data-handle="${esc(p.handle)}" aria-label="${esc(p.title || 'Clipe')} · ${esc(p.user)}">
      <video playsinline loop muted preload="none"${p.poster ? ` poster="${esc(p.poster)}"` : ''} data-src="${esc(p.video || '')}" data-key="${esc(p.videoKey || '')}"></video>
      <div class="clipShade"></div>
      ${p.debut ? '<span class="clipBadge">ESTREIA NA CENA</span>' : ''}
      <button class="clipTap" data-act="tap" aria-label="Pausar ou tocar o clipe de ${esc(p.user)}"></button>
      <div class="clipFlash" aria-hidden="true">${ICON.play}</div>
      <div class="clipMsg" role="status" hidden></div>
      <div class="clipSide">
        <div class="clipAuthor">${avatar(p.user, '', p.avatarImg)}${p.mine ? '' : `<button class="followDot ${following ? 'on' : ''}" data-act="follow" aria-pressed="${following}" aria-label="${following ? 'Deixar de seguir' : 'Seguir'} ${esc(p.user)}">${following ? '✓' : '＋'}</button>`}</div>
        <button class="clipBtn like ${liked ? 'liked' : ''}" data-act="like" aria-pressed="${liked}" aria-label="Curtir"><span class="ico">${ICON.heart}</span><span class="count">${fmt(likeCount(p))}</span></button>
        <button class="clipBtn" data-act="comment" aria-label="Abrir comentários"><span class="ico">${ICON.comment}</span><span class="count">${commentsOf(p.id).length}</span></button>
        <button class="clipBtn" data-act="share" aria-label="Compartilhar"><span class="ico">${ICON.share}</span><span>Enviar</span></button>
        <button class="clipBtn sound" data-act="sound" aria-pressed="${soundOn}" aria-label="Som"><span class="ico">${soundOn ? ICON.on : ICON.off}</span><span>Som</span></button>
      </div>
      <div class="clipInfo">
        <div class="clipUser"><b>@${esc(p.handle)}</b>${p.role ? `<span class="clipRole">${esc(p.role)}</span>` : ''}</div>
        <button class="clipCaption" data-act="expand" aria-expanded="false">${esc(p.text)}</button>
        <div class="taglist">${(p.tags || []).map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <button class="clipMusic" data-act="music"><span class="disc" aria-hidden="true">♫</span><span>${esc(p.title || 'Som original')} · som original de ${esc(p.user)}</span></button>
      </div>
      <div class="clipProgress" aria-hidden="true"><i></i></div>
    </article>`;
  }

  function emptyHtml() {
    const following = tab === 'Seguindo';
    return `<div class="clipEmpty"><div class="heading">${following ? 'Ninguém por aqui ainda' : 'Sem clipes nesta aba'}</div>
      <p class="small">${following ? 'Segue artistas pra ver os clipes deles aqui.' : 'Quando alguém estrear um clipe, ele aparece aqui.'}</p>
      <button class="btn" data-act="tab" data-tab="Para ti">Ver clipes pra ti</button></div>`;
  }

  /* ---------- página Clipes ---------- */
  function renderClips(startId) {
    cleanup();
    const { $ } = S();
    if (startId) tab = 'Para ti';
    $('#content').innerHTML = `<div class="clipsStage">
      <div class="clipsFrame" id="clipsFrame">
        <div class="clipTabs" role="group" aria-label="Filtro do feed">${TABS.map(t => `<button data-act="tab" data-tab="${t}" aria-pressed="${t === tab}">${t}</button>`).join('')}</div>
        <button class="clipUp" data-act="upload" aria-label="Publicar um clipe">＋</button>
        <div class="clipsFeed" id="clipsFeed" tabindex="0" aria-label="Feed de clipes verticais"></div>
        <div class="clipSheet" id="clipSheet" role="dialog" aria-label="Comentários" inert>
          <div class="sheetHead"><span id="sheetTitle">Comentários</span><button data-act="sheetclose" aria-label="Fechar comentários">✕</button></div>
          <div class="sheetList" id="sheetList"></div>
          <form class="sheetForm" id="sheetForm"><input maxlength="180" required placeholder="Deixa uma ideia, respeito sempre" aria-label="Escrever comentário"><button class="btn">Enviar</button></form>
        </div>
      </div>
      <div class="clipHelp"><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>espaço</kbd> pausa · <kbd>M</kbd> som · <kbd>L</kbd> curtir · duplo toque curte</div>
    </div>`;
    frame = $('#clipsFrame');
    feed = $('#clipsFeed');
    frame.addEventListener('click', onClick);
    frame.addEventListener('submit', onSubmit);
    feed.addEventListener('timeupdate', onMedia, true);
    feed.addEventListener('error', onMedia, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    buildFeed(startId);
    if (!hintShown) { hintShown = true; S().toast('Clipes começam sem som · toque em 🔊 pra ouvir'); }
  }

  function buildFeed(startId) {
    teardownObservers();
    const list = visibleClips();
    feed.innerHTML = list.length ? list.map(slideHtml).join('') : emptyHtml();
    feed.scrollTop = 0;
    const slides = [...feed.querySelectorAll('.clip')];
    if (!slides.length) return;
    // aquece o clipe vizinho (1 tela pra cima e pra baixo) e toca só o que está visível
    ioNear = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && attach(e.target)), { root: feed, rootMargin: '100% 0px' });
    io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(e.target); else deactivate(e.target);
    }), { root: feed, threshold: [0, 0.6, 1] });
    slides.forEach(s => { ioNear.observe(s); io.observe(s); });
    const at = startId ? Math.max(0, list.findIndex(p => p.id === startId)) : 0;
    if (at > 0) feed.scrollTop = at * feed.clientHeight;
  }

  function teardownObservers() {
    io?.disconnect(); ioNear?.disconnect(); io = ioNear = null;
    feed?.querySelectorAll('video').forEach(v => v.pause());
    active = null;
  }

  function cleanup() {
    teardownObservers();
    clearTimeout(tapTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    frame = feed = null;
  }

  // chamado pelo app.js quando a pessoa sai da página Clipes
  function leaveClips() {
    cleanup();
    Object.values(blobUrls).forEach(u => URL.revokeObjectURL(u));
    blobUrls = {};
  }

  /* ---------- reprodução ---------- */
  async function attach(slide) {
    const v = vid(slide);
    if (v.dataset.ready) return;
    v.dataset.ready = '1';
    const key = v.dataset.key;
    if (key) {
      try {
        const blob = await getBlob(key);
        if (!blob) throw new Error('sem arquivo');
        blobUrls[key] = blobUrls[key] || URL.createObjectURL(blob);
        v.src = blobUrls[key];
      } catch { return showMsg(slide, 'Esse clipe não está mais guardado neste navegador.'); }
    } else if (v.dataset.src) {
      v.src = v.dataset.src;
    } else {
      return showMsg(slide, 'Clipe indisponível.');
    }
    v.preload = 'auto';
    if (slide === active && !slide.classList.contains('paused')) play(slide);
  }

  function activate(slide) {
    if (active === slide) return;
    if (active) deactivate(active);
    active = slide;
    // movimento reduzido: não toca sozinho (marca como pausado ANTES do attach, que pode iniciar a reprodução)
    const still = reduceMotion();
    slide.classList.toggle('paused', still);
    attach(slide);
    try { history.replaceState(null, '', `#clips/${slide.dataset.id}`); } catch { /* file:// em alguns navegadores */ }
    if (!still) play(slide);
  }

  function deactivate(slide) {
    if (active === slide) active = null;
    const v = vid(slide);
    v.pause();
    try { v.currentTime = 0; } catch { /* ainda sem metadados */ }
    slide.classList.remove('paused');
    slide.querySelector('.clipProgress i').style.transform = 'scaleX(0)';
  }

  function play(slide) {
    const v = vid(slide);
    if (!v.getAttribute('src')) return;
    v.muted = !soundOn;
    const p = v.play();
    if (!p?.catch) return;
    p.catch(err => {
      if (err.name === 'AbortError') return;
      if (soundOn) { // navegador bloqueou o som sem gesto da pessoa: volta pro mudo
        soundOn = false; syncSound(); v.muted = true;
        S().toast('O navegador bloqueou o som. Toque em 🔊 pra ligar.');
        v.play().catch(() => slide.classList.add('paused'));
      } else {
        slide.classList.add('paused');
      }
    });
  }

  function togglePause(slide) {
    const v = vid(slide);
    if (!v.getAttribute('src')) return;
    if (v.paused) { slide.classList.remove('paused'); play(slide); }
    else { v.pause(); slide.classList.add('paused'); }
  }

  function showMsg(slide, text) {
    const m = slide.querySelector('.clipMsg');
    m.textContent = text; m.hidden = false;
  }

  function onMedia(e) {
    const v = e.target;
    if (v.tagName !== 'VIDEO') return;
    const slide = v.closest('.clip');
    if (e.type === 'timeupdate') {
      if (v.duration) slide.querySelector('.clipProgress i').style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
    } else if (e.type === 'error' && v.getAttribute('src')) {
      showMsg(slide, 'Não deu pra tocar esse clipe neste navegador.');
    }
  }

  function onVisibility() {
    if (!active) return;
    if (document.hidden) vid(active).pause();
    else if (!active.classList.contains('paused')) play(active);
  }

  /* ---------- ações ---------- */
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const slide = el.closest('.clip');
    const actions = {
      tap: () => onTap(slide, e),
      like: () => like(slide),
      comment: () => openComments(slide),
      share: () => share(slide),
      follow: () => follow(slide),
      sound: toggleSound,
      expand: () => { const open = el.getAttribute('aria-expanded') !== 'true'; el.setAttribute('aria-expanded', open); },
      music: () => S().showPage('music'),
      upload: openUpload,
      tab: () => setTab(el.dataset.tab),
      sheetclose: closeComments
    };
    actions[el.dataset.act]?.();
  }

  function setTab(name) {
    tab = name;
    frame.querySelectorAll('.clipTabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab));
    buildFeed();
  }

  function onTap(slide, e) {
    if (e.detail === 0) return togglePause(slide); // acionado pelo teclado
    const now = Date.now();
    if (now - lastTap < 300) { // duplo toque curte
      clearTimeout(tapTimer); lastTap = 0;
      const r = slide.getBoundingClientRect();
      if (!isLiked(slide.dataset.id)) like(slide);
      burst(slide, e.clientX - r.left, e.clientY - r.top);
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => togglePause(slide), 280);
  }

  function burst(slide, x, y) {
    const b = document.createElement('div');
    b.className = 'burst'; b.style.left = `${x}px`; b.style.top = `${y}px`; b.innerHTML = ICON.heartFill;
    slide.append(b);
    setTimeout(() => b.remove(), 800);
  }

  function like(slide) {
    const { read, save, KEYS } = S(), id = slide.dataset.id, likes = read(KEYS.likes, {});
    likes[id] = !likes[id];
    save(KEYS.likes, likes);
    const btn = slide.querySelector('.clipBtn.like'), p = postOf(slide);
    btn.classList.toggle('liked', !!likes[id]);
    btn.setAttribute('aria-pressed', !!likes[id]);
    btn.querySelector('.count').textContent = fmt(likeCount(p));
  }

  function follow(slide) {
    const { read, save, toast, KEYS } = S(), handle = slide.dataset.handle, list = read(KEYS.follows, []);
    const next = list.includes(handle) ? list.filter(h => h !== handle) : [...list, handle];
    save(KEYS.follows, next);
    const on = next.includes(handle);
    feed.querySelectorAll(`.clip[data-handle="${CSS.escape(handle)}"] .followDot`).forEach(b => {
      b.classList.toggle('on', on); b.textContent = on ? '✓' : '＋'; b.setAttribute('aria-pressed', on);
    });
    toast(on ? 'Artista adicionado à tua cena.' : 'Artista removido da tua lista.');
  }

  function toggleSound() {
    soundOn = !soundOn;
    syncSound();
    feed.querySelectorAll('video').forEach(v => { v.muted = !soundOn; });
    if (active && !active.classList.contains('paused')) play(active);
  }

  function syncSound() {
    feed?.querySelectorAll('.clipBtn.sound').forEach(b => {
      b.setAttribute('aria-pressed', soundOn);
      b.querySelector('.ico').innerHTML = soundOn ? ICON.on : ICON.off;
    });
  }

  function share(slide) {
    const { toast } = S(), p = postOf(slide);
    const url = `${location.href.split('#')[0]}#clips/${p.id}`;
    const text = `${p.user} na SYRA: ${p.text}`;
    if (navigator.share) navigator.share({ title: `${p.title || 'Clipe'} · SYRA`, text, url }).catch(() => {});
    else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(`${text} ${url}`).then(() => toast('Link do clipe copiado.')).catch(() => toast('Compartilhamento indisponível neste navegador.'));
    else toast('Compartilhamento indisponível neste navegador.');
  }

  /* ---------- comentários ---------- */
  function renderComments() {
    const { esc } = S(), sheet = frame.querySelector('#clipSheet'), list = commentsOf(sheet.dataset.id);
    frame.querySelector('#sheetTitle').textContent = `Comentários · ${list.length}`;
    frame.querySelector('#sheetList').innerHTML = list.length
      ? list.map(c => `<div class="commentItem"><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('')
      : '<div class="sheetEmpty">Ainda sem comentários. Manda a primeira ideia.</div>';
  }

  function openComments(slide) {
    const sheet = frame.querySelector('#clipSheet');
    sheet.dataset.id = slide.dataset.id;
    sheet._opener = slide.querySelector('[data-act="comment"]');
    renderComments();
    sheet.removeAttribute('inert');
    sheet.classList.add('open');
    sheet.querySelector('input').focus({ preventScroll: true });
  }

  function closeComments() {
    const sheet = frame?.querySelector('#clipSheet');
    if (!sheet?.classList.contains('open')) return;
    sheet.classList.remove('open');
    sheet.setAttribute('inert', '');
    sheet._opener?.focus({ preventScroll: true });
  }

  function onSubmit(e) {
    if (e.target.id !== 'sheetForm') return;
    e.preventDefault();
    const { read, save, profile, KEYS } = S(), sheet = frame.querySelector('#clipSheet'), id = sheet.dataset.id;
    const input = e.target.querySelector('input'), text = input.value.trim();
    if (!text) return;
    const all = read(KEYS.comments, {});
    all[id] = [...(all[id] || []), { name: profile().name || 'Pessoa da cena', text }];
    save(KEYS.comments, all);
    input.value = '';
    renderComments();
    const list = frame.querySelector('#sheetList');
    list.scrollTop = list.scrollHeight;
    const count = feed.querySelector(`.clip[data-id="${CSS.escape(id)}"] [data-act="comment"] .count`);
    if (count) count.textContent = all[id].length;
  }

  /* ---------- teclado ---------- */
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (e.key === 'Escape') return closeComments();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = e.key.toLowerCase();
    if (key === 'arrowdown' || key === 'j') { e.preventDefault(); go(1); }
    else if (key === 'arrowup' || key === 'k') { e.preventDefault(); go(-1); }
    else if ((key === ' ' && tag !== 'BUTTON') || key === 'p') { e.preventDefault(); active && togglePause(active); }
    else if (key === 'm') toggleSound();
    else if (key === 'l') active && like(active);
  }

  function go(delta) {
    const slides = [...feed.querySelectorAll('.clip')], i = slides.indexOf(active);
    const target = Math.max(0, Math.min(slides.length - 1, (i < 0 ? 0 : i) + delta));
    feed.scrollTo({ top: target * feed.clientHeight, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  /* ---------- Home e posts: miniaturas ---------- */
  function rail() {
    const { esc } = S(), list = clipPosts().slice(0, 8);
    if (!list.length) return '';
    return `<div class="sectionHead"><div><div class="eyebrow">CLIPES EM ALTA</div><h2>Curto, vertical e na batida</h2></div><button class="ghost" onclick="SYRAClips.open()">Ver todos →</button></div>
      <div class="reel">${list.map(p => `<button class="reelCard" onclick="SYRAClips.open('${esc(p.id)}')" aria-label="Assistir ${esc(p.title || 'clipe')} de ${esc(p.user)}">
        ${p.poster ? `<img src="${esc(p.poster)}" alt="" loading="lazy">` : ''}
        <span class="reelPlay" aria-hidden="true">▶</span>
        <span class="reelMeta"><b>@${esc(p.handle)}</b><small>♥ ${fmt(likeCount(p))}</small></span></button>`).join('')}</div>`;
  }

  function thumb(p) {
    const { esc } = S();
    return `<button class="clipThumb" onclick="SYRAClips.open('${esc(p.id)}')" aria-label="Assistir clipe ${esc(p.title || '')} de ${esc(p.user)}">
      ${p.poster ? `<img src="${esc(p.poster)}" alt="" loading="lazy">` : ''}
      <span class="reelPlay" aria-hidden="true">▶</span>
      <span class="clipThumbCap"><strong>${esc(p.title || 'Clipe')}</strong><small>Assistir em Clipes</small></span></button>`;
  }

  const open = id => window.showPage('clips', { clip: id });

  /* ---------- Publicar clipe ---------- */
  function openUpload() { window.showPage('publish'); formTab(); }

  function formTab() {
    const { $, $$, esc, profile, user, avatar } = S(), body = $('#pubBody');
    if (!body) return;
    $$('#pubTabs button').forEach((b, i) => b.classList.toggle('active', i === 1));
    const u = user(), p = profile();
    body.innerHTML = `<form class="card" id="clipForm">
      <div class="postMeta">${avatar(p.name || u.name, '', p.avatar)}<div><div class="name">${esc(p.name || u.name)}</div><div class="small">@${esc(p.handle || u.handle)} · perfil local</div></div></div>
      <div class="field"><label for="clipFile">Vídeo do clipe · vertical (9:16), até ${LIMITS.seconds} s e ${LIMITS.mb} MB</label><input type="file" id="clipFile" accept="video/*" required></div>
      <div class="clipPreview" id="clipPreview" hidden></div>
      <div class="field"><label for="clipCaption">Legenda</label><textarea id="clipCaption" required maxlength="200" rows="3" placeholder="O que rola no clipe? Refrão, bastidor, chamada pra collab..."></textarea><div class="small" id="clipCount">0 / 200</div></div>
      <div class="profileFields">
        <div class="field"><label for="clipTitle">Nome da faixa</label><input id="clipTitle" maxlength="60" placeholder="Opcional"></div>
        <div class="field"><label for="clipTags">Tags · separadas por vírgula</label><input id="clipTags" maxlength="80" placeholder="#trap, #16barras"></div>
      </div>
      <label class="checkRow"><input type="checkbox" id="clipRights" required><span>Esse som e esse vídeo são meus, ou tenho autorização de quem fez. Não envio música de terceiros.</span></label>
      <div id="clipError" class="authError" role="alert"></div>
      <div class="demoWarning">Nesta prévia o clipe fica guardado só neste navegador. Não é enviado a servidor nem aparece pra outras pessoas.</div>
      <button class="btn" id="clipSubmit" style="margin-top:14px">Publicar clipe</button>
    </form>`;
    $('#clipFile').addEventListener('change', onFile);
    $('#clipCaption').addEventListener('input', e => { $('#clipCount').textContent = `${e.target.value.length} / 200`; });
    $('#clipForm').addEventListener('submit', submitClip);
  }

  function formError(text) { S().$('#clipError').textContent = text || ''; }

  function resetPreview() {
    const box = S().$('#clipPreview');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    box.hidden = true; box.innerHTML = '';
    S().$$('.fieldHint').forEach(h => h.remove());
  }

  function rejectFile(input, text) { input.value = ''; resetPreview(); formError(text); }

  function onFile(e) {
    const input = e.target, file = input.files[0];
    resetPreview(); formError('');
    if (!file) return;
    if (!file.type.startsWith('video/')) return rejectFile(input, 'Escolhe um arquivo de vídeo.');
    if (file.size > LIMITS.mb * 1024 * 1024) return rejectFile(input, `Esse vídeo passa de ${LIMITS.mb} MB. Corta ou comprime e tenta de novo.`);
    previewUrl = URL.createObjectURL(file);
    const box = S().$('#clipPreview');
    box.innerHTML = `<video controls playsinline muted preload="metadata" src="${previewUrl}"></video>`;
    box.hidden = false;
    const v = box.querySelector('video');
    v.addEventListener('loadedmetadata', () => {
      if (v.duration > LIMITS.seconds) return rejectFile(input, `Esse clipe tem ${Math.round(v.duration)} s. O limite da prévia é ${LIMITS.seconds} s.`);
      if (v.videoWidth > v.videoHeight) box.insertAdjacentHTML('afterend', '<div class="fieldHint">Esse vídeo está na horizontal. No feed ele aparece cortado nas laterais. Grave na vertical (9:16) pra ficar melhor.</div>');
    });
    v.addEventListener('error', () => rejectFile(input, 'Não consegui abrir esse vídeo neste navegador. Tenta um MP4 (H.264).'));
  }

  // miniatura do clipe (um quadro do vídeo), guardada junto do post
  const grabPoster = v => new Promise(resolve => {
    if (!v?.videoWidth) return resolve('');
    const draw = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 360; c.height = Math.round(360 * v.videoHeight / v.videoWidth);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      } catch { resolve(''); }
    };
    const timer = setTimeout(draw, 1500);
    v.addEventListener('seeked', () => { clearTimeout(timer); draw(); }, { once: true });
    v.currentTime = Math.min(0.6, (v.duration || 1) / 2);
  });

  async function submitClip(e) {
    e.preventDefault();
    const { $, read, save, toast, profile, user, KEYS } = S();
    const file = $('#clipFile').files[0];
    if (!file) return formError('Escolhe um vídeo pro clipe.');
    const btn = $('#clipSubmit');
    btn.disabled = true; btn.textContent = 'Guardando…'; formError('');
    const id = `local-clip-${Date.now()}`, key = `video-${id}`;
    try { await putBlob(key, file); }
    catch {
      btn.disabled = false; btn.textContent = 'Publicar clipe';
      return formError('Não deu pra guardar o vídeo neste navegador (janela anônima ou sem espaço).');
    }
    const poster = await grabPoster($('#clipPreview video'));
    const u = user(), p = profile();
    const tags = $('#clipTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5).map(t => t.startsWith('#') ? t : `#${t}`);
    const item = {
      id, kind: 'clip', user: p.name || u.name, handle: p.handle || u.handle, role: p.role || u.role,
      text: $('#clipCaption').value.trim(), title: $('#clipTitle').value.trim(), tags, time: 'agora',
      likes: 0, videoKey: key, poster, mine: true, debut: true, avatarImg: p.avatar || ''
    };
    save(KEYS.posts, [item, ...read(KEYS.posts, [])]);
    resetPreview();
    window.showPage('clips', { clip: id });
    toast('Clipe guardado neste navegador.');
  }

  window.SYRAClips = { renderClips, leaveClips, rail, thumb, open, openUpload, formTab };
})();
