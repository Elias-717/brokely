import { PRIVACY_CONTACT, PRIVACY_OWNER, type PrivacyNotice } from "./privacy-notice";

/**
 * Brokely's Terms of use and the account-deletion page (D-93): the same structure and languages as
 * the privacy notice, shown in the app (More → Your data) and publicly (GET /terms,
 * GET /delete-account on the API). English prevails. The Malay is a draft for a native speaker to
 * check. Not legal advice: a lawyer should read them before a public release.
 */

/** A titled document in sections; the privacy notice has the same shape. */
export type LegalDocument = PrivacyNotice;

export const TERMS_DATE = "22 October 2026";

const en: LegalDocument = {
  title: "Terms of use",
  updated: `Last updated ${TERMS_DATE}`,
  sections: [
    {
      title: "About these terms",
      paragraphs: [
        `Brokely is provided by ${PRIVACY_OWNER} ("we"). By using Brokely you agree to these terms. If you don't agree, please don't use it. Questions: ${PRIVACY_CONTACT}.`,
      ],
    },
    {
      title: "What Brokely is, and isn't",
      paragraphs: [
        "Brokely helps students plan and record their own spending. It is not a bank, a payment service, a lender or a licensed financial adviser, and it never moves money.",
        'Everything it shows comes from what you enter. "Left in plan", forecasts, suggestions and money tips are general guides to help you plan, not financial, legal or tax advice. Decisions about your money are your own.',
      ],
    },
    {
      title: "Who can use it",
      paragraphs: ["Brokely is for students aged 18 or over."],
    },
    {
      title: "Your account",
      paragraphs: [
        "An account is optional and only used for backup and sync. Keep your sign-in safe; you're responsible for what happens in your account. Tell us at once if you think someone else is using it.",
      ],
    },
    {
      title: "Fair use",
      paragraphs: [
        "Don't misuse Brokely: no trying to reach other people's data, attacking or overloading the service, getting around its limits, or using it for anything unlawful. When you type friends' names for debts, keep to what you need, like a first name.",
      ],
    },
    {
      title: "Your records",
      paragraphs: [
        "Your records stay yours. You let us store and process them only to run Brokely for you, as the Privacy notice explains. You can export or delete them at any time.",
      ],
    },
    {
      title: "A free pilot",
      paragraphs: [
        "Brokely is free and in a pilot. Features may change, and the service may pause or stop; where we can, we'll tell you in advance so you can export your records. Keep your own export of anything important.",
      ],
    },
    {
      title: "No guarantees",
      paragraphs: [
        'We work to keep Brokely correct and available, but it is provided "as is", without guarantees that it will always be accurate, uninterrupted or free of errors.',
        "As far as the law allows, we are not responsible for losses that come from relying on Brokely's numbers or suggestions, or from records that are lost. Nothing in these terms limits rights you have that the law (including the Consumer Protection Act 1999) does not allow us to limit.",
      ],
    },
    {
      title: "Ending",
      paragraphs: [
        "You can stop using Brokely and delete your data or account at any time. We may suspend an account that breaks these terms or puts the service or other students at risk.",
      ],
    },
    {
      title: "Changes and law",
      paragraphs: [
        "If these terms change, Brokely will show you the new version before it applies to you. These terms are governed by the laws of Malaysia. They are in English and Bahasa Malaysia; if they differ, the English version applies.",
      ],
    },
  ],
};

