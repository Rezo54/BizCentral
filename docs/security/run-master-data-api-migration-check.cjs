'use strict';

const fs = require('node:fs');

const routes = [
  {
    path: 'src/app/api/admin/master-data/edo-import/route.ts',
    collections: ['companies', 'routes'],
  },
  {
    path: 'src/app/api/admin/master-data/reliever-import/route.ts',
    collections: ['relievers'],
  },
  {
    path: 'src/app/api/admin/master-data/signup-companies-sync/route.ts',
    collections: ['companies', 'relievers', 'signupCompanies'],
  },
];

const pages = [
  {
    path: 'src/app/(app)/admin/upload-edo/page.tsx',
    endpoint: '/api/admin/master-data/edo-import',
  },
  {
    path: 'src/app/(app)/admin/upload-reliever/page.tsx',
    endpoint: '/api/admin/master-data/reliever-import',
  },
  {
    path: 'src/app/(app)/admin/sync-signup-companies/page.tsx',
    endpoint: '/api/admin/master-data/signup-companies-sync',
  },
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

for (const route of routes) {
  const source = read(route.path);
  if (!source.includes('requireAdmin(await requireAuthContext(request))')) {
    fail(`${route.path} does not enforce canonical Taskraft admin authorization.`);
  }
  if (!source.includes("authorizationStatus(error)")) {
    fail(`${route.path} does not preserve authorization response status.`);
  }
  for (const collection of route.collections) {
    if (!source.includes(`collection('${collection}')`)) {
      fail(`${route.path} no longer references expected collection ${collection}.`);
    }
  }
}

for (const page of pages) {
  const source = read(page.path);
  if (!source.includes(page.endpoint)) {
    fail(`${page.path} does not call ${page.endpoint}.`);
  }
  if (source.includes('firebase/firestore')) {
    fail(`${page.path} still imports the browser Firestore SDK.`);
  }
  if (!source.includes('getIdToken()')) {
    fail(`${page.path} does not send an authenticated Firebase ID token.`);
  }
}

console.log('PASS three master-data pages use authenticated server APIs.');
console.log('PASS all three APIs enforce canonical Taskraft admin authorization.');
console.log('PASS migrated pages contain no direct browser Firestore dependency.');
console.log('Master-data API migration static check PASS.');
