// 광고 배너 + 운영자 모드 (편집 · 순서 · 기간)
// app.js 와 이름이 겹치지 않게 즉시 실행 함수로 감싼다
(() => {
  const API = window.ADS_API_URL.replace(/\/+$/, '');
  const TOKEN_KEY = 'boxoffice-admin-token';

  const $ = (id) => document.getElementById(id);
  const $ads = $('ads');
  const $toggle = $('adminToggle');
  const $admin = $('admin');
  const $login = $('login');
  const $token = $('token');
  const $editor = $('editor');
  const $editList = $('editList');
  const $adminStatus = $('adminStatus');
  const $published = $('published');
  const $add = $('addAd');
  const $save = $('saveAds');

  const state = { admin: false, token: '', ads: [], publishedAt: null, dirty: false };

  // sessionStorage: 탭을 닫으면 사라진다. 막혀 있는 환경도 있어서 try/catch
  const session = {
    get: () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
    set: (v) => { try { sessionStorage.setItem(TOKEN_KEY, v); } catch {} },
    clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} },
  };

  async function request(method, path = '/', body) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- 기간 판단 (보는 사람 기준 현지 시각) ----------
  // '2026-12-20T09:00' 처럼 타임존 없는 값은 브라우저가 현지 시각으로 읽는다

  function scheduleState(ad, now = new Date()) {
    if (ad.startAt && now < new Date(ad.startAt)) return 'upcoming';
    if (ad.endAt && now >= new Date(ad.endAt)) return 'ended';
    return 'live';
  }
  const isVisible = (ad) => ad.active && scheduleState(ad) === 'live';

  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  // ---------- 배너 (일반 화면) ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text; // textContent 라서 HTML 이 실행되지 않는다
    return node;
  }

  function renderBanners(ads) {
    $ads.replaceChildren(
      ...ads.filter(isVisible).map((ad) => {
        const box = ad.link ? el('a', 'ad') : el('div', 'ad');
        if (ad.link) {
          box.href = ad.link;
          box.target = '_blank';
          box.rel = 'noopener noreferrer';
        }
        box.append(el('span', 'ad-label', 'AD'), el('p', 'ad-title', ad.title));
        if (ad.text) box.append(el('p', 'ad-text', ad.text));
        const li = el('li');
        li.append(box);
        return li;
      })
    );
  }

  async function loadPublic() {
    try {
      const data = await request('GET');
      renderBanners(data.ads);
    } catch (err) {
      console.warn('광고를 불러오지 못했어요', err); // 광고가 실패해도 영화 목록은 그대로 보이게
      $ads.replaceChildren();
    }
  }

  // ---------- 운영자 모드: 편집 ----------

  function setStatus(text, isError = false) {
    $adminStatus.textContent = text;
    $adminStatus.className = isError ? 'status error' : 'status';
  }

  function renderPublished() {
    $published.textContent = state.publishedAt ? `마지막 저장 ${fmtTime(state.publishedAt)}` : '아직 저장한 적이 없어요.';
  }

  function markDirty() {
    state.dirty = true;
    setStatus('저장하지 않은 변경 사항이 있어요.');
    renderBanners(state.ads); // 편집하면서 위쪽 배너로 미리보기 (지금 시각 기준으로 보일 것만)
  }

  const BADGE = { live: ['노출 중', 'badge live'], upcoming: ['예약', 'badge'], ended: ['기간 종료', 'badge'] };

  function renderEditor() {
    if (!state.ads.length) {
      $editList.replaceChildren(el('li', 'empty', '아직 광고가 없어요. "+ 광고 추가"를 눌러보세요.'));
      return;
    }

    $editList.replaceChildren(
      ...state.ads.map((ad, i) => {
        const li = el('li', ad.active ? 'edit-item' : 'edit-item off');

        const input = (type, field, placeholder, maxLength) => {
          const node = document.createElement('input');
          Object.assign(node, { type, placeholder, value: ad[field] ?? '' });
          if (maxLength) node.maxLength = maxLength;
          node.addEventListener('input', () => {
            ad[field] = node.value;
            if (field === 'startAt' || field === 'endAt') refreshBadge();
            markDirty();
          });
          return node;
        };
        const button = (label, onClick, disabled = false) => {
          const node = el('button', '', label);
          node.type = 'button';
          node.disabled = disabled;
          node.addEventListener('click', onClick);
          return node;
        };
        const move = (to) => () => {
          [state.ads[i], state.ads[to]] = [state.ads[to], state.ads[i]];
          renderEditor();
          markDirty();
        };

        const badge = el('span');
        const refreshBadge = () => {
          const [text, cls] = ad.active ? BADGE[scheduleState(ad)] : ['숨김', 'badge'];
          badge.textContent = text;
          badge.className = cls;
        };
        refreshBadge();

        const top = el('div', 'edit-row');
        top.append(
          el('span', 'order', String(i + 1)),
          badge,
          el('span', 'spacer'),
          button('▲', move(i - 1), i === 0),
          button('▼', move(i + 1), i === state.ads.length - 1),
          button('삭제', () => { state.ads.splice(i, 1); renderEditor(); markDirty(); })
        );

        const active = document.createElement('input');
        active.type = 'checkbox';
        active.checked = ad.active;
        active.addEventListener('change', () => {
          ad.active = active.checked;
          li.className = ad.active ? 'edit-item' : 'edit-item off';
          refreshBadge();
          markDirty();
        });
        const activeLabel = el('label');
        activeLabel.append(active, '노출');

        const linkRow = el('div', 'edit-row');
        const link = input('url', 'link', 'https:// 링크 (선택)', 300);
        link.style.flex = '1';
        linkRow.append(link, activeLabel);

        // 기간: 비워두면 제한 없음 (시작 없으면 즉시, 종료 없으면 계속)
        const dateRow = el('div', 'edit-row dates');
        for (const [field, label] of [['startAt', '시작 (비우면 즉시)'], ['endAt', '종료 (비우면 계속)']]) {
          const wrap = el('label');
          wrap.append(label, input('datetime-local', field));
          dateRow.append(wrap);
        }

        li.append(top, input('text', 'title', '제목 (필수)', 40), input('text', 'text', '설명 한 줄 (선택)', 100), linkRow, dateRow);
        return li;
      })
    );
  }

  // ---------- 운영자 모드: 켜기/끄기 · 로그인 · 저장 ----------

  async function login(token) {
    state.token = token;
    try {
      const data = await request('GET');
      if (!data.admin) throw new Error('관리자 토큰이 맞지 않아요.');
      state.admin = true;
      state.ads = data.ads;
      state.publishedAt = data.publishedAt;
      state.dirty = false;
      session.set(token);
      $login.hidden = true;
      $editor.hidden = false;
      setStatus('');
      renderPublished();
      renderEditor();
      renderBanners(state.ads);
    } catch (err) {
      state.token = '';
      session.clear();
      $login.hidden = false;
      $editor.hidden = true;
      setStatus('');
      $token.setCustomValidity(err.message);
      $token.reportValidity();
    }
  }

  function setMode(on) {
    if (!on && state.dirty && !confirm('저장하지 않은 변경 사항이 있어요. 운영자 모드를 끌까요?')) return;
    $toggle.setAttribute('aria-pressed', String(on));
    $admin.hidden = !on;

    if (on) {
      const saved = session.get();
      if (saved) login(saved);
      else { $login.hidden = false; $editor.hidden = true; $token.focus(); }
    } else {
      state.admin = false;
      state.dirty = false;
      loadPublic(); // 끄면 저장된 실제 광고로 되돌린다
    }
  }

  $toggle.addEventListener('click', () => setMode($toggle.getAttribute('aria-pressed') !== 'true'));

  $token.addEventListener('input', () => $token.setCustomValidity(''));
  $login.addEventListener('submit', (e) => {
    e.preventDefault();
    login($token.value.trim());
  });

  $add.addEventListener('click', () => {
    state.ads.push({ title: '', text: '', link: '', active: true });
    renderEditor();
    markDirty();
    $editList.lastElementChild.querySelector('input[type="text"]').focus();
  });

  $save.addEventListener('click', async () => {
    $save.disabled = true;
    setStatus('저장 중…');
    try {
      const data = await request('PUT', '/', { ads: state.ads });
      state.ads = data.ads; // 서버가 정리한 값(id, 공백 제거)으로 교체
      state.publishedAt = data.publishedAt;
      state.dirty = false;
      renderPublished();
      renderEditor();
      renderBanners(state.ads);
      setStatus('저장했어요.');
    } catch (err) {
      if (err.status === 401) {
        session.clear();
        setStatus('토큰이 더 이상 맞지 않아요. 운영자 모드를 다시 켜주세요.', true);
      } else {
        setStatus(`저장하지 못했어요: ${err.message}`, true);
      }
    } finally {
      $save.disabled = false;
    }
  });

  loadPublic();
})();
