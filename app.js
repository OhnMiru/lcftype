// =========================================================
// Летопись — Telegram Mini App
// Поиск по названию + мультифильтр по авторам
// =========================================================

const BOT_USERNAME = 'lcftype_bot';
const MINIAPP_SHORT_NAME = 'lcftype';

const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }
const tgUser = tg?.initDataUnsafe?.user || null;

const state = {
  view: 'feed',
  articles: [],
  draft: null,
  currentId: null,
  profile: null,
  search: '',
  authorFilter: new Set(),
  pendingImageInsertIndex: null
};

let activeBlockEl = null;

function showToast(msg){
  const t=document.getElementById('toast');
  if(!t){
    console.log(msg);
    return;
  }
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer=setTimeout(()=>t.classList.remove('show'),2500);
}

function fmtDate(iso){
  return iso
    ? new Date(iso).toLocaleDateString('ru-RU',{
        day:'numeric',
        month:'long',
        year:'numeric'
      })
    : '';
}

function escapeHtml(s){
  const d=document.createElement('div');
  d.textContent=s??'';
  return d.innerHTML;
}

const ALLOWED_TAGS = new Set([
  'B','STRONG','I','EM','U','BR','SPAN','DIV'
]);

function sanitizeHtml(html){
  const doc=document.createElement('div');
  doc.innerHTML=html||'';

  (function clean(node){
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===1){
        if(!ALLOWED_TAGS.has(child.tagName)){
          const p=child.parentNode;
          while(child.firstChild)p.insertBefore(child.firstChild,child);
          p.removeChild(child);
          return;
        }

        [...child.attributes].forEach(a=>child.removeAttribute(a.name));
        clean(child);
      } else if(child.nodeType!==3){
        child.parentNode.removeChild(child);
      }
    });
  })(doc);

  return doc.innerHTML;
}

async function callTelegramApi(action, extra={}){
  if(!tg?.initData){
    throw new Error('Откройте приложение внутри Telegram');
  }

  const {data,error}=await db.functions.invoke(
    'telegram-api',
    {
      body:{
        action,
        initData:tg.initData,
        ...extra
      }
    }
  );

  if(error){
    throw new Error(error.message||'Ошибка Edge Function');
  }

  if(data?.error){
    throw new Error(data.error);
  }

  return data;
}

async function getProfile(){
  const r=await callTelegramApi('get-profile');
  state.profile=r.profile||null;
  return state.profile;
}

async function saveProfile(username){
  const r=await callTelegramApi(
    'set-profile',
    {username}
  );

  state.profile=r.profile;
  return state.profile;
}

async function ensureProfile(ask=true){
  const p=await getProfile();
  if(p)return p;
  return ask?openUsernameDialog(null):null;
}

