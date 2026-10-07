/**
 * 카누맵 — Google Apps Script (LOG_WEBHOOK 수신).
 * Cloudflare Worker 가 보내는 모든 type 을 각 시트 탭에 한 줄씩 기록한다.
 *
 * 적용:
 *   1) https://script.google.com → 이 프로젝트 열기 → 코드 전체를 이 내용으로 교체
 *   2) 배포 → 새 배포 또는 기존 배포 관리 → 버전 새로 만들기 → 배포
 *      (URL 이 바뀌면 Cloudflare Worker 의 Secret LOG_WEBHOOK 도 새 URL 로 갱신)
 *   3) 액세스: "나"(소유자) 실행 / "모든 사용자"(익명 포함) 접근 허용
 *
 * 받는 type:
 *   visit / paddling_visit {id, nick, type, dev}         → logins
 *   comment {notify, cid, place, nick, text, stars, img} → comments
 *   suggest {notify, cat, place, nick, text, lat, lng, img} → suggestions
 *   collect {status, added, detail}                      → collect
 *   soyang_travers {id, nick, name, cafeNick, phone}     → soyang_travers
 */

var INPUT_NOTIFY_EMAIL = "crowd@kakao.com";

function doPost(e) {
  var out = "ok";
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();

    if (d.type === "comment") {
      appendRow_(ss, "comments",
        ["시각", "ID", "장소", "닉네임", "별점", "코멘트", "사진"],
        [now, d.cid || "", d.place || "", d.nick || "", d.stars || "", d.text || "", d.img || ""]);
      if (d.notify === true) { notifyNewInput_(ss, d, "comment"); }

    } else if (d.type === "suggest") {
      appendRow_(ss, "suggestions",
        ["시각", "유형", "장소/주소", "닉네임", "설명", "위도", "경도", "사진"],
        [now, d.cat || "", d.place || "", d.nick || "", d.text || "", d.lat || "", d.lng || "", d.img || ""]);
      if (d.notify === true) { notifyNewInput_(ss, d, "suggest"); }

    } else if (d.type === "collect") {
      appendRow_(ss, "collect",
        ["시각", "상태", "신규", "상세"],
        [now, d.status || "", d.added || 0, d.detail || ""]);

    } else if (d.type === "soyang_travers") {
      appendRow_(ss, "soyang_travers",
        ["시각", "카카오ID", "카카오닉네임", "실명", "카페닉네임", "휴대전화", "동의"],
        [now, d.id || "", d.nick || "", d.name || "", d.cafeNick || "", d.phone || "", "Y"]);

    } else { // visit (기본)
      appendRow_(ss, "logins",
        ["시각", "카카오ID", "닉네임", "구분", "기기"],
        [now, d.id || "", d.nick || "", d.type || "visit", d.dev || ""]);
    }
  } catch (err) {
    out = "err: " + err;
  }
  return ContentService.createTextOutput(out);
}

// 시트가 없으면 헤더와 함께 생성하고, 한 줄 추가
function appendRow_(ss, name, header, row) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(header); }
  sh.appendRow(row);
}

