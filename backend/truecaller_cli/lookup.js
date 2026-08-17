// Thin CLI wrapper around truecallerjs's programmatic search() so the
// Python backend can shell out to it and just read JSON off stdout — the
// npm package itself is JS/TS only, there's no Python port.
// Usage: node lookup.js <number> <countryCode> <installationId>
const truecallerjs = require('truecallerjs');

const [, , number, countryCode, installationId] = process.argv;

if (!number || !countryCode || !installationId) {
  console.error(JSON.stringify({ error: 'missing_args' }));
  process.exit(1);
}

truecallerjs
  .search({ number, countryCode, installationId })
  .then((response) => {
    process.stdout.write(JSON.stringify(response.json()));
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: 'lookup_failed', message: String(err && err.message || err) }));
    process.exit(1);
  });
