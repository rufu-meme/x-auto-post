require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");
const path = require("path");

const TWEETS_FILE = path.join(__dirname, "tweets.json");
const LOG_FILE    = path.join(__dirname, "posted.log");

const client = new TwitterApi({
  appKey:       process.env.API_KEY,
  appSecret:    process.env.API_SECRET,
  accessToken:  process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_TOKEN_SECRET,
});
const rwClient = client.readWrite;

function log(message) {
  const line = `[${new Date().toLocaleString("ja-JP")}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

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

function pickTweet() {
  const all      = JSON.parse(fs.readFileSync(TWEETS_FILE, "utf8"));
  const posted   = loadPostedIds();
  const unposted = all.filter((t) => !posted.has(t.id));
  if (unposted.length === 0) {
    log("⚠️ 全ツイート投稿済み → リセットして最初の1件を使用");
    return all[0] ?? null;
  }
  return unposted[Math.floor(Math.random() * unposted.length)];
}

(async () => {
  const tweet = pickTweet();
  if (!tweet) { log("❌ ツイートが見つかりません"); process.exit(1); }
  try {
    const result = await rwClient.v2.tweet(tweet.content);
    log(`✅ POSTED id=${tweet.id} tweet_id=${result.data.id}`);
    log(`   内容: ${tweet.content.replace(/\n/g, " ").slice(0, 60)}...`);
  } catch (err) {
    log(`❌ 投稿失敗: ${err.message}`);
    if (err.data) log(`   API Error: ${JSON.stringify(err.data)}`);
    process.exit(1);
  }
})();
