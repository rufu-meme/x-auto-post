require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");
const path = require("path");

const TWEETS_FILE = path.join(__dirname, "tweets.json");

const client = new TwitterApi({
  appKey:       process.env.API_KEY,
  appSecret:    process.env.API_SECRET,
  accessToken:  process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_TOKEN_SECRET,
});
const rwClient = client.readWrite;

(async () => {
  const tweets = JSON.parse(fs.readFileSync(TWEETS_FILE, "utf8"));

  // 現在のJST時刻
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}`;

  // 今日が基準日から何日目か（0始まり）
  const BASE_DATE = new Date("2025-01-01T00:00:00Z");
  const dayIndex = Math.floor((jst - BASE_DATE) / (1000 * 60 * 60 * 24));

  // 同じ時刻帯のツイートを抽出
  const slotTweets = tweets.filter(t => t.time === currentTime);

  if (slotTweets.length === 0) {
    console.log("投稿対象なし:", currentTime);
    process.exit(0);
  }

  // 日付でローテーション（ログ不要・完全自動）
  const tweet = slotTweets[dayIndex % slotTweets.length];

  if (process.env.TEST_MODE === "true") {
    console.log("[TEST] day:", dayIndex, "| index:", dayIndex % slotTweets.length);
    console.log("[TEST]", tweet.content);
    process.exit(0);
  }

  await rwClient.v2.tweet(tweet.content);
  console.log("投稿完了 day:", dayIndex, "->", tweet.content.slice(0, 30));
})();
