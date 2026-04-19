// ── vCard serialization & parsing ────────────────────────────────────
// Pure helpers with no I/O — shared across CardDAV and contact services.

export interface VCardFields {
  uid?: string;
  fn?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tel?: string;
  org?: string;
  adrStreet?: string;
  adrSecondary?: string;
  adrCity?: string;
  adrState?: string;
  adrZip?: string;
  adrCountry?: string;
  bdayYear?: number;
  bdayMonth?: number;
  bdayDay?: number;
  /** Base64-encoded photo data (no data: prefix). Mime type inferred or default JPEG. */
  photo?: string;
  photoMime?: string;
}

/** Unfold vCard line continuations (RFC 6350: CRLF + space/tab = continuation) */
export function unfoldVCard(s: string): string {
  return s.replace(/\r?\n[ \t]/g, "");
}

/** Decode common XML entities found in DAV responses */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Extract a single vCard property value by field name */
export function extractVCardField(vcard: string, field: string): string {
  // Handles both simple (FN:value) and parameterized (TEL;TYPE=WORK:value)
  const re = new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, "im");
  const m = vcard.match(re);
  return m ? m[1].trim() : "";
}

/** Extract birthday from vCard BDAY field */
export function extractBday(vcard: string): { year: number; month: number; day: number } {
  const m = vcard.match(/^BDAY(?:;[^:]*)?:(\d{4})-(\d{2})-(\d{2})/im);
  if (!m) return { year: 0, month: 0, day: 0 };
  const year = parseInt(m[1], 10);
  // 1604 is a sentinel year used by some clients when year is unknown
  return { year: year === 1604 ? 0 : year, month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

/** Extract structured address from vCard ADR field */
export function extractAdr(vcard: string): { street: string; secondary: string; city: string; state: string; zip: string; country: string } {
  // ADR format: pobox;ext;street;city;state;zip;country
  // May have prefix like "item3.ADR"
  const m = vcard.match(/^(?:\w+\.)?ADR(?:;[^:]*)?:(.*)$/im);
  if (!m) return { street: "", secondary: "", city: "", state: "", zip: "", country: "" };
  const parts = m[1].split(";");
  return {
    street: (parts[2] || "").trim().replace(/\\,/g, ",").replace(/\\;/g, ";"),
    secondary: (parts[1] || "").trim().replace(/\\,/g, ",").replace(/\\;/g, ";"),
    city: (parts[3] || "").trim(),
    state: (parts[4] || "").trim(),
    zip: (parts[5] || "").trim(),
    country: (parts[6] || "").trim(),
  };
}

/** Extract embedded PHOTO as a data URI from a vCard */
export function extractPhoto(vcard: string): string {
  // Match PHOTO line with params like ENCODING=b;TYPE=JPEG
  const photoMatch = vcard.match(/^PHOTO(?:;([^:]*?))?:([\s\S]*?)(?=\r?\n[A-Z])/im);
  if (!photoMatch) return "";

  const params = (photoMatch[1] || "").toUpperCase();
  const data = photoMatch[2].replace(/\r?\n\s*/g, ""); // unfold continuation lines

  // Determine MIME type from params
  let mime = "image/jpeg"; // default
  if (params.includes("TYPE=PNG")) mime = "image/png";
  else if (params.includes("TYPE=GIF")) mime = "image/gif";
  else if (params.includes("TYPE=WEBP")) mime = "image/webp";

  // Only produce data URI if we have base64 data
  if (params.includes("ENCODING=B") || params.includes("ENCODING=BASE64") || data.length > 200) {
    return `data:${mime};base64,${data}`;
  }
  return "";
}

/** Build or update a vCard string from field values */
export function buildVCard(fields: VCardFields, existingRaw?: string): string {
  // If we have an existing vCard, update fields in-place to preserve extra data
  if (existingRaw) {
    // Unfold continuation lines first so regexes match full values
    let vcard = unfoldVCard(existingRaw);
    const setField = (name: string, value: string) => {
      // Replace existing field or append before END:VCARD
      const re = new RegExp(`^${name}(?:;[^:]*)?:.*$`, "im");
      if (re.test(vcard)) {
        vcard = vcard.replace(re, value ? `${name}:${value}` : "");
      } else if (value) {
        vcard = vcard.replace(/\r?\nEND:VCARD/i, `\r\n${name}:${value}\r\nEND:VCARD`);
      }
    };
    if (fields.fn !== undefined) setField("FN", fields.fn);
    if (fields.firstName !== undefined || fields.lastName !== undefined) {
      setField("N", `${fields.lastName ?? ""};${fields.firstName ?? ""};;;`);
    }
    if (fields.email !== undefined) setField("EMAIL", fields.email);
    if (fields.tel !== undefined) setField("TEL", fields.tel);
    if (fields.org !== undefined) setField("ORG", fields.org);
    // Handle ADR — format: ;;street;city;state;zip;country  (ext field used for secondary address)
    if (fields.adrStreet !== undefined || fields.adrSecondary !== undefined || fields.adrCity !== undefined ||
        fields.adrState !== undefined || fields.adrZip !== undefined ||
        fields.adrCountry !== undefined) {
      const adrVal = `;${fields.adrSecondary ?? ""};${fields.adrStreet ?? ""};${fields.adrCity ?? ""};${fields.adrState ?? ""};${fields.adrZip ?? ""};${fields.adrCountry ?? ""}`;
      // Match ADR with any prefix (e.g. item3.ADR) — remove ALL existing ADR lines
      const adrRe = /^(?:\w+\.)?ADR(?:;[^:]*)?:.*$/gim;
      vcard = vcard.replace(adrRe, "");
      if (adrVal !== ";;;;;;" ) {
        vcard = vcard.replace(/\r?\nEND:VCARD/i, `\r\nADR;TYPE=HOME:${adrVal}\r\nEND:VCARD`);
      }
    }
    // Clean up blank lines from removed fields
    // Handle BDAY
    if (fields.bdayMonth !== undefined && fields.bdayDay !== undefined) {
      const y = String(fields.bdayYear || 1604).padStart(4, "0");
      const m = String(fields.bdayMonth).padStart(2, "0");
      const d = String(fields.bdayDay).padStart(2, "0");
      const bdayVal = `${y}-${m}-${d}`;
      setField("BDAY", bdayVal);
    }
    // Handle PHOTO
    if (fields.photo !== undefined) {
      // Remove ALL existing PHOTO lines (may span multiple lines via folding, already unfolded)
      const photoRe = /^PHOTO[;:][^\r\n]*$/gim;
      vcard = vcard.replace(photoRe, "");
      if (fields.photo) {
        const mime = fields.photoMime || "JPEG";
        const photoLine = `PHOTO;ENCODING=b;TYPE=${mime}:${fields.photo}`;
        vcard = vcard.replace(/\r?\nEND:VCARD/i, `\r\n${photoLine}\r\nEND:VCARD`);
      }
    }
    vcard = vcard.replace(/(\r?\n){3,}/g, "\r\n");
    return vcard;
  }

  // Build a new vCard from scratch
  const uid = fields.uid || crypto.randomUUID();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid}`,
    `FN:${fields.fn || ""}`,
    `N:${fields.lastName || ""};${fields.firstName || ""};;;`,
  ];
  if (fields.email) lines.push(`EMAIL:${fields.email}`);
  if (fields.tel) lines.push(`TEL:${fields.tel}`);
  if (fields.org) lines.push(`ORG:${fields.org}`);
  {
    const adrVal = `;${fields.adrSecondary ?? ""};${fields.adrStreet ?? ""};${fields.adrCity ?? ""};${fields.adrState ?? ""};${fields.adrZip ?? ""};${fields.adrCountry ?? ""}`;
    if (adrVal !== ";;;;;;" ) lines.push(`ADR;TYPE=HOME:${adrVal}`);
  }
  if (fields.bdayMonth && fields.bdayDay) {
    const y = String(fields.bdayYear || 1604).padStart(4, "0");
    const m = String(fields.bdayMonth).padStart(2, "0");
    const d = String(fields.bdayDay).padStart(2, "0");
    lines.push(`BDAY;VALUE=date:${y}-${m}-${d}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
