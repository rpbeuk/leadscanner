const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ personal = [], shared = [], failShared = false } = {}) {
  const saved = [];
  const calls = [];
  const supabase = {
    from(table) {
      let userId;
      const query = {
        select() { return query; },
        eq(_column, value) { userId = value; return query; },
        order() { return query; },
        range(start, end) {
          calls.push({ table, start });
          if (table === 'shared_ocr_corrections' && failShared) {
            return Promise.resolve({ error: { message: 'Shared lookup unavailable' } });
          }
          const rows = table === 'shared_ocr_corrections'
            ? shared : personal.filter((row) => row.user_id === userId);
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
        },
        upsert(rows) {
          saved.push(...rows);
          return Promise.resolve({ error: null });
        }
      };
      return query;
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'personalizedOcr.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports,
    require(name) {
      assert.equal(name, './supabase');
      return { supabase };
    }
  });
  return { ...exports, saved, calls };
}

const blank = {
  first_name: '', last_name: '', email: '', institute: '', department: '', notes: ''
};

test('shared vocabulary crosses users and eligible fields but not contact fields', async () => {
  const api = harness({
    shared: [
      { source_text: 'gm8n', corrected_text: 'GM8H' },
      { source_text: 'gmz', corrected_text: 'GM2' },
      { source_text: 'gaelle', corrected_text: 'Gaëlle' },
      { source_text: 'rubcn', corrected_text: 'Ruben' }
    ]
  });
  for (const user of ['employee-a', 'employee-b']) {
    const result = await api.applyPersonalOcrCorrections(user, {
      ...blank, first_name: 'gaelle', last_name: 'rubcn', email: 'rubcn@example.com',
      institute: 'gm8n', department: 'gmz', notes: 'gaelle and rubcn: gm8n; xgm8n.'
    });
    assert.equal(result.institute, 'GM8H');
    assert.equal(result.department, 'GM2');
    assert.equal(result.notes, 'Gaëlle and Ruben: GM8H; xgm8n.');
    assert.equal(result.first_name, 'gaelle');
    assert.equal(result.last_name, 'rubcn');
    assert.equal(result.email, 'rubcn@example.com');
  }
});

test('personal preferences override shared mappings without chained replacements', async () => {
  const api = harness({
    personal: [
      { user_id: 'a', field: 'notes', source_text: 'gm8n', corrected_text: 'Personal' },
      { user_id: 'a', field: 'email', source_text: 'old@example.com', corrected_text: 'new@example.com' }
    ],
    shared: [
      { source_text: 'gm8n', corrected_text: 'GM8H' },
      { source_text: 'gm8h', corrected_text: 'Other' }
    ]
  });
  const input = { ...blank, notes: 'gm8n gm8h', department: 'gm8n', email: 'old@example.com' };
  const own = await api.applyPersonalOcrCorrections('a', input);
  assert.equal(own.notes, 'Personal Other');
  assert.equal(own.department, 'GM8H');
  assert.equal(own.email, 'new@example.com');
  const other = await api.applyPersonalOcrCorrections('b', input);
  assert.equal(other.notes, 'GM8H Other');
  assert.equal(other.email, 'old@example.com');
});

test('confirmation learns Unicode and case-sensitive vocabulary using existing private storage', async () => {
  const api = harness();
  await api.learnPersonalOcrCorrections('a', {
    ...blank,
    notes: 'GM8H GM2 Gaëlle Ruben',
    ocr_suggestions: { notes: 'gm8n gm2 Gaelle Rubcn' }
  });
  assert.equal(api.saved.length, 4);
  assert.equal(api.saved[1].corrected_text, 'GM2');
  assert.equal(api.saved[2].corrected_text, 'Gaëlle');
  assert.ok(api.saved.every((row) => row.user_id === 'a' && row.field === 'notes'));
  await api.learnPersonalOcrCorrections('a', { ...blank });
  assert.equal(api.saved.length, 4);
});

test('loads vocabulary beyond the first database page', async () => {
  const shared = Array.from({ length: 1000 }, (_, i) => ({
    source_text: `word${i}`, corrected_text: `Correct${i}`
  }));
  shared.push({ source_text: 'gm8n', corrected_text: 'GM8H' });
  const api = harness({ shared });
  const result = await api.applyPersonalOcrCorrections('a', { ...blank, notes: 'gm8n' });
  assert.equal(result.notes, 'GM8H');
  assert.ok(api.calls.some((call) => call.table === 'shared_ocr_corrections' && call.start === 1000));
});

test('lookup failures are explicit rather than treated as empty vocabulary', async () => {
  const api = harness({ failShared: true });
  await assert.rejects(api.applyPersonalOcrCorrections('a', blank), /Shared lookup unavailable/);
});
