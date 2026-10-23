/**
 * Brokely's privacy notice (PDPA 2010 as amended 2024, Notice and Choice Principle, s.7): one
 * text for the app (More → Privacy) and the public page (GET /privacy on the API), so both always
 * say the same. Written notice in English and Bahasa Malaysia; the English text prevails.
 *
 * Owner and contact set by the author (22 Oct). The Malay still needs a native speaker's check.
 * Review: docs/project/privacy-review.md.
 */

/** Who is responsible for the data (the "data user"/controller). Set by the author. */
export const PRIVACY_OWNER = "Elias Al-Sumairi";
/** Where students send questions, access/correction requests and complaints. */
export const PRIVACY_CONTACT = "eliassumairi@gmail.com";
/** Shown on the notice; change it whenever the text changes. */
export const PRIVACY_NOTICE_DATE = "23 October 2026";

export interface NoticeSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface PrivacyNotice {
  readonly title: string;
  readonly updated: string;
  readonly sections: readonly NoticeSection[];
}

const en: PrivacyNotice = {
  title: "Privacy notice",
  updated: `Last updated ${PRIVACY_NOTICE_DATE}`,
  sections: [
    {
      title: "Who we are",
      paragraphs: [
        `Brokely is a student budgeting app made by ${PRIVACY_OWNER}. ${PRIVACY_OWNER} is responsible for your personal data in Brokely. Questions, requests and complaints: ${PRIVACY_CONTACT}.`,
      ],
    },
    {
      title: "What Brokely keeps",
      paragraphs: [
        "Without an account, everything stays on your phone: your plans, records (amounts, dates, categories and notes), bills, debts, money in, wallet checks, no-spending days and settings. Nothing is sent anywhere.",
        "With an account (optional, for backup and sync), we also keep: your email address; if you sign in with Google, your name, Google profile picture link and Google account ID; and a copy of your plans, records, bills, debts, wallet checks and settings. Your nickname, theme and card choices stay on your phone only.",
        "We never ask for or keep bank logins, PINs, one-time passwords or card numbers. Brokely has no ads, no analytics and no tracking, and it doesn't read your contacts or your location.",
      ],
    },
    {
      title: "Why",
      paragraphs: [
        "To sign you in, and to back up and sync your records between your phones. That's all. Your data is never sold, never shared for marketing and never used for advertising or profiling. Category suggestions and money tips are worked out on your phone.",
      ],
    },
    {
      title: "Names of friends",
      paragraphs: [
        "When you record a debt or split a bill, you type a friend's name. It is kept like your notes: only you can see it. A first name or nickname is enough.",
      ],
    },
    {
      title: "Where it is stored, and who helps us",
      paragraphs: [
        "Supabase stores your account and backed-up records in a data centre in Singapore. Brokely's sync server runs on Microsoft Azure in Hong Kong: your records pass through it to Supabase, and its logs only hold technical details (time, address called, result), never amounts, notes or names. Google is involved only if you sign in with Google.",
        "Singapore and Hong Kong are outside Malaysia. Both have their own personal data protection laws, these providers protect the data under contract, and everything travels encrypted (HTTPS). By creating an account you agree to this transfer.",
        "Brokely switches off Android's own Google backup, so the data on your phone is never copied to your Google account. Your Brokely account is the only backup; without one, you can save a copy any time with More → Your data → Export.",
      ],
    },
    {
      title: "How long we keep it",
      paragraphs: [
        "On your phone: until you delete it (More → Your data → Delete all my data) or uninstall Brokely.",
        "In your account: until you delete your account (More → Profile → Delete my account). It is then removed from the live database straight away, and from backups within 30 days.",
      ],
    },
    {
      title: "Your rights and choices",
      paragraphs: [
        "Use Brokely without an account: an account is optional. Without one, backup and sync aren't available, and everything else works.",
        "See, correct and copy your data any time: every record can be edited, and More → Your data exports everything (CSV and JSON).",
        `Delete it: on the phone, or your whole account. Deleting your account withdraws your consent. For anything else, or to complain, write to ${PRIVACY_CONTACT}; we answer within 21 days. You can also complain to the Personal Data Protection Commissioner of Malaysia (www.pdp.gov.my).`,
      ],
    },
    {
      title: "Keeping it safe",
      paragraphs: [
        "Data travels encrypted. Your sign-in is kept in Android's secure storage. The database can only be reached through Brokely's sync server, and every student can only reach their own records.",
        "If a data breach happens, we report it to the Personal Data Protection Commissioner within 72 hours, and if it is likely to harm you, we tell you without delay.",
      ],
    },
    {
      title: "Changes and language",
      paragraphs: [
        "If this notice changes, Brokely will show you the new version. This notice is in English and Bahasa Malaysia; if they differ, the English version applies.",
      ],
    },
  ],
};

