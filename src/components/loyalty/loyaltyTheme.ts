export interface LoyaltyTheme {
  slug: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
  gradient: string;
  headerIcon: string;
  dotActiveBg: string;
  dotActiveBorder: string;
  dotRewardColor: string;
  progressGradient: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
}

export const LOYALTY_THEMES: Record<string, LoyaltyTheme> = {
  premium: {
    slug: "premium",
    name: "Premium",
    primary: "#7F0000",
    secondary: "#381C26",
    accent: "#C89B5A",
    bg: "#FFF1DF",
    text: "#002C47",
    gradient: "linear-gradient(135deg, #7F0000 0%, #381C26 55%, #002C47 100%)",
    headerIcon: "fa-crown",
    dotActiveBg: "#7F0000",
    dotActiveBorder: "#C89B5A",
    dotRewardColor: "#C89B5A",
    progressGradient: "linear-gradient(90deg, #7F0000 0%, #C89B5A 100%)",
    badgeBg: "rgba(127, 0, 0, 0.08)",
    badgeText: "#7F0000",
    badgeBorder: "rgba(200, 155, 90, 0.35)",
    cardBorder: "#E8DECC",
  },
  nitido: {
    slug: "nitido",
    name: "Nítido",
    primary: "#0B4968",
    secondary: "#456A83",
    accent: "#7DB7D5",
    bg: "#F1F7FA",
    text: "#002C47",
    gradient: "linear-gradient(135deg, #003B59 0%, #456A83 50%, #7DB7D5 100%)",
    headerIcon: "fa-droplet",
    dotActiveBg: "#0B4968",
    dotActiveBorder: "#7DB7D5",
    dotRewardColor: "#7DB7D5",
    progressGradient: "linear-gradient(90deg, #0B4968 0%, #7DB7D5 100%)",
    badgeBg: "rgba(11, 73, 104, 0.08)",
    badgeText: "#0B4968",
    badgeBorder: "rgba(125, 183, 213, 0.35)",
    cardBorder: "#E8DECC",
  },
};

export function getLoyaltyTheme(slug?: string): LoyaltyTheme {
  return LOYALTY_THEMES[slug ?? ""] ?? LOYALTY_THEMES.premium;
}
