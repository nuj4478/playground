const $date = document.getElementById('date');
const $status = document.getElementById('status');
const $list = document.getElementById('list');

const fmt = new Intl.NumberFormat('ko-KR');

// 한국 시간 기준 어제 (YYYY-MM-DD) — 박스오피스는 어제까지만 집계된다
function yesterdayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

function changeBadge(m) {
  if (m.isNew) return '';
  if (m.rankChange > 0) return `<span class="change up">▲${m.rankChange}</span>`;
  if (m.rankChange < 0) return `<span class="change down">▼${-m.rankChange}</span>`;
  return `<span class="change same">-</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(movies) {
  $list.innerHTML = movies
    .map(
      (m) => `
      <li class="item">
        <div class="rank">${m.rank}${changeBadge(m)}</div>
        <div>
          <p class="title">${escapeHtml(m.title)}${m.isNew ? '<span class="new">NEW</span>' : ''}</p>
          <p class="meta">개봉 ${m.openDate || '-'} · 누적 ${fmt.format(m.audienceTotal)}명</p>
        </div>
        <div class="audience">
          <strong>${fmt.format(m.audience)}</strong>
          <span>일일 관객</span>
        </div>
      </li>`
    )
    .join('');
}

// isoDate 가 없으면 날짜를 보내지 않는다 → Lambda 가 "가장 최근 집계일"을 골라준다
async function load(isoDate) {
  $status.className = 'status';
  $status.textContent = '불러오는 중…';
  $list.innerHTML = '';

  try {
    const url = new URL(window.API_URL);
    if (isoDate) url.searchParams.set('date', isoDate.replaceAll('-', ''));
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Lambda 가 실제로 보여준 날짜로 달력을 맞춘다
    $date.value = `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}`;

    if (!data.movies.length) {
      $status.textContent = '이 날짜의 데이터가 없어요.';
      return;
    }
    $status.textContent = data.fallback
      ? `어제 박스오피스가 아직 집계 전이라 ${Number(data.date.slice(4, 6))}월 ${Number(data.date.slice(6, 8))}일 기준으로 보여드려요.`
      : '';
    render(data.movies);
  } catch (err) {
    $status.className = 'status error';
    $status.textContent = `불러오지 못했어요: ${err.message}`;
  }
}

const latest = yesterdayKST();
$date.max = latest;
$date.addEventListener('change', () => $date.value && load($date.value));
load(); // 첫 화면: 날짜 지정 없이 → 가장 최근 집계일
