// One-time setup helper: triggers Truecaller's OTP SMS and saves the
// login response (needed by do_verify.js) to disk so the two steps can
// run as separate, non-interactive commands instead of the CLI's
// inquirer prompts.
// Usage: node do_login.js <phoneNumber> <outFile>
const truecallerjs = require('truecallerjs');
const fs = require('fs');

const [, , phoneNumber, outFile] = process.argv;
if (!phoneNumber || !outFile) {
  console.error(JSON.stringify({ error: 'missing_args' }));
  process.exit(1);
}

truecallerjs
  .login(phoneNumber)
  .then((response) => {
    fs.writeFileSync(outFile, JSON.stringify(response));
    console.log(JSON.stringify({ ok: true, response }));
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: 'login_failed', message: String((err && err.message) || err) }));
    process.exit(1);
  });
