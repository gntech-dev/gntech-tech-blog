import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/telegram-approval.js';

const env = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_CHAT_ID: '-1003656367059',
  TELEGRAM_WEBHOOK_SECRET: 'test-secret',
  GITHUB_TOKEN: 'test-github-token',
  GITHUB_REPOSITORY: 'gntech-dev/gntech-tech-blog',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function testDuplicateApprovePublishDoesNotCreatePrComment() {
  const githubCommentRequests = [];
  const telegramRequests = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';

    if (href.startsWith('https://api.telegram.org/')) {
      telegramRequests.push({ href, method, body: options.body ? JSON.parse(options.body) : null });
      return jsonResponse({ ok: true, result: true });
    }

    if (href === 'https://api.github.com/repos/gntech-dev/gntech-tech-blog/pulls/27') {
      return jsonResponse({ state: 'closed', number: 27, draft: false, base: { ref: 'main' } });
    }

    if (href === 'https://api.github.com/repos/gntech-dev/gntech-tech-blog/issues/27/comments') {
      githubCommentRequests.push({ href, method, body: options.body ? JSON.parse(options.body) : null });
      return jsonResponse({ id: 12345 });
    }

    throw new Error(`Unexpected fetch request in duplicate callback test: ${method} ${href}`);
  };

  try {
    const request = new Request('https://gntech-tech-blog.pages.dev/api/telegram-approval', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 1001,
        callback_query: {
          id: 'duplicate-callback-id',
          from: { id: 1064959513, username: 'gnogeek' },
          message: {
            message_id: 207,
            chat: { id: -1003656367059, type: 'channel', title: 'Servers Monitoring' },
          },
          data: 'blog:approve-and-publish:27',
        },
      }),
    });

    const response = await onRequestPost({ request, env });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.duplicate, true);
    assert.equal(payload.publishResult?.published, false);
    assert.equal(payload.publishResult?.reason, 'PR is closed, not open.');
    assert.equal(githubCommentRequests.length, 0, 'duplicate approve-and-publish callback must not create a PR comment');

    const answerCallback = telegramRequests.find((request) => request.href.endsWith('/answerCallbackQuery'));
    assert.ok(answerCallback, 'duplicate callback should still answer Telegram callback query');

    const duplicateFeedback = telegramRequests.find(
      (request) => request.href.endsWith('/sendMessage')
        && request.body?.text?.includes('Duplicate publish click ignored')
    );
    assert.ok(duplicateFeedback, 'duplicate callback should still send visible Telegram feedback');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await testDuplicateApprovePublishDoesNotCreatePrComment();
console.log('telegram callback regression tests passed');
