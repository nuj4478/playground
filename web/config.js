// API 주소. Lambda 함수 하나(boxoffice)에 /movies, /ads 경로로 나뉘어 있다.
// (이 주소는 공개돼도 괜찮다. 비밀값인 KOBIS 키와 운영자 토큰은 Lambda 안에만 있다.)

// const API_BASE = 'http://localhost:3001';                                              // 로컬
const API_BASE = 'https://oeme7mrjhebrxqcktt3mzddpmy0qqspr.lambda-url.ap-southeast-2.on.aws'; // AWS (끝에 / 없이)

window.API_URL = `${API_BASE}/movies`;   // 박스오피스
window.ADS_API_URL = `${API_BASE}/ads`;  // 광고
