#!/usr/bin/env node
// Kiểm chứng EXPO_PUBLIC_* thật sự tới bundler. Tự pin NODE_ENV=production
// (dev thì babel-preset-expo không nội tuyến, grep "undefined" đậu oan) và tự
// xoá khoá cần kiểm khỏi process.env trước load() — chỉ file .env được tính.
// Xem plans/260919-2151-google-auth-and-auth-ui/phase-00-...-reaches-the-bundle.md
'use strict';

process.env.NODE_ENV = 'production';

const fs = require('fs');
const path = require('path');

const REQUIRED_KEYS = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WS_URL'];
const projectRoot = process.cwd();
for (const key of REQUIRED_KEYS) delete process.env[key];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    const eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq === -1) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return values;
}

const expected = parseEnvFile(path.join(projectRoot, '.env'));
require('@expo/env').load(projectRoot); // nạp sau khi đã pin NODE_ENV + xoá khoá

const missing = REQUIRED_KEYS.filter((k) => expected === null || !(k in expected));
const mismatched = REQUIRED_KEYS.filter(
  (k) => !missing.includes(k) && process.env[k] !== expected[k],
);

if (missing.length || mismatched.length) {
  console.error('❌ EXPO_PUBLIC_* không tới được bundler qua @expo/env.load(%s)', projectRoot);
  if (expected === null) console.error('   apps/mobile/.env không tồn tại — chạy `make env`.');
  if (missing.length) console.error('   Thiếu trong apps/mobile/.env: %s', missing.join(', '));
  if (mismatched.length) {
    console.error('   Giá trị sau load() khác file (biến shell không được tính): %s', mismatched.join(', '));
  }
  process.exit(1);
}

console.log('✅ EXPO_PUBLIC_* tới bundler đúng giá trị đọc từ apps/mobile/.env');
process.exit(0);
