// =========================================================
// Летопись — Telegram Mini App
// =========================================================

// ---- Настройки, которые нужно поменять под себя ----
const BOT_USERNAME = 'lcftype_bot'; // без @, из BotFather
const MINIAPP_SHORT_NAME = 'lcftype';     // short name Web App, из BotFather

// ---- Инициализация ----
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
}

const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;

const state = { view: 'feed', articles: [], draft: null, currentId: null };

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2000);
}

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ---------------------------------------------------------
// Санитайзер HTML для текстовых блоков (bold/italic/underline/переносы)
// ---------------------------------------------------------
const ALLOWED_TAGS = new Set(['B','STRONG','I','EM','U','BR','SPAN','DIV']);
function sanitizeHtml(html){
  const doc = document.createElement('div');
  doc.innerHTML = html;
  (function clean(node){
    [...node.childNodes].forEach(child=>{
      if(child.nodeType === 1){
        if(!ALLOWED_TAGS.has(child.tagName)){
          // разворачиваем неразрешённый тег, оставляя текст/детей
          const parent = child.parentNode;
          while(child.firstChild) parent.insertBefore(child.firstChild, child);
          parent.removeChild(child);
          return;
        }
        // убираем все атрибуты (в т.ч. onclick, style-инъекции)
        [...child.attributes].forEach(a=>child.removeAttribute(a.name));
        clean(child);
      } else if(child.nodeType !== 3){
        child.parentNode.removeChild(child);
      }
    });
  })(doc);
  return doc.innerHTML;
}

// ---------------------------------------------------------
// Данные: Supabase
// ---------------------------------------------------------
async function fetchFeed(){
  const { data, error } = await db
    .from('articles')
    .select('id,title,excerpt,cover,created_at')
    .order('created_at', { ascending: false });
  if(error){ console.error(error); return []; }
  return data;
}

async function fetchArticle(id){
  const { data, error } = await db.from('articles').select('*').eq('id', id).single();
  if(error){ console.error(error); return null; }
  return data;
}

async function insertArticle(payload){
  const { data, error } = await db.from('articles').insert(payload).select().single();
  if(error) throw error;
  return data;
}

async function deleteArticle(id){
  const { error } = await db.from('articles').delete().eq('id', id);
  if(error) throw error;
}