function openUsernameDialog(currentUsername){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.className='profile-overlay';

    overlay.innerHTML=`
      <div class="profile-dialog">
        <div class="profile-dialog-title">
          ${currentUsername?'Изменить ник':'Создать профиль'}
        </div>

        <div class="profile-dialog-text">
          Придумайте имя автора. Его будут видеть рядом с вашими статьями.
        </div>

        <input
          class="profile-input"
          id="profileUsernameInput"
          maxlength="30"
          placeholder="Например: Анна"
          value="${escapeHtml(currentUsername||'')}"
        >

        <div class="profile-hint">
          Можно использовать русские и латинские буквы, цифры, пробел и _
        </div>

        <div class="profile-dialog-actions">
          <button class="btn btn-secondary" id="profileCancelBtn">
            Отмена
          </button>

          <button class="btn btn-primary" id="profileSaveBtn">
            Сохранить
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input=overlay.querySelector('#profileUsernameInput');
    const save=overlay.querySelector('#profileSaveBtn');
    const cancel=overlay.querySelector('#profileCancelBtn');

    setTimeout(()=>{
      input.focus();
      input.select();
    },50);

    cancel.onclick=()=>{
      overlay.remove();
      resolve(null);
    };

    save.onclick=async()=>{
      const username=input.value.trim().replace(/\s+/g,' ');

      if(username.length<2){
        return showToast('Минимум 2 символа');
      }

      if(username.length>30){
        return showToast('Максимум 30 символов');
      }

      save.disabled=true;
      save.textContent='Сохраняем…';

      try{
        const p=await saveProfile(username);
        overlay.remove();
        showToast('Ник сохранён');
        resolve(p);
      }catch(e){
        showToast(e.message||'Не удалось сохранить ник');
        save.disabled=false;
        save.textContent='Сохранить';
      }
    };

    input.onkeydown=e=>{
      if(e.key==='Enter')save.click();
      if(e.key==='Escape')cancel.click();
    };
  });
}

async function fetchFeed(){
  const {data,error}=await db
    .from('articles')
    .select(
      'id,title,excerpt,cover,created_at,author_id,author_name'
    )
    .order('created_at',{ascending:false});

  if(error){
    console.error(error);
    return [];
  }

  return data||[];
}

async function fetchArticle(id){
  const {data,error}=await db
    .from('articles')
    .select('*')
    .eq('id',id)
    .single();

  if(error){
    console.error(error);
    return null;
  }

  return data;
}

function isArticleOwner(a){
  return !!(
    tgUser &&
    a?.author_id &&
    Number(a.author_id)===Number(tgUser.id)
  );
}

function getAuthors(){
  const map=new Map();

  state.articles.forEach(a=>{
    const name=(a.author_name||'').trim();

    if(name){
      map.set(name,name);
    }
  });

  return [...map.values()].sort(
    (a,b)=>a.localeCompare(
      b,
      'ru',
      {sensitivity:'base'}
    )
  );
}

function filteredArticles(){
  const q=state.search
    .trim()
    .toLocaleLowerCase('ru-RU');

  return state.articles.filter(a=>{
    const title=(a.title||'')
      .toLocaleLowerCase('ru-RU');

    const author=(a.author_name||'').trim();

    const searchOk=!q||title.includes(q);

    const authorOk=
      !state.authorFilter.size ||
      state.authorFilter.has(author);

    return searchOk&&authorOk;
  });
}

function renderFeedTools(){
  const authors=getAuthors();
  const selectedCount=state.authorFilter.size;

  return `
    <div class="feed-tools chrome">

      <div class="feed-search-wrap">
        <span class="feed-search-icon">⌕</span>

        <input
          id="articleSearch"
          class="feed-search"
          type="search"
          autocomplete="off"
          placeholder="Поиск по названию"
          value="${escapeHtml(state.search)}"
        >

        <button
          id="clearSearchBtn"
          class="feed-search-clear"
          type="button"
          aria-label="Очистить"
          ${state.search?'':'hidden'}
        >
          ×
        </button>
      </div>

      <button
        id="authorFilterBtn"
        class="author-filter-btn ${selectedCount?'has-selection':''}"
        type="button"
      >
        <span>☷</span>
        <span>Фильтр</span>
        ${selectedCount?`<b>${selectedCount}</b>`:''}
      </button>

      <div
        id="authorFilterPanel"
        class="author-filter-panel"
        hidden
      >
        <div class="author-filter-head">
          <strong>Фильтр по автору</strong>
          <button id="closeAuthorFilter" type="button">
            ×
          </button>
        </div>

        <div class="author-filter-list">
          ${authors.map(name=>`
            <label class="author-option">
              <input
                type="checkbox"
                value="${escapeHtml(name)}"
                ${state.authorFilter.has(name)?'checked':''}
              >
              <span>${escapeHtml(name)}</span>
            </label>
          `).join('')}
        </div>

        ${
          state.authorFilter.size
            ? '<button id="resetAuthorFilter" class="author-filter-reset" type="button">Сбросить фильтр</button>'
            : ''
        }
      </div>

    </div>
  `;
}

function bindFeedTools(){
  const search=document.getElementById('articleSearch');
  const clear=document.getElementById('clearSearchBtn');
  const filter=document.getElementById('authorFilterBtn');
  const panel=document.getElementById('authorFilterPanel');

  search?.addEventListener('input',e=>{
    state.search=e.target.value;
    renderFeedListOnly();
  });

  clear?.addEventListener('click',()=>{
    state.search='';
    search.value='';
    clear.hidden=true;
    renderFeedListOnly();
    search.focus();
  });

  filter?.addEventListener('click',()=>{
    panel.hidden=!panel.hidden;
  });

  document
    .getElementById('closeAuthorFilter')
    ?.addEventListener(
      'click',
      ()=>panel.hidden=true
    );

  panel
    ?.querySelectorAll('input[type=checkbox]')
    .forEach(cb=>cb.addEventListener('change',()=>{
      if(cb.checked){
        state.authorFilter.add(cb.value);
      }else{
        state.authorFilter.delete(cb.value);
      }

      renderFeed();
    }));

  document
    .getElementById('resetAuthorFilter')
    ?.addEventListener('click',()=>{
      state.authorFilter.clear();
      renderFeed();
    });
}

function renderFeedListOnly(){
  const list=document.getElementById('feedList');

  if(!list)return;

  const rows=filteredArticles();

  list.innerHTML=rows.length
    ? rows.map(a=>`
        <div
          class="feed-item"
          data-id="${escapeHtml(a.id)}"
        >
          ${
            a.cover
              ? `<img class="thumb" src="${escapeHtml(a.cover)}" alt="">`
              : ''
          }

          <div class="feed-meta">
            ${fmtDate(a.created_at)}
            ${
              a.author_name
                ? ` · ${escapeHtml(a.author_name)}`
                : ''
            }
          </div>

          <h3>
            ${escapeHtml(a.title||'Без названия')}
          </h3>

          <p>
            ${escapeHtml(a.excerpt||'')}
          </p>
        </div>
      `).join('')
    : `
      <div class="empty-state feed-empty">
        <h2>Ничего не найдено</h2>
        <p>
          ${
            state.authorFilter.size
              ? 'Попробуйте выбрать других авторов.'
              : 'Попробуйте изменить запрос поиска.'
          }
        </p>
      </div>
    `;

  list
    .querySelectorAll('.feed-item')
    .forEach(el=>{
      el.addEventListener(
        'click',
        ()=>openReader(el.dataset.id)
      );
    });

  const clear=document.getElementById('clearSearchBtn');

  if(clear){
    clear.hidden=!state.search;
  }

  const filter=document.getElementById('authorFilterBtn');

  if(filter){
    filter.classList.toggle(
      'has-selection',
      !!state.authorFilter.size
    );

    const b=filter.querySelector('b');

    if(state.authorFilter.size&&!b){
      filter.insertAdjacentHTML(
        'beforeend',
        `<b>${state.authorFilter.size}</b>`
      );
    }else if(!state.authorFilter.size&&b){
      b.remove();
    }else if(b){
      b.textContent=state.authorFilter.size;
    }
  }
}

async function renderFeed(){
  state.view='feed';
  state.currentId=null;

  setBackButton(false);

  const main=document.getElementById('main');

  main.innerHTML=
    '<div class="loading">Загрузка статей…</div>';

  state.articles=await fetchFeed();

  main.innerHTML=`
    ${renderFeedTools()}
    <div id="feedList"></div>
  `;

  bindFeedTools();
  renderFeedListOnly();

  if(!state.articles.length){
    document.getElementById('feedList').innerHTML=`
      <div class="empty-state">
        <h2>Здесь пока пусто</h2>
        <p>
          Нажмите «+ Статья», чтобы опубликовать первую запись.
        </p>
      </div>
    `;
  }
}

async function openReader(id){
  state.view='reader';
  state.currentId=id;

  setBackButton(true,renderFeed);

  const main=document.getElementById('main');

  main.innerHTML=
    '<div class="loading">Открываем статью…</div>';

  const article=await fetchArticle(id);

  if(!article){
    main.innerHTML=`
      <div class="empty-state">
        <h2>Статья не найдена</h2>
        <p>Возможно, её удалили.</p>
      </div>
    `;
    return;
  }

  const bodyHtml=(article.blocks||[])
    .map(b=>{
      if(b.type==='text'){
        return b.html?.trim()
          ? `<p>${sanitizeHtml(b.html)}</p>`
          : '';
      }

      if(b.type==='image'){
        return `
          <figure>
            <img
              src="${escapeHtml(b.src||'')}"
              alt=""
            >
            ${
              b.caption
                ? `<figcaption>${escapeHtml(b.caption)}</figcaption>`
                : ''
            }
          </figure>
        `;
      }

      return '';
    })
    .join('');

  const shareUrl=
    `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=${article.id}`;

  const owner=isArticleOwner(article);

  main.innerHTML=`
    <div class="reader">

      <div class="reader-meta reader-meta-row">

        <span>
          ${fmtDate(article.created_at)}
          ${
            article.author_name
              ? ` · ${escapeHtml(article.author_name)}`
              : ''
          }
        </span>

        ${
          owner
            ? `
              <div class="article-owner-actions">
                <button
                  class="btn btn-secondary"
                  id="editBtn"
                >
                  Редактировать
                </button>

                <button
                  class="btn btn-danger"
                  id="deleteBtn"
                >
                  Удалить
                </button>
              </div>
            `
            : ''
        }

      </div>

      <h1>
        ${escapeHtml(article.title||'Без названия')}
      </h1>

      <div class="reader-body">
        ${
          bodyHtml ||
          '<p class="reader-empty">Статья пока пуста.</p>'
        }
      </div>

      <div class="share-box chrome">
        <div class="share-box-label">
          Поделиться
        </div>

        <button
          class="btn btn-primary"
          id="shareBtn"
        >
          Копировать ссылку
        </button>
      </div>

    </div>
  `;

  /*
   * Ссылка больше НЕ отправляется в чат.
   * При нажатии она только копируется в буфер обмена.
   */
  document.getElementById('shareBtn').onclick=async()=>{
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(shareUrl);
        showToast('Ссылка скопирована');
        return;
      }

      /*
       * Запасной вариант для браузеров,
       * где navigator.clipboard недоступен.
       */
      const textarea=document.createElement('textarea');

      textarea.value=shareUrl;
      textarea.style.position='fixed';
      textarea.style.opacity='0';

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      const copied=document.execCommand('copy');

      textarea.remove();

      if(copied){
        showToast('Ссылка скопирована');
      }else{
        showToast('Не удалось скопировать ссылку');
      }

    }catch(e){
      console.error(e);
      showToast('Не удалось скопировать ссылку');
    }
  };

  if(owner){
    document.getElementById('editBtn').onclick=
      ()=>editArticle(article);

    document.getElementById('deleteBtn').onclick=
      async()=>{
        if(!confirm('Удалить статью безвозвратно?')){
          return;
        }

        const b=document.getElementById('deleteBtn');

        b.disabled=true;
        b.textContent='Удаляем…';

        try{
          await callTelegramApi(
            'delete-article',
            {articleId:article.id}
          );

          showToast('Статья удалена');

          await renderFeed();

        }catch(e){
          b.disabled=false;
          b.textContent='Удалить';

          showToast(
            e.message||
            'Не удалось удалить статью'
          );
        }
      };
  }
}

function newDraft(){
  return {
    id:null,
    title:'',
    cover:null,
    blocks:[
      {
        type:'text',
        html:''
      }
    ]
  };
}

async function openEditor(){
  try{
    if(!tg?.initData){
      showToast(
        'Откройте приложение внутри Telegram'
      );
      return;
    }

    const p=await ensureProfile(true);

    if(!p)return;

    state.view='editor';
    state.currentId=null;
    state.draft=newDraft();

    setBackButton(
      true,
      ()=>{
        if(
          confirm(
            'Отменить редактирование? Черновик будет потерян.'
          )
        ){
          renderFeed();
        }
      }
    );

    renderEditor();

  }catch(e){
    showToast(
      e.message||
      'Не удалось открыть редактор'
    );
  }
}

function editArticle(article){
  if(!isArticleOwner(article)){
    showToast(
      'Вы не являетесь автором этой статьи'
    );
    return;
  }

  state.view='editor';
  state.currentId=article.id;

  state.draft={
    id:article.id,
    title:article.title||'',
    cover:article.cover||null,
    blocks:JSON.parse(
      JSON.stringify(article.blocks||[])
    )
  };

  if(!state.draft.blocks.length){
    state.draft.blocks=[
      {
        type:'text',
        html:''
      }
    ];
  }

  setBackButton(
    true,
    ()=>{
      if(
        confirm(
          'Отменить редактирование? Изменения будут потеряны.'
        )
      ){
        openReader(article.id);
      }
    }
  );

  renderEditor();
}

function renderEditor(){
  const main=document.getElementById('main');
  const d=state.draft;

  main.innerHTML=`
    <input
      class="editor-title-input"
      id="titleInput"
      placeholder="Заголовок статьи"
      value="${escapeHtml(d.title)}"
    >

    <div
      class="cover-editor"
      id="coverEditor"
    >
      <div class="cover-editor-header">

        <div>
          <div class="cover-editor-title">
            Обложка
          </div>

          <div class="cover-editor-subtitle">
            Она будет видна на главной, но не внутри статьи.
          </div>
        </div>

        ${
          d.cover
            ? `
              <button
                class="cover-remove-btn"
                id="removeCoverBtn"
                type="button"
              >
                Убрать
              </button>
            `
            : ''
        }

      </div>

      ${
        d.cover
          ? `
            <div class="cover-preview">

              <img
                src="${escapeHtml(d.cover)}"
                alt=""
              >

              <button
                class="cover-change-btn"
                id="changeCoverBtn"
                type="button"
              >
                Заменить обложку
              </button>

            </div>
          `
          : `
            <button
              class="cover-empty"
              id="addCoverBtn"
              type="button"
            >
              <span class="cover-empty-icon">
                ＋
              </span>

              <span>
                Добавить обложку
              </span>
            </button>
          `
      }
    </div>

    <div
      class="toolbar chrome"
      id="toolbar"
    >
      <button
        data-cmd="bold"
        title="Жирный"
      >
        B
      </button>

      <button
        data-cmd="italic"
        title="Курсив"
      >
        i
      </button>

      <button
        data-cmd="underline"
        title="Подчёркнутый"
      >
        U
      </button>
    </div>

    <div id="blocksHost"></div>

    <button
      class="btn btn-primary publish-btn"
      id="publishBtn"
      type="button"
    >
      ${d.id?'Сохранить изменения':'Опубликовать'}
    </button>

    <input
      type="file"
      accept="image/*"
      id="coverInput"
      style="display:none"
    >

    <input
      type="file"
      accept="image/*"
      multiple
      id="fileInput"
      style="display:none"
    >

    <div
      class="hint chrome"
      id="editorHint"
    ></div>
  `;

  document.getElementById('titleInput').oninput=
    e=>d.title=e.target.value;

  document
    .querySelectorAll('#toolbar button')
    .forEach(btn=>{
      btn.addEventListener(
        'mousedown',
        e=>{
          e.preventDefault();

          if(!activeBlockEl)return;

          document.execCommand(
            btn.dataset.cmd,
            false,
            null
          );

          activeBlockEl.dispatchEvent(
            new Event('input')
          );
        }
      );
    });

  document
    .getElementById('addCoverBtn')
    ?.addEventListener(
      'click',
      ()=>document.getElementById('coverInput').click()
    );

  document
    .getElementById('changeCoverBtn')
    ?.addEventListener(
      'click',
      ()=>document.getElementById('coverInput').click()
    );

  document
    .getElementById('removeCoverBtn')
    ?.addEventListener(
      'click',
      ()=>{
        d.cover=null;
        renderEditor();
        showToast('Обложка убрана');
      }
    );

  document.getElementById('coverInput').onchange=
    async e=>{
      const f=e.target.files[0];

      if(!f)return;

      try{
        d.cover=await compressImageFile(
          f,
          1600,
          .84
        );

        renderEditor();

      }catch(err){
        showToast(
          'Не удалось обработать обложку'
        );
      }

      e.target.value='';
    };

  document.getElementById('fileInput').onchange=
    async e=>{
      const files=[
        ...e.target.files||[]
      ];

      if(!files.length)return;

      try{
        const idx=
          Number.isInteger(
            state.pendingImageInsertIndex
          )
            ? state.pendingImageInsertIndex
            : d.blocks.length;

        const blocks=[];

        for(const f of files){
          blocks.push({
            type:'image',
            src:await compressImageFile(f),
            caption:'',
            _pendingFile:true
          });
        }

        d.blocks.splice(
          idx,
          0,
          ...blocks
        );

        state.pendingImageInsertIndex=null;

        renderBlocks({
          focusIndex:idx
        });

      }catch(err){
        showToast(
          'Не удалось обработать изображение'
        );
      }

      e.target.value='';
    };

  document.getElementById('publishBtn').onclick=
    publishDraft;

  renderBlocks();
}

function insertBlockAfter(index,block){
  state.draft.blocks.splice(
    index+1,
    0,
    block
  );

  renderBlocks({
    focusIndex:
      block.type==='text'
        ? index+1
        : null
  });
}

function openImagePicker(insertIndex){
  state.pendingImageInsertIndex=insertIndex;

  const input=document.getElementById(
    'fileInput'
  );

  if(input){
    input.value='';
    input.click();
  }
}

function createBlockAddControls(index){
  const row=document.createElement('div');

  row.className='block-add-row';

  row.innerHTML=`
    <button
      class="block-add-btn"
      type="button"
      data-add="text"
    >
      ＋ Текст
    </button>

    <button
      class="block-add-btn"
      type="button"
      data-add="image"
    >
      ＋ Картинка
    </button>
  `;

  row
    .querySelector('[data-add="text"]')
    .onclick=()=>{
      insertBlockAfter(
        index,
        {
          type:'text',
          html:''
        }
      );
    };

  row
    .querySelector('[data-add="image"]')
    .onclick=()=>{
      openImagePicker(index+1);
    };

  return row;
}

function renderBlocks(options={}){
  const host=document.getElementById(
    'blocksHost'
  );

  if(!host)return;

  const d=state.draft;
  const old=activeBlockEl;

  let activeIndex=null;
  let offset=null;

  if(
    old?.isConnected &&
    old.dataset.i!==undefined
  ){
    activeIndex=Number(old.dataset.i);

    try{
      const s=getSelection();

      if(s?.rangeCount){
        const r=s.getRangeAt(0);

        if(old.contains(r.startContainer)){
          offset=getCaretOffset(
            old,
            r
          );
        }
      }

    }catch(e){}
  }

  host.innerHTML='';

  d.blocks.forEach((b,i)=>{
    const block=document.createElement('div');

    block.className='block';
    block.dataset.i=i;

    if(b.type==='text'){
      block.innerHTML=`
        <button
          class="block-remove"
          data-act="del"
          data-i="${i}"
          type="button"
        >
          ✕
        </button>

        <div
          class="block-text"
          contenteditable="true"
          data-i="${i}"
          data-placeholder="Текст абзаца…"
        >
          ${sanitizeHtml(b.html||'')}
        </div>
      `;
    }

    else if(b.type==='image'){
      block.className=
        'block block-image-wrap';

      block.innerHTML=`
        <button
          class="block-remove"
          data-act="del"
          data-i="${i}"
          type="button"
        >
          ✕
        </button>

        <img
          src="${escapeHtml(b.src||'')}"
          alt=""
        >

        <input
          class="block-caption"
          data-i="${i}"
          placeholder="Подпись (необязательно)"
          value="${escapeHtml(b.caption||'')}"
        >
      `;
    }

    else{
      return;
    }

    host.appendChild(block);
    host.appendChild(
      createBlockAddControls(i)
    );
  });

  host
    .querySelectorAll('.block-text')
    .forEach(el=>{
      el.onfocus=()=>{
        activeBlockEl=el;
      };

      el.oninput=e=>{
        const i=+e.target.dataset.i;

        if(d.blocks[i]?.type==='text'){
          d.blocks[i].html=
            sanitizeHtml(
              e.target.innerHTML
            );
        }
      };

      el.onkeyup=()=>{
        activeBlockEl=el;
      };

      el.onmouseup=()=>{
        activeBlockEl=el;
      };
    });

  host
    .querySelectorAll('.block-caption')
    .forEach(el=>{
      el.oninput=e=>{
        const i=+e.target.dataset.i;

        if(d.blocks[i]?.type==='image'){
          d.blocks[i].caption=
            e.target.value;
        }
      };
    });

  host
    .querySelectorAll('[data-act="del"]')
    .forEach(el=>{
      el.onclick=()=>{
        const i=+el.dataset.i;

        if(!d.blocks[i])return;

        d.blocks.splice(i,1);

        if(!d.blocks.length){
          d.blocks.push({
            type:'text',
            html:''
          });
        }

        renderBlocks({
          focusIndex:
            Math.min(
              i,
              d.blocks.length-1
            )
        });
      };
    });

  if(
    options.focusIndex!==undefined &&
    options.focusIndex!==null
  ){
    const t=host.querySelector(
      `.block-text[data-i="${options.focusIndex}"]`
    );

    if(t){
      requestAnimationFrame(()=>{
        t.focus();
        activeBlockEl=t;
        placeCaretAtEnd(t);
      });
    }

    return;
  }

  if(
    activeIndex!==null &&
    activeIndex<d.blocks.length
  ){
    const t=host.querySelector(
      `.block-text[data-i="${activeIndex}"]`
    );

    if(
      t &&
      document.activeElement===document.body
    ){
      t.focus();
      activeBlockEl=t;

      if(offset!==null){
        setCaretOffset(t,offset);
      }
    }
  }
}

function getCaretOffset(el,range){
  const r=range.cloneRange();

  r.selectNodeContents(el);

  r.setEnd(
    range.startContainer,
    range.startOffset
  );

  return r.toString().length;
}

function setCaretOffset(el,offset){
  const s=getSelection();

  if(!s)return;

  const r=document.createRange();

  let cur=0;
  let found=false;

  function walk(n){
    if(found)return;

    if(n.nodeType===3){
      const len=n.nodeValue.length;

      if(cur+len>=offset){
        r.setStart(
          n,
          Math.max(
            0,
            offset-cur
          )
        );

        r.collapse(true);
        found=true;
        return;
      }

      cur+=len;
      return;
    }

    n.childNodes.forEach(walk);
  }

  walk(el);

  if(!found){
    placeCaretAtEnd(el);
    return;
  }

  s.removeAllRanges();
  s.addRange(r);
}

function placeCaretAtEnd(el){
  const s=getSelection();

  if(!s)return;

  const r=document.createRange();

  r.selectNodeContents(el);
  r.collapse(false);

  s.removeAllRanges();
  s.addRange(r);
}

async function uploadImage(dataUrl,filename){
  const res=await fetch(dataUrl);
  const blob=await res.blob();

  const safe=String(
    filename||'image.jpg'
  ).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );

  const path=
    `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;

  const {error}=
    await db.storage
      .from('images')
      .upload(
        path,
        blob,
        {
          contentType:
            blob.type||'image/jpeg',
          upsert:false
        }
      );

  if(error)throw error;

  return db.storage
    .from('images')
    .getPublicUrl(path)
    .data.publicUrl;
}

