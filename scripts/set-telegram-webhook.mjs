const [,, webhookUrl, ...flags] = process.argv;

if (!webhookUrl) {
  console.error('Usage: npm run approval:webhook:set -- https://blog.gntechlabs.me/api/telegram-approval');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secretToken) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required.');
  process.exit(1);
}

const url = new URL(webhookUrl);
if (url.protocol !== 'https:') {
  console.error('Telegram webhooks require an HTTPS URL.');
  process.exit(1);
}

const dropPendingUpdates = flags.includes('--drop-pending-updates');

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: url.toString(),
    secret_token: secretToken,
    allowed_updates: ['callback_query'],
    drop_pending_updates: dropPendingUpdates,
  }),
});

const body = await response.json().catch(async () => ({ ok: false, description: await response.text() }));

if (!response.ok || !body.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`Telegram webhook configured for ${url.origin}${url.pathname}.`);
console.log(`Pending callback updates ${dropPendingUpdates ? 'were dropped' : 'were preserved'}.`);