async function uploadImage(dataUrl, filename){
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${filename}`;
  const { error } = await db.storage.from('images').upload(path, blob, { contentType: blob.type });
  if(error) throw error;
  const { data } = db.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}

function compressImageFile(file, maxW=1200, quality=0.82){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxW){ h = Math.round(h*(maxW/w)); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------
// Экран: лента
// ---------------------------------------------------------
async function renderFeed(){
  state.view = 'feed';
  setBackButton(false);
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading">Загрузка статей…</div>';
  state.articles = await fetchFeed();
  if(!state.articles.length){
    main.innerHTML = `
      <div class="empty-state">
        <h2>Здесь пока пусто</h2>
        <p>Нажмите «+ Статья» вверху, чтобы опубликовать первую запись. Ссылка на неё будет открываться прямо в Telegram.</p>
      </div>`;
    return;
  }
  main.innerHTML = state.articles.map(a=>`
    <div class="feed-item" data-id="${a.id}">
      ${a.cover ? `<img class="thumb" src="${a.cover}" alt="">` : ''}
      <div class="feed-meta">${fmtDate(a.created_at)}</div>
      <h3>${escapeHtml(a.title || 'Без названия')}</h3>
      <p>${escapeHtml(a.excerpt || '')}</p>
    </div>
  `).join('');
  main.querySelectorAll('.feed-item').forEach(el=>{
    el.addEventListener('click', ()=> openReader(el.dataset.id));
  });
}

// ---------------------------------------------------------
// Экран: чтение статьи
// ---------------------------------------------------------
async function openReader(id){
  state.view = 'reader';
  state.currentId = id;
  setBackButton(true, renderFeed);
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading">Открываем статью…</div>';
  const article = await fetchArticle(id);
  if(!article){
    main.innerHTML = `<div class="empty-state"><h2>Статья не найдена</h2><p>Возможно, её удалили.</p></div>`;
    return;
  }
  const bodyHtml = article.blocks.map(b=>{
    if(b.type === 'text') return b.html && b.html.trim() ? `<p>${b.html}</p>` : '';
    if(b.type === 'image') return `<figure><img src="${b.src}" alt="">${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>`:''}</figure>`;
    return '';
  }).join('');

  const shareUrl = `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=${article.id}`;

  main.innerHTML = `
    <div class="reader">
      <div class="reader-meta" style="display:flex;justify-content:space-between;align-items:center;">
        <span>${fmtDate(article.created_at)}${article.author_name ? ' · ' + escapeHtml(article.author_name) : ''}</span>
        <button class="btn btn-danger" id="deleteBtn" style="font-size:11px;padding:6px 10px;">Удалить</button>
      </div>
      <h1>${escapeHtml(article.title || 'Без названия')}</h1>
      <div class="reader-body">${bodyHtml || '<p style="color:var(--ink-soft)">Статья пока пуста.</p>'}</div>
      <div class="share-box chrome">
        <div class="share-box-label">Поделиться</div>
        <button class="btn btn-primary" id="shareBtn" style="width:100%;">Отправить ссылку в чат</button>
      </div>
    </div>`;

  document.getElementById('shareBtn').addEventListener('click', ()=>{
    if(tg && tg.switchInlineQuery === undefined && tg.openTelegramLink){
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title||'Статья')}`);
    } else if(navigator.share){
      navigator.share({ title: article.title, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      showToast('Ссылка скопирована');
    }
  });

  document.getElementById('deleteBtn').addEventListener('click', async ()=>{
    if(!confirm('Удалить статью безвозвратно?')) return;
    await deleteArticle(article.id);
    showToast('Статья удалена');
    renderFeed();
  });
}

// ---------------------------------------------------------
// Экран: редактор
// ---------------------------------------------------------
function newDraft(){
  return { title: '', blocks: [{type:'text', html:''}] };
}

function openEditor(){
  state.view = 'editor';
  state.draft = newDraft();
  setBackButton(true, ()=>{
    if(confirm('Отменить редактирование? Черновик будет потерян.')) renderFeed();
  });
  renderEditor();
}

let activeBlockEl = null;

function renderEditor(){
  const main = document.getElementById('main');
  const d = state.draft;
  main.innerHTML = `
    <input class="editor-title-input" id="titleInput" placeholder="Заголовок статьи" value="${escapeHtml(d.title)}">
    <div class="toolbar chrome" id="toolbar">
      <button data-cmd="bold" title="Жирный">B</button>
      <button data-cmd="italic" title="Курсив">i</button>
      <button data-cmd="underline" title="Подчёркнутый">U</button>
    </div>
    <div id="blocksHost"></div>
    <div class="add-row">
      <button class="add-btn" id="addTextBtn">＋ Текст</button>
      <button class="add-btn" id="addImageBtn">＋ Картинка</button>
    </div>
    <button class="btn btn-primary" id="publishBtn" style="width:100%;padding:14px;">Опубликовать</button>
    <input type="file" accept="image/*" id="fileInput" style="display:none">
    <div class="hint chrome" id="editorHint" style="text-align:center;margin-top:10px;color:var(--ink-soft);font-size:12px;"></div>
  `;

  document.getElementById('titleInput').addEventListener('input', e=> d.title = e.target.value);

  document.getElementById('toolbar').querySelectorAll('button').forEach(btn=>{
    // mousedown+preventDefault, чтобы не терять выделение текста при клике
    btn.addEventListener('mousedown', e=>{
      e.preventDefault();
      if(!activeBlockEl) return;
      document.execCommand(btn.dataset.cmd, false, null);
      activeBlockEl.dispatchEvent(new Event('input'));
    });
  });

  document.getElementById('addTextBtn').addEventListener('click', ()=>{
    d.blocks.push({type:'text', html:''});
    renderBlocks();
  });
  document.getElementById('addImageBtn').addEventListener('click', ()=> document.getElementById('fileInput').click());

  document.getElementById('fileInput').addEventListener('change', async e=>{
    const file = e.target.files[0];
    if(!file) return;
    const hint = document.getElementById('editorHint');
    hint.textContent = 'Обрабатываем изображение…';
    try{
      const dataUrl = await compressImageFile(file);
      d.blocks.push({type:'image', src: dataUrl, caption:'', _pendingFile: true});
      renderBlocks();
    }catch(err){ showToast('Не удалось загрузить изображение'); }
    hint.textContent = '';
    e.target.value = '';
  });

  document.getElementById('publishBtn').addEventListener('click', publishDraft);
  renderBlocks();
}

function renderBlocks(){
  const host = document.getElementById('blocksHost');
  const d = state.draft;
  host.innerHTML = d.blocks.map((b,i)=>{
    if(b.type === 'text'){
      return `
        <div class="block" data-i="${i}">
          <button class="block-remove" data-act="del" data-i="${i}">✕</button>
          <div class="block-text" contenteditable="true" data-i="${i}" data-placeholder="Текст абзаца…">${b.html}</div>
        </div>`;
    }
    if(b.type === 'image'){
      return `
        <div class="block block-image-wrap" data-i="${i}">
          <button class="block-remove" data-act="del" data-i="${i}">✕</button>
          <img src="${b.src}" alt="">
          <input class="block-caption" data-i="${i}" placeholder="Подпись (необязательно)" value="${escapeHtml(b.caption||'')}">
        </div>`;
    }
    return '';
  }).join('');

  host.querySelectorAll('.block-text').forEach(el=>{
    el.addEventListener('focus', ()=> activeBlockEl = el);
    el.addEventListener('input', e=>{
      d.blocks[+e.target.dataset.i].html = sanitizeHtml(e.target.innerHTML);
    });
  });
  host.querySelectorAll('.block-caption').forEach(el=>{
    el.addEventListener('input', e=> d.blocks[+e.target.dataset.i].caption = e.target.value);
  });
  host.querySelectorAll('[data-act="del"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      d.blocks.splice(+el.dataset.i, 1);
      renderBlocks();
    });
  });
}

async function publishDraft(){
  const d = state.draft;
  const hasContent = d.title.trim() || d.blocks.some(b => (b.type==='text' && b.html.replace(/<[^>]+>/g,'').trim()) || b.type==='image');
  if(!hasContent){ showToast('Добавьте заголовок или содержимое'); return; }

  const hint = document.getElementById('editorHint');
  hint.textContent = 'Публикуем…';

  try{
    // Загружаем картинки в Supabase Storage
    for(const b of d.blocks){
      if(b.type === 'image' && b._pendingFile){
        const url = await uploadImage(b.src, 'image.jpg');
        b.src = url;
        delete b._pendingFile;
      }
    }

    const firstImage = d.blocks.find(b=>b.type==='image');
    const firstText = d.blocks.find(b=>b.type==='text' && b.html.trim());
    const excerpt = firstText ? firstText.html.replace(/<[^>]+>/g,'').slice(0,140) : '';

    const payload = {
      title: d.title || 'Без названия',
      excerpt,
      cover: firstImage ? firstImage.src : null,
      blocks: d.blocks,
      author_id: tgUser ? tgUser.id : null,
      author_name: tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : null
    };

    const saved = await insertArticle(payload);
    showToast('Опубликовано');
    openReader(saved.id);
  }catch(err){
    console.error(err);
    hint.textContent = '';
    showToast('Ошибка публикации: ' + (err.message || 'см. консоль'));
  }
}

// ---------------------------------------------------------
// Telegram back-button helper
// ---------------------------------------------------------
function setBackButton(show, onClick){
  if(!tg) return;
  tg.BackButton.offClick(setBackButton._last || (()=>{}));
  if(show){
    tg.BackButton.show();
    tg.BackButton.onClick(onClick);
    setBackButton._last = onClick;
  } else {
    tg.BackButton.hide();
  }
}

// ---------------------------------------------------------
// Навигация
// ---------------------------------------------------------
document.getElementById('homeLink').addEventListener('click', renderFeed);
document.getElementById('newArticleBtn').addEventListener('click', openEditor);

// ---------------------------------------------------------
// Инициализация: если открыли по startapp=<id> — сразу читалка
// ---------------------------------------------------------
(async function init(){
  const startParam = tg && tg.initDataUnsafe ? tg.initDataUnsafe.start_param : null;
  if(startParam){
    await openReader(startParam);
  } else {
    await renderFeed();
  }
})();
