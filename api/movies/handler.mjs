// 박스오피스 Lambda 핸들러
// - KOBIS API 키는 환경변수 KOBIS_KEY 에만 둔다 (코드·프론트에 절대 넣지 않음)
// - CORS 는 코드가 아니라 Function URL 설정에서 처리한다 (중복 헤더 방지)

const KOBIS_URL =
  'https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json';

/** 한국 시간 기준 어제 날짜를 YYYYMMDD 로 */
export function yesterdayKST(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10).replaceAll('-', '');
}

/** YYYYMMDD 의 하루 전 날짜 */
export function dayBefore(yyyymmdd) {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  body: JSON.stringify(body),
});

/** KOBIS 에서 하루치 박스오피스를 받아 필요한 필드만 돌려준다. 실패하면 throw */
async function fetchBoxOffice(key, date) {
  const url = `${KOBIS_URL}?key=${encodeURIComponent(key)}&targetDt=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`KOBIS HTTP ${res.status}`);
  const data = await res.json();

  // KOBIS 는 키 오류 등을 200 + faultInfo 로 돌려준다
  if (data.faultInfo) {
    const err = new Error('KOBIS fault');
    err.fault = data.faultInfo;
    throw err;
  }

  const list = data.boxOfficeResult?.dailyBoxOfficeList ?? [];
  return list.map((m) => ({
    rank: Number(m.rank),
    rankChange: Number(m.rankInten),
    isNew: m.rankOldAndNew === 'NEW',
    title: m.movieNm,
    openDate: m.openDt,
    audience: Number(m.audiCnt),
    audienceTotal: Number(m.audiAcc),
  }));
}

export const handler = async (event) => {
  const key = process.env.KOBIS_KEY;
  if (!key) return json(500, { error: '서버에 KOBIS_KEY 가 설정되지 않았어요.' });

  // ?date=YYYYMMDD 를 직접 지정했는지 (지정 안 하면 "가장 최근 집계일"을 알아서 찾는다)
  const requested = event?.queryStringParameters?.date;
  const latest = yesterdayKST();
  let date = requested ?? latest;

  if (!/^\d{8}$/.test(date)) {
    return json(400, { error: 'date 는 YYYYMMDD 형식이어야 해요.' });
  }
  if (date > latest) {
    return json(400, { error: `아직 집계되지 않은 날짜예요. ${latest} 까지만 조회할 수 있어요.` });
  }

  try {
    let movies = await fetchBoxOffice(key, date);
    let fallback = false;

    // 날짜를 지정하지 않았는데 어제치가 아직 집계 전(새벽)이면 → 그 전날로 한 번 더
    if (!requested && movies.length === 0) {
      console.log(`${date} 아직 집계 전 → ${dayBefore(date)} 로 대체`);
      date = dayBefore(date);
      movies = await fetchBoxOffice(key, date);
      fallback = true;
    }

    // 대체 응답은 곧 최신 데이터가 생기므로 짧게(10분), 나머지는 1시간 캐시
    const maxAge = fallback ? 600 : 3600;
    return json(200, { date, fallback, movies }, { 'Cache-Control': `public, max-age=${maxAge}` });
  } catch (err) {
    if (err.fault) {
      console.error('KOBIS fault', err.fault);
      return json(502, { error: 'KOBIS 요청이 거절됐어요.', detail: err.fault.message });
    }
    console.error(err);
    return json(502, { error: '박스오피스 정보를 가져오지 못했어요.' });
  }
};
