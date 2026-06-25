const axios = require('axios');

const BASE_URL = 'https://www.sirloin.co.kr';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.sirloin.co.kr/',
};

function parsePrice(text) {
  if (!text) return 0;
  // "31,600원" 또는 "84,200원~" → 숫자만 추출
  const match = text.replace(/[,\s원₩]/g, '').match(/(\d{4,8})/);
  return match ? parseInt(match[1]) : 0;
}

async function getBuildId() {
  const { data } = await axios.get(`${BASE_URL}/products`, { headers: HEADERS, timeout: 12000 });
  const match = data.match(/"buildId"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

async function crawlSirloin() {
  console.log('[설로인] 크롤링 시작');

  try {
    const buildId = await getBuildId();
    if (!buildId) throw new Error('buildId를 찾을 수 없음');
    console.log(`[설로인] buildId: ${buildId}`);

    // Next.js data endpoint: 카테고리 전체 상품
    const encodedCategory = encodeURIComponent('전체');
    const dataUrl = `${BASE_URL}/_next/data/${buildId}/category/${encodedCategory}.json?filterTag=${encodedCategory}`;

    const { data: json } = await axios.get(dataUrl, { headers: HEADERS, timeout: 12000 });

    // pageProps.initialProducts 배열 파싱
    const initialProducts = json?.pageProps?.initialProducts || [];
    if (!initialProducts.length) {
      console.log('[설로인] initialProducts 비어있음');
      return [];
    }

    const products = initialProducts.map(item => {
      const name = item.name || '';
      if (!name) return null;

      // 가격: salesPrice 우선, 없으면 normalPrice
      const priceStr = item.representPrice?.salesPrice || item.representPrice?.normalPrice || '';
      const price = parsePrice(priceStr);
      // 5만원~15만원 범위 상품만 수집
      if (!price || price < 50000 || price > 150000) return null;

      // 이미지 (CDN 도메인 사용)
      const rawImg = item.thumbnailImage?.url || '';
      const imageUrl = rawImg.startsWith('http') ? rawImg : 'https://cdn.sirloin.co.kr' + rawImg;

      // 상품 URL: code 기반
      const code = item.code || item.id || '';
      const productUrl = code ? `${BASE_URL}/products/${code}` : `${BASE_URL}/products`;

      return {
        vendor: 'sirloin',
        vendor_name: '설로인',
        name: name.trim().substring(0, 100),
        price,
        image_url: imageUrl,
        product_url: productUrl,
        category: '한우',
      };
    }).filter(Boolean);

    console.log(`[설로인] ${products.length}개 수집`);
    return products;
  } catch (err) {
    console.error('[설로인] 오류:', err.message);
    return [];
  }
}

module.exports = { crawlSirloin };
