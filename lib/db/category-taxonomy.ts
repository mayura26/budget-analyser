/** Canonical category taxonomy */

export const MAIN_GROUP_NAMES = [
  "Money IN",
  "Living Costs",
  "Essentials",
  "Enjoyment",
  "Special",
  "Savings & Investing",
  "Transfers",
  "Misc",
] as const;

export type MainGroupName = (typeof MAIN_GROUP_NAMES)[number];

export const MAIN_GROUP_DEFAULTS: {
  name: MainGroupName;
  color: string;
  icon: string;
  type: "income" | "expense" | "transfer";
}[] = [
  { name: "Money IN", color: "#16A34A", icon: "Wallet", type: "income" },
  { name: "Living Costs", color: "#2563EB", icon: "Home", type: "expense" },
  { name: "Essentials", color: "#0D9488", icon: "Leaf", type: "expense" },
  { name: "Enjoyment", color: "#7C3AED", icon: "Sparkles", type: "expense" },
  { name: "Special", color: "#EA580C", icon: "Plane", type: "expense" },
  {
    name: "Savings & Investing",
    color: "#059669",
    icon: "TrendingUp",
    type: "expense",
  },
  {
    name: "Transfers",
    color: "#6B7280",
    icon: "ArrowLeftRight",
    type: "transfer",
  },
  { name: "Misc", color: "#DC2626", icon: "HelpCircle", type: "expense" },
];

export const DEFAULT_SUBS: {
  name: string;
  main: MainGroupName;
  icon: string;
  type: "income" | "expense" | "transfer";
  color: string;
}[] = [
  {
    name: "Income (salary / primary)",
    main: "Money IN",
    icon: "Banknote",
    type: "income",
    color: "#22C55E",
  },
  {
    name: "Gifts",
    main: "Money IN",
    icon: "Gift",
    type: "income",
    color: "#4ADE80",
  },
  {
    name: "Interest / Investment Income",
    main: "Money IN",
    icon: "Percent",
    type: "income",
    color: "#86EFAC",
  },
  {
    name: "Housing (rent, strata)",
    main: "Living Costs",
    icon: "Building",
    type: "expense",
    color: "#3B82F6",
  },
  {
    name: "Utilities (electricity, internet, phone)",
    main: "Living Costs",
    icon: "Zap",
    type: "expense",
    color: "#60A5FA",
  },
  {
    name: "Insurance (health, contents, car)",
    main: "Living Costs",
    icon: "Shield",
    type: "expense",
    color: "#93C5FD",
  },
  {
    name: "Transport (fuel, public transport, rego)",
    main: "Living Costs",
    icon: "Car",
    type: "expense",
    color: "#BFDBFE",
  },
  {
    name: "Household (cleaning, supplies, small home items)",
    main: "Living Costs",
    icon: "Package",
    type: "expense",
    color: "#DBEAFE",
  },
  {
    name: "Groceries",
    main: "Essentials",
    icon: "ShoppingCart",
    type: "expense",
    color: "#14B8A6",
  },
  {
    name: "Health (medical, pharmacy, gym)",
    main: "Essentials",
    icon: "Heart",
    type: "expense",
    color: "#2DD4BF",
  },
  {
    name: "Subscriptions (Netflix, apps, SaaS)",
    main: "Enjoyment",
    icon: "Tv",
    type: "expense",
    color: "#8B5CF6",
  },
  {
    name: "Activities (dining, events, hobbies)",
    main: "Enjoyment",
    icon: "Utensils",
    type: "expense",
    color: "#A78BFA",
  },
  {
    name: "Shopping (clothes, random purchases)",
    main: "Enjoyment",
    icon: "ShoppingBag",
    type: "expense",
    color: "#C4B5FD",
  },
  {
    name: "Holidays",
    main: "Special",
    icon: "Palmtree",
    type: "expense",
    color: "#F97316",
  },
  {
    name: "Travel (flights, transport)",
    main: "Special",
    icon: "Plane",
    type: "expense",
    color: "#FB923C",
  },
  {
    name: "Accommodation",
    main: "Special",
    icon: "Hotel",
    type: "expense",
    color: "#FDBA74",
  },
  {
    name: "Investments",
    main: "Savings & Investing",
    icon: "LineChart",
    type: "expense",
    color: "#10B981",
  },
  {
    name: "Long-term savings (house, emergency fund)",
    main: "Savings & Investing",
    icon: "PiggyBank",
    type: "expense",
    color: "#34D399",
  },
  {
    name: "Internal transfers",
    main: "Transfers",
    icon: "ArrowLeftRight",
    type: "transfer",
    color: "#9CA3AF",
  },
  {
    name: "Credit card payments",
    main: "Transfers",
    icon: "CreditCard",
    type: "transfer",
    color: "#D1D5DB",
  },
  {
    name: "Catch-all",
    main: "Misc",
    icon: "CircleHelp",
    type: "expense",
    color: "#EF4444",
  },
];

export const MAIN_RENAMES: Record<string, MainGroupName> = {
  "Money in": "Money IN",
  "Living costs": "Living Costs",
  Savings: "Savings & Investing",
  "One-off & irregular": "Special",
};

export const LEGACY_FLAT_TO_MAIN: Record<string, MainGroupName> = {
  Income: "Money IN",
  Gifts: "Money IN",
  Groceries: "Essentials",
  Dining: "Enjoyment",
  Transport: "Living Costs",
  Utilities: "Living Costs",
  Health: "Essentials",
  Entertainment: "Enjoyment",
  Shopping: "Enjoyment",
  Travel: "Special",
  Housing: "Living Costs",
  Insurance: "Living Costs",
  Investments: "Savings & Investing",
  Transfer: "Transfers",
  "Credit Card Payment": "Transfers",
  Misc: "Misc",
};

export const REPARENT_SUB_TO_MAIN: {
  subName: string;
  targetMain: MainGroupName;
}[] = [
  { subName: "Groceries", targetMain: "Essentials" },
  { subName: "Health", targetMain: "Essentials" },
  { subName: "Housing", targetMain: "Living Costs" },
  { subName: "Utilities", targetMain: "Living Costs" },
  { subName: "Insurance", targetMain: "Living Costs" },
  { subName: "Transport", targetMain: "Living Costs" },
  { subName: "Dining", targetMain: "Enjoyment" },
  { subName: "Entertainment", targetMain: "Enjoyment" },
  { subName: "Shopping", targetMain: "Enjoyment" },
  { subName: "Travel", targetMain: "Special" },
  { subName: "Holidays", targetMain: "Special" },
  { subName: "Investments", targetMain: "Savings & Investing" },
  { subName: "Income", targetMain: "Money IN" },
  { subName: "Transfer", targetMain: "Transfers" },
  { subName: "Credit Card Payment", targetMain: "Transfers" },
  { subName: "Misc", targetMain: "Misc" },
];

export const SUB_NAME_UPGRADES: Record<string, string> = {
  Income: "Income (salary / primary)",
  Dining: "Activities (dining, events, hobbies)",
  Entertainment: "Subscriptions (Netflix, apps, SaaS)",
  Transfer: "Internal transfers",
  "Credit Card Payment": "Credit card payments",
  Misc: "Catch-all",
};

export function allKnownMainNames(): Set<string> {
  const s = new Set<string>(MAIN_GROUP_NAMES);
  for (const [a, b] of Object.entries(MAIN_RENAMES)) {
    s.add(a);
    s.add(b);
  }
  return s;
}