const ms: LegalDocument = {
  title: "Terma penggunaan",
  updated: `Kemas kini terakhir ${TERMS_DATE}`,
  sections: [
    {
      title: "Tentang terma ini",
      paragraphs: [
        `Brokely disediakan oleh ${PRIVACY_OWNER} ("kami"). Dengan menggunakan Brokely, anda bersetuju dengan terma ini. Jika anda tidak bersetuju, sila jangan gunakannya. Soalan: ${PRIVACY_CONTACT}.`,
      ],
    },
    {
      title: "Apa itu Brokely, dan apa yang bukan",
      paragraphs: [
        "Brokely membantu pelajar merancang dan merekod perbelanjaan mereka sendiri. Ia bukan bank, perkhidmatan pembayaran, pemberi pinjaman atau penasihat kewangan berlesen, dan ia tidak sekali-kali memindahkan wang.",
        'Semua yang ditunjukkan datang daripada apa yang anda masukkan. "Baki dalam pelan", ramalan, cadangan dan tip kewangan ialah panduan umum untuk membantu anda merancang, bukan nasihat kewangan, undang-undang atau cukai. Keputusan tentang wang anda adalah milik anda.',
      ],
    },
    {
      title: "Siapa boleh menggunakannya",
      paragraphs: ["Brokely adalah untuk pelajar berumur 18 tahun ke atas."],
    },
    {
      title: "Akaun anda",
      paragraphs: [
        "Akaun adalah pilihan dan hanya digunakan untuk sandaran dan penyegerakan. Jaga log masuk anda; anda bertanggungjawab atas apa yang berlaku dalam akaun anda. Beritahu kami segera jika anda fikir orang lain menggunakannya.",
      ],
    },
    {
      title: "Penggunaan yang wajar",
      paragraphs: [
        "Jangan salah guna Brokely: jangan cuba mencapai data orang lain, menyerang atau membebankan perkhidmatan, mengelak hadnya, atau menggunakannya untuk apa-apa yang menyalahi undang-undang. Apabila menaip nama rakan untuk hutang, taip apa yang perlu sahaja, seperti nama pertama.",
      ],
    },
    {
      title: "Rekod anda",
      paragraphs: [
        "Rekod anda kekal milik anda. Anda membenarkan kami menyimpan dan memprosesnya hanya untuk menjalankan Brokely untuk anda, seperti yang diterangkan dalam Notis privasi. Anda boleh mengeksport atau memadamnya pada bila-bila masa.",
      ],
    },
    {
      title: "Perintis percuma",
      paragraphs: [
        "Brokely adalah percuma dan dalam peringkat perintis. Ciri boleh berubah, dan perkhidmatan boleh berhenti seketika atau ditamatkan; jika boleh, kami akan memberitahu anda lebih awal supaya anda boleh mengeksport rekod anda. Simpan eksport anda sendiri untuk apa-apa yang penting.",
      ],
    },
    {
      title: "Tiada jaminan",
      paragraphs: [
        'Kami berusaha memastikan Brokely tepat dan tersedia, tetapi ia disediakan "seadanya", tanpa jaminan bahawa ia sentiasa tepat, tanpa gangguan atau bebas daripada ralat.',
        "Setakat yang dibenarkan oleh undang-undang, kami tidak bertanggungjawab atas kerugian akibat bergantung pada angka atau cadangan Brokely, atau rekod yang hilang. Tiada apa-apa dalam terma ini mengehadkan hak anda yang tidak boleh dihadkan oleh undang-undang (termasuk Akta Perlindungan Pengguna 1999).",
      ],
    },
    {
      title: "Penamatan",
      paragraphs: [
        "Anda boleh berhenti menggunakan Brokely dan memadam data atau akaun anda pada bila-bila masa. Kami boleh menggantung akaun yang melanggar terma ini atau membahayakan perkhidmatan atau pelajar lain.",
      ],
    },
    {
      title: "Perubahan dan undang-undang",
      paragraphs: [
        "Jika terma ini berubah, Brokely akan menunjukkan versi baharu kepada anda sebelum ia terpakai kepada anda. Terma ini ditadbir oleh undang-undang Malaysia. Ia dalam bahasa Inggeris dan Bahasa Malaysia; jika berbeza, versi bahasa Inggeris terpakai.",
      ],
    },
  ],
};

export const TERMS: Readonly<Record<"en" | "ms", LegalDocument>> = { en, ms };

/**
 * How to delete an account (Google Play's account deletion requirement): in the app, or by email
 * for someone who no longer has the app. What is deleted and what is kept, and for how long.
 */
export const ACCOUNT_DELETION: Readonly<Record<"en" | "ms", LegalDocument>> = {
  en: {
    title: "Delete your Brokely account",
    updated: `Last updated ${TERMS_DATE}`,
    sections: [
      {
        title: "In the app",
        paragraphs: [
          "Open Brokely → More → your profile at the top → Delete my account, and confirm. Your account and everything backed up with it are deleted, and the records on that phone too.",
        ],
      },
      {
        title: "Without the app",
        paragraphs: [
          `Email ${PRIVACY_CONTACT} from the address you signed in with, asking to delete your Brokely account. We delete it within 21 days and reply when it's done.`,
        ],
      },
      {
        title: "What is deleted, and when",
        paragraphs: [
          "Deleted at once: your sign-in (email, and your Google name and picture link if you used Google) and every backed-up plan, record, bill, debt, wallet check and setting. Database backups that still contain them expire within 30 days. Nothing is kept after that.",
          "Records on a phone where you used Brokely without signing in stay on that phone until you delete them there (More → Your data → Delete all my data) or uninstall the app.",
        ],
      },
    ],
  },
  ms: {
    title: "Padam akaun Brokely anda",
    updated: `Kemas kini terakhir ${TERMS_DATE}`,
    sections: [
      {
        title: "Dalam aplikasi",
        paragraphs: [
          "Buka Brokely → More → profil anda di bahagian atas → Delete my account, dan sahkan. Akaun anda dan semua yang disandarkan bersamanya dipadam, termasuk rekod dalam telefon itu.",
        ],
      },
      {
        title: "Tanpa aplikasi",
        paragraphs: [
          `E-mel ${PRIVACY_CONTACT} daripada alamat yang anda gunakan untuk log masuk, meminta akaun Brokely anda dipadam. Kami memadamnya dalam tempoh 21 hari dan membalas apabila selesai.`,
        ],
      },
      {
        title: "Apa yang dipadam, dan bila",
        paragraphs: [
          "Dipadam serta-merta: log masuk anda (e-mel, serta nama dan pautan gambar Google jika anda menggunakan Google) dan setiap pelan, rekod, bil, hutang, semakan dompet dan tetapan yang disandarkan. Sandaran pangkalan data yang masih mengandunginya tamat dalam tempoh 30 hari. Tiada apa-apa disimpan selepas itu.",
          "Rekod dalam telefon yang anda gunakan tanpa log masuk kekal dalam telefon itu sehingga anda memadamnya di sana (More → Your data → Delete all my data) atau menyahpasang aplikasi.",
        ],
      },
    ],
  },
};
