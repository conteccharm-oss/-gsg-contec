const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('./db');

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, day] = dateStr.split('-').map(Number);
  const next = new Date(today.getFullYear(), month - 1, day);
  if (next <= today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

function getNextDateLabel(dateStr) {
  const today = new Date();
  const [month, day] = dateStr.split('-').map(Number);
  const next = new Date(today.getFullYear(), month - 1, day);
  if (next <= today) next.setFullYear(today.getFullYear() + 1);
  return next.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function buildEmailHtml(anniversary, products, daysLeft) {
  const dLabel = daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`;

  const productRows = products.map(p => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #f0f0f0;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:80px;vertical-align:top;">
              ${p.image_url
                ? `<img src="${p.image_url}" width="75" height="75" style="border-radius:8px;object-fit:cover;" onerror="this.style.display='none'">`
                : '<div style="width:75px;height:75px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;">🎁</div>'}
            </td>
            <td style="padding-left:12px;vertical-align:top;">
              <div style="font-weight:600;color:#333;margin-bottom:4px;">${p.name}</div>
              <div style="color:#E74C3C;font-weight:700;font-size:16px;">${p.price.toLocaleString()}원</div>
              <div style="margin-top:4px;font-size:12px;color:#888;">${p.vendor_name}</div>
              ${p.product_url ? `<a href="${p.product_url}" style="display:inline-block;margin-top:8px;padding:6px 14px;background:#E74C3C;color:white;text-decoration:none;border-radius:20px;font-size:13px;">구매하기</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const totalPrice = products.reduce((s, p) => s + p.price, 0);

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,'Apple SD Gothic Neo',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);padding:32px;text-align:center;">
      <div style="font-size:48px;">🎁</div>
      <div style="color:white;font-size:24px;font-weight:700;margin-top:8px;">${dLabel}</div>
      <div style="color:rgba(255,255,255,0.95);font-size:17px;margin-top:6px;">${anniversary.person_name}님 ${anniversary.anniversary_type}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px;">${getNextDateLabel(anniversary.date)}</div>
    </div>
    <div style="padding:20px;">
      ${products.length > 0 ? `
        <div style="color:#666;font-size:14px;margin-bottom:16px;">선택하신 선물 후보 ${products.length}개</div>
        <table style="width:100%;border-collapse:collapse;">${productRows}</table>
        <div style="background:#FFF5F5;border-radius:8px;padding:14px;margin-top:16px;text-align:right;">
          <span style="color:#666;font-size:14px;">합계: </span>
          <span style="color:#E74C3C;font-weight:700;font-size:18px;">${totalPrice.toLocaleString()}원</span>
        </div>
      ` : `<div style="text-align:center;padding:20px;color:#888;">선물 후보를 아직 선택하지 않으셨습니다.<br>대시보드에서 상품을 선택해보세요!</div>`}
      <div style="text-align:center;margin-top:20px;">
        <a href="http://localhost:3000" style="display:inline-block;padding:14px 32px;background:#333;color:white;text-decoration:none;border-radius:24px;font-size:15px;">대시보드에서 확인하기</a>
      </div>
    </div>
    <div style="padding:16px;text-align:center;color:#ccc;font-size:12px;border-top:1px solid #f0f0f0;">가족사랑기프트 자동 알림</div>
  </div>
</body>
</html>`;
}

async function sendNotification(anniversary, products, daysLeft) {
  const emailTo = db.getSetting('email_to');
  const emailUser = db.getSetting('email_user');
  const emailPass = db.getSetting('email_pass');

  if (!emailTo || !emailUser || !emailPass) {
    console.log('[알림] 이메일 설정이 없습니다. 설정 탭에서 이메일을 설정해주세요.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass },
  });

  const dLabel = daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`;
  const subject = `🎁 [가족사랑기프트] ${anniversary.person_name}님 ${anniversary.anniversary_type} ${dLabel}`;

  try {
    await transporter.sendMail({
      from: `"가족사랑기프트" <${emailUser}>`,
      to: emailTo,
      subject,
      html: buildEmailHtml(anniversary, products, daysLeft),
    });
    console.log(`[알림] "${anniversary.person_name}" 이메일 발송 완료`);
    return true;
  } catch (err) {
    console.error('[알림] 이메일 발송 실패:', err.message);
    return false;
  }
}

function checkAnniversaries() {
  const anniversaries = db.getAllAnniversaries();

  for (const ann of anniversaries) {
    const daysLeft = getDaysUntil(ann.date);
    const notifyDays = (ann.notify_days || '7,3,1').split(',').map(Number);

    if (daysLeft !== null && notifyDays.includes(daysLeft)) {
      sendNotification(ann, ann.products || [], daysLeft);
    }
  }
}

function startScheduler() {
  cron.schedule('0 9 * * *', () => {
    console.log('[스케줄러] 기념일 체크 시작');
    checkAnniversaries();
  }, { timezone: 'Asia/Seoul' });

  console.log('[스케줄러] 매일 오전 9시 알림 스케줄러 시작됨');
}

module.exports = { startScheduler, checkAnniversaries, sendNotification, getDaysUntil };
