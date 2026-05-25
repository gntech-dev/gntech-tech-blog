const REPO_DEFAULT = 'gntech-dev/gntech-tech-blog';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function callbackSummary(action) {
  if (action === 'approve') return { emoji: '✅', label: 'Approved' };
  if (action === 'reject') return { emoji: '❌', label: 'Rejected' };
  if (action === 'changes') return { emoji: '🛠', label: 'Changes requested' };
  return { emoji: 'ℹ️', label: 'Unknown action' };
}

function parseCallbackData(data) {
  const value = String(data || '');
  const current = value.match(/^blog:(approve|reject|changes):(\d+)$/);
  if (current) return { action: current[1], prNumberRaw: current[2] };

  // Legacy messages sent before the webhook handler existed used this shorter
  // format. Keep accepting it so old approval buttons still give feedback.
  const legacy = value.match(/^(approve|reject|changes):(\d+)$/);
  if (legacy) return { action: legacy[1], prNumberRaw: legacy[2] };

  return null;
}

async function telegramApi(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function tryTelegramApi(token, method, payload) {
  try {
    return await telegramApi(token, method, payload);
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function githubApi(env, path, payload) {
  const repository = env.GITHUB_REPOSITORY || REPO_DEFAULT;
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'gntech-tech-blog-telegram-approval',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function decisionComment({ action, prNumber, user }) {
  const summary = callbackSummary(action);
  const actor = user?.username ? `@${user.username}` : user?.id ? `Telegram user ${user.id}` : 'Telegram approval button';
  const timestamp = new Date().toISOString();

  return [
    `${summary.emoji} Telegram publishing decision: ${summary.label}`,
    '',
    `PR: #${prNumber}`,
    `Actor: ${actor}`,
    `Received: ${timestamp}`,
    '',
    action === 'approve'
      ? 'Approval recorded. Jarvis may proceed with the normal guarded merge/publish workflow after final checks.'
      : action === 'reject'
        ? 'Rejection recorded. This PR must not be merged unless a new approval is requested and received.'
        : 'Changes requested. Please review and update the PR before requesting approval again.',
  ].join('\n');
}

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.TELEGRAM_WEBHOOK_SECRET || !env.GITHUB_TOKEN) {
    return json({ ok: false, error: 'Missing required environment variables.' }, 500);
  }

  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' });
  }

  const callback = update.callback_query;
  if (!callback) {
    return json({ ok: true, ignored: 'No callback_query in update.' });
  }

  const chatId = String(callback.message?.chat?.id ?? '');
  if (chatId !== String(env.TELEGRAM_CHAT_ID)) {
    await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'This approval button is not authorized for this chat.',
      show_alert: true,
    });
    return json({ ok: false, error: 'Unauthorized chat.' });
  }

  const parsedCallback = parseCallbackData(callback.data);
  if (!parsedCallback) {
    await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Unsupported approval action.',
      show_alert: true,
    });
    return json({ ok: false, error: 'Unsupported callback_data.' });
  }

  const { action, prNumberRaw } = parsedCallback;
  const prNumber = safeNumber(prNumberRaw);
  if (!prNumber) {
    await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Invalid PR number.',
      show_alert: true,
    });
    return json({ ok: false, error: 'Invalid PR number.' });
  }

  const summary = callbackSummary(action);
  await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
    callback_query_id: callback.id,
    text: `${summary.emoji} ${summary.label} recorded for PR #${prNumber}.`,
    show_alert: false,
  });

  try {
    await githubApi(env, `/issues/${prNumber}/comments`, {
      body: decisionComment({ action, prNumber, user: callback.from }),
    });
  } catch (error) {
    console.error(error);
    await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `${summary.emoji} ${summary.label} received for PR #${prNumber}, but I could not add the GitHub PR comment. Please check the Cloudflare GITHUB_TOKEN permissions.`,
      reply_to_message_id: callback.message?.message_id,
      disable_web_page_preview: true,
    });

    return json({ ok: false, action, prNumber, error: 'GitHub comment failed.' });
  }

  await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: `${summary.emoji} ${summary.label} recorded for PR #${prNumber}. I added the decision to the GitHub PR comments.`,
    reply_to_message_id: callback.message?.message_id,
    disable_web_page_preview: true,
  });

  return json({ ok: true, action, prNumber });
}

export async function onRequestGet() {
  return json({ ok: true, service: 'telegram-approval-callback' });
}
