const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://allfresh.co.kr';
const CATEGORIES = [
  { no: '31',  name: '혼합과일선물' },
  { no: '127', name: '단품과일선물' },
  { no: '123', name: '탄생과' },
  { no: '130', name: '시그니처과일선물' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://allfresh.co.kr/',
};

// Cafe24 상품 상세 URL 패턴: /product/{slug}/{numeric-id}/...
const PRODUCT_URL_RE = /\/product\/[^/]+\/\d+\//;

function toAbsUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return BASE_URL + (url.startsWith('/') ? url : '/' + url);
}

function normalizeUrl(href) {
  // Cafe24 URL: /product/{slug}/{product-id}/category/... → 슬러그+ID로만 고유 식별
  const match = href.match(/\/product\/([^/]+)\/(\d+)\//);
  if (match) return `product_${match[2]}`; // 상품 ID로 중복 체크
  try {
    const u = new URL(toAbsUrl(href));
    return u.origin + u.pathname;
  } catch { return toAbsUrl(href); }
}

function extractPrice(text) {
  // "소비자가 : 39,800원 판매가 : 37,810원" → 최저 가격(판매가)
  const nums = text.match(/(\d{2,3},\d{3})/g) || [];
  const prices = nums
    .map(n => parseInt(n.replace(',', '')))
    .filter(p => p > 10000 && p < 500000);
  if (!prices.length) return 0;
  return Math.min(...prices); // 판매가(최저)
}

async function crawlAllfresh() {
  const products = [];
  const seenUrls = new Set();

  for (const cat of CATEGORIES) {
    try {
      const url = `${BASE_URL}/product/list.html?cate_no=${cat.no}`;
      console.log(`[올프레쉬] 크롤링: ${cat.name}`);

      const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(data);

      // Cafe24 상품 상세 링크: /product/{slug}/{id}/category/...
      $('a[href]').filter((i, el) => PRODUCT_URL_RE.test($(el).attr('href') || '')).each((i, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const norm = normalizeUrl(href);

        if (seenUrls.has(norm)) return;

        const $li = $a.closest('li.xans-record-, li[class*="record"]');
        // xans-record 없으면 가장 가까운 li 사용
        const $container = $li.length ? $li : $a.closest('li');
        if ($container.length === 0) return;

        // 상품명: li 전체 텍스트에서 "상품명 :" 뒤 부분 추출
        const fullText = $container.text().replace(/\s+/g, ' ').trim();
        let name = '';

        const nameMatch = fullText.match(/상품명\s*:\s*(.+?)(?=소비자가|판매가|$)/);
        if (nameMatch) {
          name = nameMatch[1].trim();
        } else {
          // a 태그 title 또는 텍스트
          name = $a.attr('title') || $a.text().trim() || '';
          name = name.replace(/^상품명\s*:\s*/i, '').trim();
        }

        if (!name || name.length < 2) return;

        const price = extractPrice(fullText);
        if (price < 50000 || price > 150000) return;

        // 이미지
        const img = $container.find('img').first();
        const rawSrc = img.attr('src') || img.attr('data-src') || img.attr('data-original') || '';
        const imageUrl = toAbsUrl(rawSrc);

        seenUrls.add(norm);
        products.push({
          vendor: 'allfresh',
          vendor_name: '올프레쉬',
          name: name.substring(0, 100),
          price,
          image_url: imageUrl,
          product_url: toAbsUrl(href),
          category: cat.name,
        });
      });

      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`[올프레쉬] ${cat.name} 오류:`, err.message);
    }
  }

  console.log(`[올프레쉬] ${products.length}개 수집`);
  return products;
}

module.exports = { crawlAllfresh };
