/**
 * Import birthdays and phone numbers from a VCF file into PocketBase contacts.
 *
 * Only fills in MISSING data — never overwrites existing values.
 *
 * Usage:  node scripts/import-vcf-extras.mjs "C:\Users\jashir\Downloads\Kai Hwa.vcf"
 *         node scripts/import-vcf-extras.mjs path/to/file.vcf --dry-run
 */

import { readFileSync } from "fs";

const PB_URL = process.env.VITE_POCKETBASE_URL || "http://10.1.0.50:5170";
const ADMIN_EMAIL = process.env.VITE_PB_ADMIN_EMAIL || "navi@odinseye.org";
const ADMIN_PASSWORD = process.env.VITE_PB_ADMIN_PASSWORD || "gprWWsDrEy6ocVCra7u3";

const vcfPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!vcfPath) {
  console.error("Usage: node scripts/import-vcf-extras.mjs <path-to-vcf> [--dry-run]");
  process.exit(1);
}

let token = "";

async function pb(path, options = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`PB ${res.status}: ${path} - ${JSON.stringify(data)}`);
  return data;
}

async function login() {
  let data;
  try {
    data = await pb("/api/admins/auth-with-password", {
      method: "POST",
      body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
  } catch {
    data = await pb("/api/collections/_superusers/records/auth-with-password", {
      method: "POST",
      body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
  }
  token = data.token;
}

// ── vCard parsing helpers ──────────────────────────────────────────

function unfold(s) {
  return s.replace(/\r?\n[ \t]/g, "");
}

function parseVCards(raw) {
  return raw.split(/(?=BEGIN:VCARD)/i)
    .filter((s) => /BEGIN:VCARD/i.test(s))
    .map((block) => {
      const vc = unfold(block);
      return {
        fn: extractField(vc, "FN"),
        firstName: extractName(vc).first,
        lastName: extractName(vc).last,
        phone: extractPhone(vc),
        bday: extractBday(vc),
      };
    });
}

function extractField(vc, name) {
  // Handle prefixed fields like "item4.TEL"
  const re = new RegExp(`^(?:\\w+\\.)?${name}(?:;[^:]*)?:(.+)$`, "im");
  const m = vc.match(re);
  return m ? m[1].trim() : "";
}

function extractName(vc) {
  const m = vc.match(/^N(?:;[^:]*)?:([^;\r\n]*);([^;\r\n]*)/im);
  return { last: m?.[1]?.trim() || "", first: m?.[2]?.trim() || "" };
}

function extractPhone(vc) {
  // Prefer the pref (primary) phone, fall back to first TEL
  const prefMatch = vc.match(/^(?:\w+\.)?TEL[^:]*type=pref[^:]*:(.+)$/im);
  if (prefMatch) return normalizePhone(prefMatch[1].trim());
  const anyMatch = vc.match(/^(?:\w+\.)?TEL(?:;[^:]*)?:(.+)$/im);
  if (anyMatch) return normalizePhone(anyMatch[1].trim());
  return "";
}

function extractBday(vc) {
  const m = vc.match(/^BDAY(?:;[^:]*)?:(\d{4})-(\d{2})-(\d{2})/im);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  // 1603-11-30 is an Apple sentinel meaning "no birthday set" — skip it
  if (year === 1603) return null;
  return {
    year: year === 1604 ? 0 : year,  // 1604 = year unknown but month/day valid
    month,
    day,
  };
}

function normalizePhone(raw) {
  const digits = raw.replace(/^\+1/, "").replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return raw;
}

// ── Matching helpers ───────────────────────────────────────────────

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z]/g, "");
}

function matchScore(vcContact, pbContact) {
  const pbFirst = normalize(pbContact.first_name);
  const pbLast = normalize(pbContact.last_name);
  const vcFirst = normalize(vcContact.firstName);
  const vcLast = normalize(vcContact.lastName);

  // Exact first + last match
  if (pbFirst && pbLast && vcFirst && vcLast && pbFirst === vcFirst && pbLast === vcLast) return 3;
  // FN match (full name)
  const vcFn = normalize(vcContact.fn);
  const pbFn = normalize(`${pbContact.first_name} ${pbContact.last_name}`);
  if (vcFn && pbFn && vcFn === pbFn) return 3;
  // First name only (for single-name contacts)
  if (pbFirst && vcFirst && pbFirst === vcFirst && !pbLast && !vcLast) return 2;
  // Last name + first initial
  if (pbLast && vcLast && pbLast === vcLast && pbFirst && vcFirst && pbFirst[0] === vcFirst[0]) return 1;

  return 0;
}

// ── Main ───────────────────────────────────────────────────────────

async function run() {
  console.log(`Reading VCF: ${vcfPath}`);
  const raw = readFileSync(vcfPath, "utf-8");
  const vcContacts = parseVCards(raw);
  console.log(`Parsed ${vcContacts.length} vCards\n`);

  await login();
  console.log("Authenticated with PocketBase\n");

  // Fetch all PB contacts
  const allPb = [];
  let page = 1;
  while (true) {
    const res = await pb(`/api/collections/contacts/records?perPage=200&page=${page}`);
    allPb.push(...res.items);
    if (page >= res.totalPages) break;
    page++;
  }
  console.log(`Found ${allPb.length} PB contacts\n`);

  let updated = 0, skipped = 0, noMatch = 0;
  const unmatched = [];

  for (const vc of vcContacts) {
    if (!vc.fn && !vc.firstName) continue;

    // Find best match in PB
    let best = null, bestScore = 0;
    for (const pb of allPb) {
      const score = matchScore(vc, pb);
      if (score > bestScore) {
        bestScore = score;
        best = pb;
      }
    }

    if (!best || bestScore < 2) {
      noMatch++;
      unmatched.push(vc.fn || `${vc.firstName} ${vc.lastName}`.trim());
      continue;
    }

    const pbName = `${best.first_name} ${best.last_name}`.trim();
    const patch = {};

    // Fill phone if PB is missing and VCF has one
    if (!best.phone_number && vc.phone) {
      patch.phone_number = vc.phone;
    }

    // Fill birthday fields if PB is missing and VCF has one
    if (vc.bday) {
      if (!best.birthday_month && vc.bday.month) patch.birthday_month = vc.bday.month;
      if (!best.birthday_day && vc.bday.day) patch.birthday_day = vc.bday.day;
      if (!best.birthday_year && vc.bday.year) patch.birthday_year = vc.bday.year;
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    const fields = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(`  ${dryRun ? "[DRY RUN] " : ""}${pbName} ← ${fields}`);

    if (!dryRun) {
      await pb(`/api/collections/contacts/records/${best.id}`, {
        method: "PATCH",
        body: patch,
      });
    }
    updated++;
  }

  console.log(`\nDone${dryRun ? " (dry run)" : ""}: ${updated} updated, ${skipped} already had data, ${noMatch} no match in PB`);

  if (unmatched.length > 0) {
    console.log(`\nUnmatched VCF contacts (${unmatched.length}):`);
    for (const name of unmatched.sort()) {
      console.log(`  - ${name}`);
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
