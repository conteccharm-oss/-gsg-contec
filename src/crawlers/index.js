const { crawlFmans } = require('./fmans');
const { crawlSirloin } = require('./sirloin');
const { crawlAllfresh } = require('./allfresh');
const db = require('../db');

async function crawlAll() {
  console.log('===== 전체 크롤링 시작 =====');
  const start = Date.now();

  const [fmans, sirloin, allfresh] = await Promise.allSettled([
    crawlFmans(),
    crawlSirloin(),
    crawlAllfresh(),
  ]);

  const allProducts = [
    ...(fmans.status === 'fulfilled' ? fmans.value : []),
    ...(sirloin.status === 'fulfilled' ? sirloin.value : []),
    ...(allfresh.status === 'fulfilled' ? allfresh.value : []),
  ];

  if (allProducts.length === 0) {
    console.log('수집된 상품이 없습니다.');
    return 0;
  }

  const count = db.replaceProducts(allProducts);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`===== 크롤링 완료: ${count}개 저장 (${elapsed}초) =====`);
  return count;
}

module.exports = { crawlAll };
