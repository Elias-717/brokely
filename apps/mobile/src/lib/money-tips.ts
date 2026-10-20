/**
 * Money tips shown after saving an expense (D-39, D-67). Local, written text only: no AI
 * (rule 8, NFR-20). Content rules (docs/design/money-tips.md): one idea, plain words, no
 * shaming, never a balance, glossary words ("money in", never "allowance").
 *
 * The first 30 are the author's (lightly reworded for the glossary); the rest are Brokely's,
 * some inspired by ideas from "Rich Dad Poor Dad" (pay yourself first, assets vs liabilities,
 * learning that earns), written in our own words. All to be reviewed by the author.
 */

export type TipTopic =
  | "food"
  | "snacks"
  | "fun"
  | "shopping"
  | "transport"
  | "bills"
  | "savings"
  | "debt"
  | "growth"
  | "general";

export interface MoneyTip {
  readonly id: string;
  readonly text: string;
  readonly topics: readonly TipTopic[];
}

export const MONEY_TIPS: readonly MoneyTip[] = [
  // Author's tips
  {
    id: "a01",
    topics: ["food"],
    text: "Before buying lunch, check how much money you need to last until the end of the month.",
  },
  {
    id: "a02",
    topics: ["food"],
    text: "Set a weekly food budget so you don't spend your whole month's money in the first few days.",
  },
  {
    id: "a03",
    topics: ["snacks"],
    text: "If you keep buying snacks between meals, set a small weekly limit instead of buying whenever you feel hungry.",
  },
  {
    id: "a04",
    topics: ["bills", "fun"],
    text: "Before subscribing to an app, ask yourself if you'll use it enough to justify paying every month.",
  },
  {
    id: "a05",
    topics: ["savings"],
    text: "When money comes in, save a small amount first instead of waiting to see what's left.",
  },
  {
    id: "a06",
    topics: ["shopping"],
    text: "Before buying something on sale, compare its price with your budget, not just its original price.",
  },
  {
    id: "a07",
    topics: ["general"],
    text: "If your money runs out before your next money in, check last week's spending to find what you can change.",
  },
  {
    id: "a08",
    topics: ["food"],
    text: "Before ordering food delivery, compare the total cost with buying the same meal nearby.",
  },
  {
    id: "a09",
    topics: ["shopping", "savings"],
    text: "If you want an expensive item, save for it over several weeks instead of spending all your money at once.",
  },
  {
    id: "a10",
    topics: ["savings"],
    text: "Keep your emergency savings separate from the money you use for daily expenses.",
  },
  {
    id: "a11",
    topics: ["shopping"],
    text: "Before buying a new phone or laptop, check whether your current device can still do the job.",
  },
  {
    id: "a12",
    topics: ["fun"],
    text: "If your friends invite you somewhere expensive, decide how much you can spend before you go.",
  },
  {
    id: "a13",
    topics: ["bills"],
    text: "Write down your upcoming bills as soon as you know about them so you don't accidentally spend that money.",
  },
  {
    id: "a14",
    topics: ["debt"],
    text: "Before borrowing money, calculate how much you'll need to repay and when it's due.",
  },
  {
    id: "a15",
    topics: ["debt", "shopping"],
    text: "If you use buy now, pay later, add all your future payments together before accepting another one.",
  },
  {
    id: "a16",
    topics: ["food"],
    text: "Compare the cost of cooking a meal with buying it outside to see where you can save without skipping meals.",
  },
  {
    id: "a17",
    topics: ["savings"],
    text: "If you receive extra money, consider adding some to your savings before increasing your spending.",
  },
  {
    id: "a18",
    topics: ["shopping", "fun"],
    text: "Before buying something you want but don't need, wait 24 hours and see if you still want it.",
  },
  {
    id: "a19",
    topics: ["bills"],
    text: "Check your bank and TNG history every week to spot subscriptions or payments you forgot about.",
  },
  {
    id: "a20",
    topics: ["savings"],
    text: "If you have several money goals, save a small amount toward each instead of trying to do everything at once.",
  },
  {
    id: "a21",
    topics: ["growth"],
    text: "Before paying for an online course, check whether you can learn the same skill with free resources first.",
  },
  {
    id: "a22",
    topics: ["growth"],
    text: "Use your laptop to build projects and learn skills that could help you earn money in the future.",
  },
  {
    id: "a23",
    topics: ["growth"],
    text: "If you want to start earning online, test your skills with a small project before spending on tools or courses.",
  },
  {
    id: "a24",
    topics: ["shopping"],
    text: "Before buying a cheap item, check whether it will last long enough to be worth the price.",
  },
  {
    id: "a25",
    topics: ["general"],
    text: "If you keep going over in one category, adjust its amount or change the habit instead of ignoring it.",
  },
  {
    id: "a26",
    topics: ["growth"],
    text: "Before investing, learn how the investment works and what could make you lose money.",
  },
  {
    id: "a27",
    topics: ["growth"],
    text: "If someone promises quick, guaranteed profits, research the offer carefully before sending any money.",
  },
  {
    id: "a28",
    topics: ["shopping"],
    text: "When comparing two products, add up the total cost, including delivery, maintenance and other fees.",
  },
  {
    id: "a29",
    topics: ["savings"],
    text: "Want to save RM300 in three months? Aim for RM100 each month instead of hoping you'll have enough later.",
  },
  {
    id: "a30",
    topics: ["fun", "general"],
    text: "Before spending on fun, set aside enough for food, transport and other essentials first.",
  },
  // Brokely's tips
  {
    id: "b01",
    topics: ["savings"],
    text: "Pay yourself first: move a little into Savings the day money comes in, even RM10. 🥦",
  },
  {
    id: "b02",
    topics: ["shopping", "growth"],
    text: "Ask of any buy: will it put money in my pocket, or take money out every month? The first kind grows you.",
  },
  {
    id: "b03",
    topics: ["growth"],
    text: "Your best investment right now is learning. A skill you build this semester can pay you for years.",
  },
  {
    id: "b04",
    topics: ["general"],
    text: "Money is a tool. Knowing where every ringgit goes is the first step to making it work for you.",
  },
  {
    id: "b05",
    topics: ["snacks"],
    text: "Little leaks sink big ships: RM3 a day of snacks is about RM90 a month. Worth it? Your call. 🍪",
  },
  {
    id: "b06",
    topics: ["food"],
    text: "Cooking with friends and splitting the groceries often costs less than eating out alone.",
  },
  {
    id: "b07",
    topics: ["transport"],
    text: "Sharing a ride with friends going the same way can cut your Grab cost in half.",
  },
  {
    id: "b08",
    topics: ["transport"],
    text: "Check if a weekly or monthly bus or train pass costs less than paying each trip.",
  },
  {
    id: "b09",
    topics: ["transport"],
    text: "Sudden rides happen. Keeping a little money unplanned means a rainy-day Grab won't break your plan.",
  },
  {
    id: "b10",
    topics: ["debt"],
    text: "Paying a friend back quickly keeps the friendship, and your plan, healthy. 🤝",
  },
  {
    id: "b11",
    topics: ["savings"],
    text: "Set aside a small Emergency amount first, even RM20. Future you will say thanks.",
  },
  {
    id: "b12",
    topics: ["shopping"],
    text: "Ask for the student price: many shops, apps and cinemas give one if you show your student card.",
  },
  {
    id: "b13",
    topics: ["fun"],
    text: "Free fun counts too: campus events, sports and study groups are great ways to spend an evening.",
  },
  {
    id: "b14",
    topics: ["general"],
    text: "Logging every spend, even small ones, is how you learn your real habits. Nice one for recording this!",
  },
  {
    id: "b15",
    topics: ["growth"],
    text: "Rich habits start small: earn a little from a skill, save some, and let your skills grow your income.",
  },
  {
    id: "b16",
    topics: ["bills"],
    text: "A subscription you forgot about is money leaving every month. Mark the date and decide if it stays.",
  },
  {
    id: "b17",
    topics: ["food"],
    text: "Bringing water from home instead of buying drinks daily can save more than you'd expect in a month.",
  },
  {
    id: "b18",
    topics: ["debt"],
    text: "Before lending money, decide what you can afford to lose if it doesn't come back soon.",
  },
  {
    id: "b19",
    topics: ["general"],
    text: "Look at your spending once a week. Five minutes of checking saves a lot of month-end surprises.",
  },
  {
    id: "b20",
    topics: ["savings", "growth"],
    text: "The earlier you start saving, the more time your money has to grow. Small and steady wins.",
  },
];