/** Bahasa Malaysia: a draft translation, to be checked by a native speaker before release. */
const ms: PrivacyNotice = {
  title: "Notis privasi",
  updated: `Kemas kini terakhir ${PRIVACY_NOTICE_DATE}`,
  sections: [
    {
      title: "Siapa kami",
      paragraphs: [
        `Brokely ialah aplikasi belanjawan pelajar yang dibangunkan oleh ${PRIVACY_OWNER}. ${PRIVACY_OWNER} bertanggungjawab atas data peribadi anda dalam Brokely. Soalan, permintaan dan aduan: ${PRIVACY_CONTACT}.`,
      ],
    },
    {
      title: "Apa yang Brokely simpan",
      paragraphs: [
        "Tanpa akaun, semuanya kekal dalam telefon anda: pelan, rekod (jumlah, tarikh, kategori dan catatan), bil, hutang, wang masuk, semakan dompet, hari tanpa belanja dan tetapan. Tiada apa-apa dihantar ke mana-mana.",
        "Dengan akaun (pilihan, untuk sandaran dan penyegerakan), kami juga menyimpan: alamat e-mel anda; jika anda log masuk dengan Google, nama anda, pautan gambar profil Google dan ID akaun Google; serta salinan pelan, rekod, bil, hutang, semakan dompet dan tetapan anda. Nama panggilan, tema dan pilihan kad anda kekal dalam telefon sahaja.",
        "Kami tidak sekali-kali meminta atau menyimpan maklumat log masuk bank, PIN, kata laluan sekali guna atau nombor kad. Brokely tiada iklan, tiada analitik dan tiada penjejakan, dan tidak membaca kenalan atau lokasi anda.",
      ],
    },
    {
      title: "Mengapa",
      paragraphs: [
        "Untuk melog masuk anda, dan untuk menyandarkan serta menyegerakkan rekod anda antara telefon anda. Itu sahaja. Data anda tidak sekali-kali dijual, dikongsi untuk pemasaran atau digunakan untuk pengiklanan atau pemprofilan. Cadangan kategori dan tip kewangan dikira dalam telefon anda.",
      ],
    },
    {
      title: "Nama rakan",
      paragraphs: [
        "Apabila anda merekod hutang atau berkongsi bil, anda menaip nama rakan. Nama itu disimpan seperti catatan anda: hanya anda yang dapat melihatnya. Nama pertama atau nama panggilan sudah memadai.",
      ],
    },
    {
      title: "Di mana ia disimpan, dan siapa yang membantu kami",
      paragraphs: [
        "Supabase menyimpan akaun dan rekod sandaran anda di pusat data di Singapura. Pelayan penyegerakan Brokely berjalan di Microsoft Azure di Hong Kong: rekod anda melaluinya ke Supabase, dan lognya hanya mengandungi butiran teknikal (masa, alamat yang dipanggil, keputusan), bukan jumlah, catatan atau nama. Google terlibat hanya jika anda log masuk dengan Google.",
        "Singapura dan Hong Kong berada di luar Malaysia. Kedua-duanya mempunyai undang-undang perlindungan data peribadi sendiri, penyedia ini melindungi data di bawah kontrak, dan semuanya dihantar secara tersulit (HTTPS). Dengan membuat akaun, anda bersetuju dengan pemindahan ini.",
        "Brokely mematikan sandaran Google Android sendiri, jadi data dalam telefon anda tidak pernah disalin ke akaun Google anda. Akaun Brokely anda ialah satu-satunya sandaran; tanpanya, anda boleh menyimpan salinan pada bila-bila masa melalui More → Your data → Export.",
      ],
    },
    {
      title: "Berapa lama kami menyimpannya",
      paragraphs: [
        "Dalam telefon anda: sehingga anda memadamnya (More → Your data → Delete all my data) atau menyahpasang Brokely.",
        "Dalam akaun anda: sehingga anda memadam akaun anda (More → Profile → Delete my account). Data kemudian dibuang daripada pangkalan data serta-merta, dan daripada sandaran dalam tempoh 30 hari.",
      ],
    },
    {
      title: "Hak dan pilihan anda",
      paragraphs: [
        "Gunakan Brokely tanpa akaun: akaun adalah pilihan. Tanpanya, sandaran dan penyegerakan tidak tersedia, dan semua yang lain berfungsi.",
        "Lihat, betulkan dan salin data anda pada bila-bila masa: setiap rekod boleh disunting, dan More → Your data mengeksport semuanya (CSV dan JSON).",
        `Padamkannya: dalam telefon, atau seluruh akaun anda. Memadam akaun anda menarik balik persetujuan anda. Untuk perkara lain, atau untuk membuat aduan, tulis kepada ${PRIVACY_CONTACT}; kami menjawab dalam tempoh 21 hari. Anda juga boleh mengadu kepada Pesuruhjaya Perlindungan Data Peribadi Malaysia (www.pdp.gov.my).`,
      ],
    },
    {
      title: "Menjaga keselamatannya",
      paragraphs: [
        "Data dihantar secara tersulit. Log masuk anda disimpan dalam storan selamat Android. Pangkalan data hanya boleh dicapai melalui pelayan penyegerakan Brokely, dan setiap pelajar hanya boleh mencapai rekod mereka sendiri.",
        "Jika berlaku pelanggaran data, kami melaporkannya kepada Pesuruhjaya Perlindungan Data Peribadi dalam tempoh 72 jam, dan jika ia mungkin memudaratkan anda, kami memberitahu anda dengan segera.",
      ],
    },
    {
      title: "Perubahan dan bahasa",
      paragraphs: [
        "Jika notis ini berubah, Brokely akan menunjukkan versi baharu kepada anda. Notis ini dalam bahasa Inggeris dan Bahasa Malaysia; jika berbeza, versi bahasa Inggeris terpakai.",
      ],
    },
  ],
};

export const PRIVACY_NOTICE: Readonly<Record<"en" | "ms", PrivacyNotice>> = { en, ms };
