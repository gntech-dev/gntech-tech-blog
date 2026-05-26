import matter from 'gray-matter';

const [,, postPath, prUrl = 'PR URL not provided'] = process.argv;
if (!postPath) {
  console.error('Usage: npm run approval:telegram -- src/content/blog/post.md https://github.com/owner/repo/pull/1');
  process.exit(1);
}
const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
if (!prNumber) {
  console.error(`Could not determine pull request number from URL: ${prUrl}`);
  process.exit(1);
}
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
  process.exit(1);
}
const parsed = matter.read(postPath);
const data = parsed.data;
const commands = [...parsed.content.matchAll(/```(?:bash|sh|shell|yaml|yml|toml|json|text)?\n([\s\S]*?)```/g)].length;
const words = parsed.content.split(/\s+/).filter(Boolean).length;
const minutes = Math.max(1, Math.ceil(words / 220));
const text = [
  '📝 Blog publishing approval request',
  '',
  `Title: ${data.title}`,
  `Summary: ${data.description}`,
  `Category: ${data.category}`,
  `Estimated reading time: ${minutes} min`,
  `Commands/configs included: ${commands}`,
  `Risk level: ${data.risk_level}`,
  `GPT-5.5 validation result: ${data.validated_by === 'GPT-5.5' ? 'Passed metadata gate; see PR validation notes' : 'Missing'}`,
  `Build result: See GitHub Actions checks`,
  `PR: ${prUrl}`,
].join('\n');

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve only', callback_data: `blog:approve-only:${prNumber}` },
        { text: '🚀 Approve & publish', callback_data: `blog:approve-and-publish:${prNumber}` },
      ], [
        { text: '❌ Reject', callback_data: `blog:reject:${prNumber}` },
        { text: '🛠 Request changes', callback_data: `blog:request-changes:${prNumber}` },
      ]],
    },
  }),
});
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
console.log('Telegram approval request sent.');