/** Which topics fit a category, so a tip relates to what was just recorded (D-67). */
const TOPICS_BY_CATEGORY: Record<string, readonly TipTopic[]> = {
  Meals: ["food"],
  "Home necessities": ["food", "shopping"],
  "Snacks & treats": ["snacks", "food"],
  Transport: ["transport"],
  "Phone & internet": ["bills"],
  Subscriptions: ["bills"],
  Utilities: ["bills"],
  "Housing & Rent": ["bills"],
  "Loans & Debt": ["debt"],
  "Fun & trips": ["fun"],
  Shopping: ["shopping"],
  "Gifts & charity": ["general"],
  Education: ["growth"],
  Emergency: ["savings"],
  Savings: ["savings"],
};

/** At most 10 tips a day (author, D-70): a tip after nearly every expense, never a flood. */
export const TIPS_PER_DAY = 10;

/**
 * Picks the next tip: one not seen yet that fits the category (most of the time), otherwise any
 * not seen yet. `random` is injected so the choice can be tested.
 */
export function pickTip(
  categoryName: string | null,
  seen: readonly string[],
  random: () => number = Math.random,
): MoneyTip {
  const fresh = MONEY_TIPS.filter((t) => !seen.includes(t.id));
  const pool = fresh.length > 0 ? fresh : MONEY_TIPS;
  const topics = (categoryName && TOPICS_BY_CATEGORY[categoryName]) || [];
  const fitting = pool.filter((t) => t.topics.some((topic) => topics.includes(topic)));
  // Mostly a tip about what was just recorded, sometimes a general one for variety.
  const from = fitting.length > 0 && random() < 0.75 ? fitting : pool;
  return from[Math.floor(random() * from.length)] ?? pool[0]!;
}
