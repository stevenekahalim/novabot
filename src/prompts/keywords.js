/**
 * NOVA V2 - Enhanced Keyword Patterns
 *
 * Improved keyword matching for faster, cheaper extraction before AI fallback.
 * Used in comprehensiveExtractor.js for pattern-based extraction.
 */

const KEYWORD_PATTERNS = {
  // Project names (case-insensitive)
  projects: {
    patterns: [
      /\bmanado\b/i,
      /\bgrand\s*kawanua\b/i,
      /\bjakarta\b/i,
      /\bpermata\s*hijau\b/i,
      /\bpalembang\b/i,
      /\btangga\s*buntung\b/i
    ],
    normalize: {
      'grand kawanua': 'Manado',
      'permata hijau': 'Jakarta',
      'tangga buntung': 'Palembang'
    }
  },

  // Checklist item completion indicators
  checklist: {
    rental: {
      patterns: [
        /\brental\s*(agreement)?\s*(done|selesai|complete|signed|ditandatangan)\b/i,
        /\b(done|selesai|complete)\s*rental\b/i,
        /\bsign(ed)?\s*rental\b/i
      ],
      item: 'rental_agreement'
    },
    pt_cv: {
      patterns: [
        /\bpt\s*(\/\s*cv)?\s*(done|selesai|complete|dibuat|jadi)\b/i,
        /\b(done|selesai|complete)\s*pt\b/i,
        /\bakta\s*(pendirian)?\s*(done|selesai|complete|jadi)\b/i,
        /\bpt\s*(sudah)?\s*(selesai|jadi|done)\b/i
      ],
      item: 'pt_cv'
    },
    bank: {
      patterns: [
        /\bbank\s*(account)?\s*(done|selesai|complete|opened|dibuka)\b/i,
        /\b(done|selesai|complete)\s*bank\b/i,
        /\bopen(ed)?\s*bank\s*account\b/i,
        /\brekening\s*(done|selesai|dibuka|jadi)\b/i
      ],
      item: 'bank_account'
    },
    architect: {
      patterns: [
        /\barchitect\s*(done|selesai|complete|hired|dipilih)\b/i,
        /\b(done|selesai|complete)\s*architect\b/i,
        /\bhire(d)?\s*architect\b/i,
        /\bdesigner\s*(done|selesai|complete|hired|dipilih)\b/i,
        /\barchitect\s*:\s*[\w\s]+\b/i  // "architect: Name"
      ],
      item: 'architect'
    },
    contractor: {
      patterns: [
        /\bcontractor\s*(done|selesai|complete|hired|dipilih)\b/i,
        /\b(done|selesai|complete)\s*contractor\b/i,
        /\bhire(d)?\s*contractor\b/i,
        /\bkontraktor\s*(done|selesai|complete|hired|dipilih)\b/i
      ],
      item: 'contractor'
    }
  },

  // People/company names (common in Apex projects)
  people: {
    patterns: [
      /\b(eka|steven|win|ilalang|ilalang\s*design)\b/i,
      /\b(pak|bu|mas|mbak)\s+\w+/i,
      /\b[A-Z][a-z]+\s+(Design|Architect|Construction|Contractor)\b/
    ]
  },

  // Numbers with context (amounts, costs, payments)
  numbers: {
    patterns: [
      // Indonesian style: 21jt, 30M, 5,5M
      /\b(\d+[\.,]?\d*)\s*(jt|juta|m|million|miliar|milyar|b|billion|k|ribu|rb)\b/i,
      // Standard: 21000000, 30,000,000
      /\b(\d{1,3}(?:[,\.]\d{3})+|\d+)\b/,
      // Currency prefixed: Rp 21jt, $ 30M, IDR 21000000
      /\b(rp|idr|usd|\$)\s*(\d+[\.,]?\d*)\s*(jt|juta|m|million|k|ribu)?\b/i
    ],
    context: {
      dp: /\b(dp|down\s*payment|uang\s*muka)\b/i,
      fee: /\b(fee|biaya|cost|harga)\b/i,
      total: /\b(total|jumlah|sum)\b/i,
      budget: /\b(budget|anggaran)\b/i,
      paid: /\b(paid|dibayar|bayar|payment|pembayaran)\b/i
    }
  },

  // Dates and deadlines
  dates: {
    patterns: [
      // ISO: 2026-03-31
      /\b(\d{4})-(\d{2})-(\d{2})\b/,
      // Indonesian: 31 Mar 2026, 31 Maret 2026
      /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})\b/i,
      // Relative: next week, minggu depan
      /\b(next|minggu|bulan|tahun)\s+(week|month|year|depan|ini)\b/i
    ],
    context: {
      deadline: /\b(deadline|target|due|batas\s*waktu)\b/i,
      opening: /\b(opening|launch|grand\s*opening|buka|pembukaan)\b/i,
      completion: /\b(completion|done\s*by|selesai|finish)\b/i
    }
  },

  // Decisions (important for fact extraction)
  decisions: {
    patterns: [
      /\b(decided|decide|decision|memutuskan|pilih|dipilih|selected|choose|chosen)\b/i,
      /\b(go\s*with|akan\s*pakai|pake|gunakan)\b/i,
      /\b(approved|disetujui|setuju|agree)\b/i,
      /\b(finalized|final|confirmed)\b/i
    ]
  },

  // Questions (for classification)
  questions: {
    patterns: [
      /\b(status|update|progress|gimana|bagaimana|how)\b/i,
      /\b(who|siapa|when|kapan|what|apa|where|dimana|why|kenapa)\b/i,
      /\b(show|tampilkan|lihat|cek|check)\b/i,
      /^(status|update|progress)\s+\w+/i  // "status manado"
    ]
  },

  // Blockers (for escalation)
  blockers: {
    patterns: [
      /\b(stuck|blocked|blocker|macet|terhambat)\b/i,
      /\b(problem|issue|masalah|kendala|trouble)\b/i,
      /\b(waiting|menunggu|tunggu)\b/i,
      /\b(delay|delayed|terlambat|mundur)\b/i,
      /\b(can'?t|cannot|tidak\s*bisa|ga\s*bisa)\b/i
    ]
  },

  // Action items
  actions: {
    patterns: [
      /\b(need\s*to|perlu|harus|must|should)\b/i,
      /\b(todo|to\s*do|akan|will)\b/i,
      /\b(follow\s*up|followup|tindak\s*lanjut)\b/i,
      /\b(next\s*step|langkah\s*selanjutnya)\b/i
    ]
  },

  // Sentiment indicators
  sentiment: {
    positive: [
      /\b(good|great|bagus|oke|ok|done|selesai|complete|success|berhasil)\b/i,
      /\b(👍|✅|🎉|😊|😀)\b/
    ],
    negative: [
      /\b(bad|problem|issue|stuck|delay|masalah|kendala|gagal|fail)\b/i,
      /\b(⚠️|🚨|😞|😢|❌)\b/
    ],
    neutral: [
      /\b(update|status|info|question|tanya)\b/i
    ]
  }
};

/**
 * Helper function to normalize extracted values
 */
function normalizeNumber(text) {
  // Remove currency symbols and spaces
  text = text.replace(/[Rp\$\s]/gi, '');

  // Handle Indonesian style (21jt, 30M)
  const patterns = {
    'jt|juta': 1000000,
    'm|million': 1000000,
    'miliar|milyar|b|billion': 1000000000,
    'k|ribu|rb': 1000
  };

  for (const [unit, multiplier] of Object.entries(patterns)) {
    const regex = new RegExp(`(\\d+[\\.,]?\\d*)\\s*(${unit})\\b`, 'i');
    const match = text.match(regex);
    if (match) {
      const number = parseFloat(match[1].replace(',', '.'));
      return number * multiplier;
    }
  }

  // Handle standard numbers with commas/dots
  text = text.replace(/[,\.]/g, '');
  return parseInt(text) || null;
}

/**
 * Helper function to detect currency
 */
function detectCurrency(text) {
  if (/\b(rp|idr)\b/i.test(text)) return 'IDR';
  if (/\b(usd|\$)\b/i.test(text)) return 'USD';
  return 'IDR'; // Default for Indonesian context
}

module.exports = {
  KEYWORD_PATTERNS,
  normalizeNumber,
  detectCurrency
};