function compressImageFile(
  file,
  maxW=1200,
  quality=.82
){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();

    r.onload=e=>{
      const img=new Image();

      img.onload=()=>{
        let w=img.width;
        let h=img.height;

        if(w>maxW){
          h=Math.round(
            h*maxW/w
          );

          w=maxW;
        }

        const c=document.createElement(
          'canvas'
        );

        c.width=w;
        c.height=h;

        c
          .getContext('2d')
          .drawImage(
            img,
            0,
            0,
            w,
            h
          );

        resolve(
          c.toDataURL(
            'image/jpeg',
            quality
          )
        );
      };

      img.onerror=reject;
      img.src=e.target.result;
    };

    r.onerror=reject;
    r.readAsDataURL(file);
  });
}

async function publishDraft(){
  const d=state.draft;

  const hasContent=
    !!d.title.trim() ||
    !!d.cover ||
    d.blocks.some(
      b=>
        b.type==='image' ||
        (
          b.type==='text' &&
          b.html
            .replace(/<[^>]+>/g,'')
            .trim()
        )
    );

  if(!hasContent){
    showToast(
      'Добавьте заголовок или содержимое'
    );
    return;
  }

  const button=
    document.getElementById(
      'publishBtn'
    );

  const hint=
    document.getElementById(
      'editorHint'
    );

  button.disabled=true;

  hint.textContent=
    d.id
      ? 'Сохраняем изменения…'
      : 'Публикуем…';

  try{
    const profile=
      await ensureProfile(true);

    if(!profile){
      throw new Error(
        'Необходимо указать ник'
      );
    }

    let cover=d.cover||null;

    if(cover?.startsWith('data:')){
      cover=await uploadImage(
        cover,
        'cover.jpg'
      );
    }

    for(const b of d.blocks){
      if(
        b.type==='image' &&
        b._pendingFile
      ){
        b.src=await uploadImage(
          b.src,
          'image.jpg'
        );

        delete b._pendingFile;
      }
    }

    const first=d.blocks.find(
      b=>
        b.type==='text' &&
        b.html?.trim()
    );

    const excerpt=
      first
        ? first.html
            .replace(/<[^>]+>/g,'')
            .trim()
            .slice(0,140)
        : '';

    const payload={
      title:
        d.title.trim()||
        'Без названия',
      excerpt,
      cover,
      blocks:d.blocks
    };

    if(!d.id){
      const r=
        await callTelegramApi(
          'create-article',
          {article:payload}
        );

      showToast('Опубликовано');

      await openReader(
        r.article.id
      );

    }else{
      const r=
        await callTelegramApi(
          'update-article',
          {
            article:{
              id:d.id,
              ...payload
            }
          }
        );

      showToast(
        'Изменения сохранены'
      );

      await openReader(
        r.article.id
      );
    }

  }catch(e){
    console.error(e);

    showToast(
      e.message||
      'Ошибка публикации'
    );

    hint.textContent='';

  }finally{
    button.disabled=false;
  }
}

