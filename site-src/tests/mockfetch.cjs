// Test only: answer Resend calls locally and log the payloads.
const fs = require('fs'); const real = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    fs.appendFileSync('/tmp/mails.jsonl', (opts && opts.body) + '\n');
    if (process.env.MOCK_FAIL) return new Response('{"message":"fail"}', { status: 500 });
    return new Response(JSON.stringify({ id: 'test-' + Date.now() }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return real(url, opts);
};
