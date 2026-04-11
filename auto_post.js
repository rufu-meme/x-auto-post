/**
 * X (Twitter) 自動投稿スクリプト
 * -----------------------------------------------
 * 必要パッケージ:
 *   npm install twitter-api-v2 node-cron dotenv
 *
 * 必要な環境変数 (.env):
 *   API_KEY=xxxx
 *   API_SECRET=xxxx
 *   ACCESS_TOKEN=xxxx
 *   ACCESS_TOKEN_SECRET=xxxx
 *
 * X Developer Portal でアプリを作成し、
 * Read and Write 権限を有効にしてください。
 * https://developer.twitter.com/en/portal/dashboard
 * -----------------------------------------------
 */

require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const holidays = require("japanese-holidays");

// ── 設定 ──────────────────────────────────────────
const TWEETS_FILE = path.join(__dirname, "tweets.json");
const LOG_FILE    = path.join(__dirname, "posted.log");

// 投稿スケジュール（1日3回）
const SCHEDULE = [
  { cron: "0 7  * * *", label: "朝 07:00",  timeKey: "07:00" },
  { cron: "0 12 * * *", label: "昼 12:00",  timeKey: "12:00" },
  { cron: "0 20 * * *", label: "夜 20:00",  timeKey: "20:00" },
];

// 土日祝日チェック
function isTodayHolidayOrWeekend() {
  const now  = new Date();
  const day  = now.getDay(); // 0=日, 6=土
  const isWeekend = day === 0 || day === 6;
  const isHoliday = !!holidays.isHoliday(now);
  return isWeekend || isHoliday;
}
// ───────────────────────────────────────────────────

// X API クライアント初期化
const client = new TwitterApi({
  appKey:            process.env.API_KEY,
  appSecret:         process.env.API_SECRET,
  accessToken:       process.env.ACCESS_TOKEN,
  accessSecret:      process.env.ACCESS_TOKEN_SECRET,
});
const rwClient = client.readWrite;

// ── ユーティリティ ───────────────────────────────

/** ログを ./posted.log とコンソールに出力 */
function log(message) {
  const line = `[${new Date().toLocaleString("ja-JP")}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

/** 投稿済み ID セットを読み込む */
function loadPostedIds() {
  if (!fs.existsSync(LOG_FILE)) return new Set();
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n");
  const ids = new Set();
  for (const line of lines) {
    const m = line.match(/POSTED id=(\d+)/);
    if (m) ids.add(Number(m[1]));
  }
  return ids;
}

/** tweets.json から指定 timeKey のツイートを取得し、未投稿のものを選ぶ */
function pickTweet(timeKey) {
  const all      = JSON.parse(fs.readFileSync(TWEETS_FILE, "utf8"));
  const pool     = all.filter((t) => t.time === timeKey);
  const posted   = loadPostedIds();
  const unposted = pool.filter((t) => !posted.has(t.id));

  if (unposted.length === 0) {
    // 全件投稿済みならリセットして最初から
    log(`⚠️  [${timeKey}] 全ツイート投稿済み → リセットして最初の1件を使用`);
    return pool[0] ?? null;
  }

  // 未投稿の中からランダムに1件
  return unposted[Math.floor(Math.random() * unposted.length)];
}

// ── 投稿処理 ────────────────────────────────────

async function postTweet(timeKey, label) {
  const tweet = pickTweet(timeKey);
  if (!tweet) {
    log(`❌ [${label}] 投稿するツイートが見つかりませんでした`);
    return;
  }

  try {
    const result = await rwClient.v2.tweet(tweet.content);
    log(`✅ [${label}] POSTED id=${tweet.id} tweet_id=${result.data.id}`);
    log(`   内容: ${tweet.content.replace(/\n/g, " ").slice(0, 60)}...`);
  } catch (err) {
    log(`❌ [${label}] 投稿失敗: ${err.message}`);
    if (err.data) log(`   API Error: ${JSON.stringify(err.data)}`);
  }
}

// ── スケジュール登録 ─────────────────────────────

log("🚀 X自動投稿スクリプト起動");
log(`📋 投稿スケジュール: ${SCHEDULE.map((s) => s.label).join(" / ")} / 土日祝 22:00`);

for (const schedule of SCHEDULE) {
  cron.schedule(
    schedule.cron,
    () => postTweet(schedule.timeKey, schedule.label),
    { timezone: "Asia/Tokyo" }
  );
  log(`⏰ スケジュール登録: ${schedule.label} (${schedule.cron})`);
}

// 土日祝日のみ22時に投稿
cron.schedule(
  "0 22 * * *",
  () => {
    if (isTodayHolidayOrWeekend()) {
      log("🎌 土日祝日のため22時の追加投稿を実行");
      postTweet("20:00", "土日祝 22:00");
    }
  },
  { timezone: "Asia/Tokyo" }
);
log("⏰ スケジュール登録: 土日祝 22:00 (条件付き)");

// ── テスト投稿（起動直後に1件投稿して動作確認） ──
// 本番運用時はこのブロックをコメントアウトしてください
// ──────────────────────────────────────────────────
(async () => {
  const TEST_MODE = process.env.TEST_MODE === "true";
  if (TEST_MODE) {
    log("🧪 テストモード: 07:00 枠のツイートを今すぐ投稿します");
    await postTweet("07:00", "テスト");
  }
})();