async function openProfile(){
  state.view='profile';
  state.currentId=null;

  setBackButton(
    true,
    renderFeed
  );

  const main=
    document.getElementById('main');

  main.innerHTML=
    '<div class="loading">Загрузка профиля…</div>';

  try{
    const p=
      await ensureProfile(false);

    if(!p){
      main.innerHTML=`
        <div class="profile-page">
          <div class="profile-card chrome">

            <div class="profile-avatar">
              ?
            </div>

            <h2>Профиль</h2>

            <p>
              У вас пока нет ника
            </p>

            <button
              class="btn btn-primary"
              id="createProfileBtn"
            >
              Придумать ник
            </button>

          </div>
        </div>
      `;

      document
        .getElementById('createProfileBtn')
        .onclick=async()=>{
          if(
            await ensureProfile(true)
          ){
            openProfile();
          }
        };

      return;
    }

    const first=
      p.username
        .trim()
        .charAt(0)
        .toUpperCase();

    main.innerHTML=`
      <div class="profile-page">

        <div class="profile-card chrome">

          <div class="profile-avatar">
            ${escapeHtml(first||'?')}
          </div>

          <div class="profile-label">
            Ваш ник
          </div>

          <div class="profile-username">
            ${escapeHtml(p.username)}
          </div>

          <button
            class="btn btn-primary profile-edit-btn"
            id="changeUsernameBtn"
          >
            Изменить ник
          </button>

          <div class="profile-description">
            Этот ник отображается рядом с вашими статьями.
          </div>

        </div>

      </div>
    `;

    document
      .getElementById('changeUsernameBtn')
      .onclick=async()=>{
        if(
          await openUsernameDialog(
            p.username
          )
        ){
          openProfile();
        }
      };

  }catch(e){
    main.innerHTML=`
      <div class="empty-state">
        <h2>
          Не удалось открыть профиль
        </h2>

        <p>
          ${escapeHtml(e.message||'')}
        </p>
      </div>
    `;
  }
}

function setBackButton(
  show,
  onClick
){
  if(!tg?.BackButton)return;

  try{
    if(
      setBackButton._last &&
      tg.BackButton.offClick
    ){
      tg.BackButton.offClick(
        setBackButton._last
      );
    }

    if(show){
      tg.BackButton.show();

      if(tg.BackButton.onClick){
        tg.BackButton.onClick(
          onClick
        );

        setBackButton._last=
          onClick;
      }
    }else{
      tg.BackButton.hide();
      setBackButton._last=null;
    }

  }catch(e){
    console.warn(
      'BackButton:',
      e
    );
  }
}

document
  .getElementById('homeLink')
  ?.addEventListener(
    'click',
    renderFeed
  );

document
  .getElementById('newArticleBtn')
  ?.addEventListener(
    'click',
    openEditor
  );

document
  .getElementById('profileBtn')
  ?.addEventListener(
    'click',
    openProfile
  );

(async function init(){
  try{
    const startParam=
      tg?.initDataUnsafe?.start_param;

    if(startParam){
      await openReader(
        startParam
      );
    }else{
      await renderFeed();
    }

  }catch(e){
    console.error(
      'Init:',
      e
    );

    showToast(
      'Ошибка запуска приложения'
    );
  }
})();
