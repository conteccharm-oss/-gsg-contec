const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://f-mans.com';
const CATEGORIES = [
  { code: '0001', name: '꽃선물' },
  { code: '0003', name: '승진/취임' },
  { code: '0004', name: '결혼/장례' },
  { code: '0006', name: '트렌드픽' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
};

function parsePrice(text) {
  const match = text.replace(/[,\s]/g, '').match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

function toAbsUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return BASE_URL + (url.startsWith('/') ? url : '/' + url);
}

async function crawlFmans() {
  const products = [];

  for (const cat of CATEGORIES) {
    try {
      const url = `${BASE_URL}/goods/catalog_list?code=${cat.code}`;
      console.log(`[꽃집청년들] 크롤링: ${cat.name}`);

      const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(data);

      // 상품 링크가 /goods/view?no= 패턴인 항목을 찾아서 부모로 거슬러 올라감
      $('a[href*="/goods/view?no="]').each((i, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const $item = $a.closest('li');

        if ($item.length === 0) return;

        // 이미 처리한 URL 중복 방지
        const productUrl = toAbsUrl(href);
        if (products.some(p => p.product_url === productUrl)) return;

        // 이미지
        const img = $item.find('img').first();
        const rawSrc = img.attr('src') || img.attr('data-src') || '';
        const imageUrl = toAbsUrl(rawSrc);

        // 상품명: a 태그 title, alt, 또는 텍스트
        let name = $a.attr('title') || $a.text().trim() || img.attr('alt') || '';
        if (!name) {
          name = $item.find('.name, .prdName, .goods_tit, .item_name').first().text().trim();
        }
        if (!name || name.length < 2) return;

        // 가격: 숫자가 포함된 텍스트 탐색
        let price = 0;
        $item.find('*').each((j, priceEl) => {
          const t = $(priceEl).clone().children().remove().end().text().trim();
          if (t.includes('원') || /^\d{4,7}$/.test(t.replace(/[,]/g, ''))) {
            const p = parsePrice(t);
            if (p > 10000 && p < 1000000) { price = p; return false; }
          }
        });

        const SEOUL_KEYWORDS = ['서울', '당일', '서울한정', '서울지역'];
        const isSeoulOnly = SEOUL_KEYWORDS.some(kw => name.includes(kw));
        if (price >= 50000 && price < 130000 && !isSeoulOnly) {
          products.push({
            vendor: 'fmans',
            vendor_name: '꽃집청년들',
            name: name.substring(0, 100),
            price,
            image_url: imageUrl,
            product_url: productUrl,
            category: cat.name,
          });
        }
      });

      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[꽃집청년들] ${cat.name} 오류:`, err.message);
    }
  }

  console.log(`[꽃집청년들] ${products.length}개 수집`);
  return products;
}

module.exports = { crawlFmans };
