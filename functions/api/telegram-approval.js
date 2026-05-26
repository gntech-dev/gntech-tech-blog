const REPO_DEFAULT = 'gntech-dev/gntech-tech-blog';
const ALLOWED_CONTENT_PATHS = [
  /^src\/content\/blog\/[^/]+\.mdx?$/,
  /^public\/images\/blog\/[^/]+\.png$/,
  /^cspell\.json$/,
];

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
  if (action === 'approve_only') return { emoji: '✅', label: 'Approved only' };
  if (action === 'approve') return { emoji: '✅', label: 'Approved' };
  if (action === 'reject') return { emoji: '❌', label: 'Rejected' };
  if (action === 'changes') return { emoji: '🛠', label: 'Changes requested' };
  return { emoji: 'ℹ️', label: 'Unknown action' };
}

function parseCallbackData(data) {
  const value = String(data || '');
  const current = value.match(/^blog:(approve_only|approve|reject|changes):(\d+)$/);
  if (current) return { action: current[1], prNumberRaw: current[2] };

  // Legacy messages sent before the webhook handler existed used this shorter
  // format. Keep accepting it so old approval buttons still give feedback.
  const legacy = value.match(/^(approve_only|approve|reject|changes):(\d+)$/);
  if (legacy) return { action: legacy[1], prNumberRaw: legacy[2] };

  return null;
}

function isAllowedContentPath(path) {
  return ALLOWED_CONTENT_PATHS.some((pattern) => pattern.test(path));
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

async function githubRequest(env, path, options = {}) {
  const repository = env.GITHUB_REPOSITORY || REPO_DEFAULT;
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'gntech-tech-blog-telegram-approval',
      'x-github-api-version': '2022-11-28',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`GitHub API ${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return body;
}

async function githubApi(env, path, payload) {
  return githubRequest(env, path, { method: 'POST', body: payload });
}

function decisionComment({ action, prNumber, user, publishResult }) {
  const summary = callbackSummary(action);
  const actor = user?.username ? `@${user.username}` : user?.id ? `Telegram user ${user.id}` : 'Telegram approval button';
  const timestamp = new Date().toISOString();

  const actionNote = action === 'approve'
    ? publishResult?.published
      ? `Approval recorded and PR #${prNumber} was squash-merged for publishing.`
      : `Approval recorded, but automatic publishing did not run: ${publishResult?.reason || 'unknown reason'}.`
    : action === 'approve_only'
      ? 'Approval recorded only. This did not publish or merge the PR.'
    : action === 'reject'
      ? 'Rejection recorded. This PR must not be merged unless a new approval is requested and received.'
      : 'Changes requested. Please review and update the PR before requesting approval again.';

  return [
    `${summary.emoji} Telegram publishing decision: ${summary.label}`,
    '',
    `PR: #${prNumber}`,
    `Actor: ${actor}`,
    `Received: ${timestamp}`,
    '',
    actionNote,
  ].join('\n');
}

function allChecksSuccessful(statuses, checkRuns) {
  const statusItems = statuses.statuses || [];
  const checkItems = checkRuns.check_runs || [];

  const failingStatuses = statusItems.filter((item) => item.state !== 'success');
  const failingChecks = checkItems.filter((item) => {
    if (item.status !== 'completed') return true;
    return !['success', 'skipped', 'neutral'].includes(item.conclusion);
  });

  const hasAnySignal = statusItems.length > 0 || checkItems.length > 0;
  return {
    ok: hasAnySignal && failingStatuses.length === 0 && failingChecks.length === 0,
    failing: [
      ...failingStatuses.map((item) => `${item.context}: ${item.state}`),
      ...failingChecks.map((item) => `${item.name}: ${item.status}/${item.conclusion || 'pending'}`),
    ],
  };
}

async function assertSafeToPublish(env, prNumber) {
  const pr = await githubRequest(env, `/pulls/${prNumber}`);

  if (pr.state !== 'open') {
    return { ok: false, reason: `PR is ${pr.state}, not open.` };
  }
  if (pr.draft) {
    return { ok: false, reason: 'PR is still a draft.' };
  }
  if (pr.base?.ref !== 'main') {
    return { ok: false, reason: `PR targets ${pr.base?.ref || 'unknown'}, not main.` };
  }
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
    return { ok: false, reason: 'PR is not mergeable cleanly.' };
  }

  const files = await githubRequest(env, `/pulls/${prNumber}/files?per_page=100`);
  if (!files.length) {
    return { ok: false, reason: 'PR has no changed files.' };
  }

  const disallowedFiles = files
    .map((file) => file.filename)
    .filter((filename) => !isAllowedContentPath(filename));
  if (disallowedFiles.length) {
    return {
      ok: false,
      reason: `PR changes files outside the blog publishing allowlist: ${disallowedFiles.join(', ')}`,
    };
  }

  const changedPosts = files.filter((file) => /^src\/content\/blog\/[^/]+\.mdx?$/.test(file.filename));
  if (!changedPosts.length) {
    return { ok: false, reason: 'PR does not change a blog post.' };
  }

  const headSha = pr.head?.sha;
  if (!headSha) {
    return { ok: false, reason: 'Could not determine PR head commit.' };
  }

  const [statuses, checkRuns] = await Promise.all([
    githubRequest(env, `/commits/${headSha}/status`),
    githubRequest(env, `/commits/${headSha}/check-runs?per_page=100`),
  ]);
  const checks = allChecksSuccessful(statuses, checkRuns);
  if (!checks.ok) {
    return {
      ok: false,
      reason: checks.failing.length ? `Checks are not green: ${checks.failing.join('; ')}` : 'No successful validation checks found.',
    };
  }

  return { ok: true, pr };
}