// 새 이용자 입력만 운영 메일로 알린다. 관리자 작성·과거 내보내기·신청서는
// Worker가 notify=true를 보내지 않으므로 시트에는 기록돼도 메일은 발송하지 않는다.
function notifyNewInput_(ss, d, kind) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) {
      console.warn("카누맵 입력 알림: 일일 메일 할당량 소진");
      return;
    }

    var signature = [kind, d.cid || "", d.cat || "", d.place || "", d.nick || "", d.text || "", d.lat || "", d.lng || "", d.img || ""].join("|");
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signature, Utilities.Charset.UTF_8);
    var cacheKey = "input_mail_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "").slice(0, 36);
    var cache = CacheService.getScriptCache();
    if (cache.get(cacheKey)) { return; }

    var isSuggest = kind === "suggest";
    var label = isSuggest ? "새 건의·정보 추가" : "새 이용자 코멘트";
    var place = cleanText_(d.place || "위치 미입력", 80);
    var detail = cleanText_(d.text || "내용 미입력", 300);
    var nick = cleanText_(d.nick || "닉네임 미입력", 40);
    var subjectDetail = cleanText_((isSuggest ? d.cat : place) || place, 50);
    var subject = "[카누맵] " + label + " — " + subjectDetail;
    var sheetUrl = ss.getUrl();
    var rows = [
      ["구분", isSuggest ? cleanText_(d.cat || "기타", 30) : "코멘트"],
      ["장소", place],
      ["작성자", nick],
      ["내용", detail]
    ];
    if (!isSuggest && d.stars) { rows.push(["별점", cleanText_(d.stars, 5) + " / 5"]); }
    if (d.lat !== "" && d.lat != null && d.lng !== "" && d.lng != null) {
      rows.push(["좌표", cleanText_(d.lat, 24) + ", " + cleanText_(d.lng, 24)]);
    }
    var lat = Number(d.lat), lng = Number(d.lng);
    var mapUrl = isSuggest && isFinite(lat) && lat >= 32 && lat <= 40 && isFinite(lng) && lng >= 123 && lng <= 132
      ? "https://canoe.crowdbase.kr/?pin=" + lat.toFixed(6) + "," + lng.toFixed(6) : "";

    var plain = label + "이 등록되었습니다.\n\n";
    var htmlRows = "";
    for (var i = 0; i < rows.length; i++) {
      plain += rows[i][0] + ": " + rows[i][1] + "\n";
      htmlRows += "<tr><th style=\"padding:8px 12px;text-align:left;vertical-align:top;color:#65747a;white-space:nowrap\">" + htmlEscape_(rows[i][0]) + "</th><td style=\"padding:8px 12px;color:#16342f;white-space:pre-wrap\">" + htmlEscape_(rows[i][1]) + "</td></tr>";
    }
    if (mapUrl) { plain += "\n제안자가 찍은 지점: " + mapUrl + "\n"; }
    plain += "\n운영 시트: " + sheetUrl;
    var html = "<div style=\"font-family:Arial,'Apple SD Gothic Neo',sans-serif;max-width:640px;color:#16342f\">"
      + "<h2 style=\"margin:0 0 16px\">" + htmlEscape_(label) + "</h2>"
      + "<table style=\"width:100%;border-collapse:collapse;background:#f3f8f6;border-radius:12px\">" + htmlRows + "</table>"
      + (mapUrl ? "<p style=\"margin:20px 0 0\"><a href=\"" + htmlEscape_(mapUrl) + "\" style=\"display:inline-block;padding:10px 16px;border-radius:8px;background:#c7442b;color:#fff;text-decoration:none;font-weight:700\">📍 카누맵에서 찍은 지점 확인</a></p>" : "")
      + "<p style=\"margin:20px 0 0\"><a href=\"" + htmlEscape_(sheetUrl) + "\" style=\"display:inline-block;padding:10px 16px;border-radius:8px;background:#087f6b;color:#fff;text-decoration:none;font-weight:700\">운영 시트에서 확인</a></p>"
      + "</div>";

    MailApp.sendEmail({
      to: INPUT_NOTIFY_EMAIL,
      subject: subject,
      body: plain,
      htmlBody: html,
      name: "카누맵 알림"
    });
    cache.put(cacheKey, "1", 21600);
  } catch (err) {
    // 메일 장애가 시트 기록 성공 응답을 깨뜨리지 않도록 분리한다.
    console.error("카누맵 입력 알림 실패: " + err);
  }
}

function cleanText_(value, maxLength) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
}

function htmlEscape_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 최초 적용 때 편집기에서 한 번 실행하여 메일 발송 권한을 승인한다.
function authorizeNotifications() {
  MailApp.getRemainingDailyQuota();
  return "ok";
}

// (선택) GET 테스트용 — 브라우저로 열면 동작 확인
function doGet() {
  return ContentService.createTextOutput("mycanoe webhook ok");
}
