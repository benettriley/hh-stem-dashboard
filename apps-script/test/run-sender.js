// Local check of isFromEnsemble(): node apps-script/test/run-sender.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);

// Real header from the 2026-10-20 Ensemble export.
const REAL = 'mx.google.com; dkim=pass header.i=@ensemblecloud.com header.s=flrjytsawviusfrpmbcq3ntmy42zv2p4 header.b=LsEtJafk; dkim=pass header.i=@amazonses.com header.s=hsbnp7p3ensaochzwyq5wwmceodymuwv header.b=PMu+MttE; spf=pass';

const cases = [
  ['real Ensemble export', 'tes_admin@ensemblecloud.com', REAL, true],
  ['display-name form', '"tes_admin" <tes_admin@ensemblecloud.com>', REAL, true],
  ['spoofed From, no DKIM', 'tes_admin@ensemblecloud.com', 'mx.google.com; spf=fail smtp.mailfrom=evil.example', false],
  ['spoofed From, DKIM for another domain', 'tes_admin@ensemblecloud.com', 'mx.google.com; dkim=pass header.i=@evil.example; spf=pass', false],
  ['look-alike DKIM domain', 'tes_admin@ensemblecloud.com', 'mx.google.com; dkim=pass header.i=@ensemblecloud.com.evil.example', false],
  ['DKIM failed', 'tes_admin@ensemblecloud.com', 'mx.google.com; dkim=fail header.i=@ensemblecloud.com', false],
  ['other sender at the domain', 'someone@ensemblecloud.com', REAL, false],
  ['random sender', 'student@harpethhall.org', REAL, false],
  ['missing header', 'tes_admin@ensemblecloud.com', null, false],
];

let failed = 0;
cases.forEach(([name, from, auth, want]) => {
  const got = ctx.isFromEnsemble(from, auth);
  if (got !== want) failed++;
  console.log(`${got === want ? 'ok  ' : 'FAIL'} ${name}: ${got}`);
});
process.exit(failed ? 1 : 0);