async function publishApprovedPr(env, prNumber) {
  const safety = await assertSafeToPublish(env, prNumber);
  if (!safety.ok) {
    return { published: false, reason: safety.reason };
  }

  const pr = safety.pr;
  const merge = await githubRequest(env, `/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: {
      merge_method: 'squash',
      commit_title: `${pr.title} (#${prNumber})`,
    },
  });

  return {
    published: true,
    reason: merge.message || 'PR merged.',
    sha: merge.sha,
  };
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

  let publishResult = null;
  if (action === 'approve') {
    try {
      publishResult = await publishApprovedPr(env, prNumber);
    } catch (error) {
      console.error(error);
      publishResult = { published: false, reason: error.message };
    }
  }

  try {
    await githubApi(env, `/issues/${prNumber}/comments`, {
      body: decisionComment({ action, prNumber, user: callback.from, publishResult }),
    });
  } catch (error) {
    console.error(error);
    await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `${summary.emoji} ${summary.label} received for PR #${prNumber}, but I could not add the GitHub PR comment. Please check the Cloudflare GITHUB_TOKEN permissions.`,
      reply_to_message_id: callback.message?.message_id,
      disable_web_page_preview: true,
    });

    return json({ ok: false, action, prNumber, error: 'GitHub comment failed.', publishResult });
  }

  const followUp = action === 'approve'
    ? publishResult?.published
      ? `✅ Approved and published PR #${prNumber}. Cloudflare Pages will deploy main automatically. Merge commit: ${publishResult.sha}`
      : `⚠️ Approved PR #${prNumber}, but I did not publish it: ${publishResult?.reason || 'unknown reason'}`
    : action === 'approve_only'
      ? `✅ Approval recorded only for PR #${prNumber}. I did not merge or publish it.`
    : `${summary.emoji} ${summary.label} recorded for PR #${prNumber}. I added the decision to the GitHub PR comments.`;

  await tryTelegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: followUp,
    reply_to_message_id: callback.message?.message_id,
    disable_web_page_preview: true,
  });

  return json({ ok: true, action, prNumber, publishResult });
}

export async function onRequestGet() {
  return json({ ok: true, service: 'telegram-approval-callback' });
}
