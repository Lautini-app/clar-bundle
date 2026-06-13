export type ClarApp = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  available: boolean;
};

export const CLAR_APPS: ClarApp[] = [
  {
    slug: "heim",
    name: "clar·heim",
    tagline: "Haushaltsorganisation",
    description: "Strukturiere deinen Haushalt mit klaren Routinen und Listen.",
    url: "https://clar.heim.lautini.ch",
    icon: "home",
    color: "#2E5C3E",
    available: true,
  },
  {
    slug: "markt",
    name: "clar·markt",
    tagline: "Einkaufsplanung",
    description: "Einkaufslisten, die mit dir mitdenken.",
    url: "https://clar.markt.lautini.ch",
    icon: "cart",
    color: "#C97B3A",
    available: true,
  },
  {
    slug: "log",
    name: "clar·log",
    tagline: "Stimulanzien-Tagebuch",
    description: "Dokumentiere Dosis, Wirkung und Nebenwirkungen — bald verfügbar.",
    url: "",
    icon: "book",
    color: "#5B7AAE",
    available: false,
  },
  {
    slug: "tag",
    name: "clar·tag",
    tagline: "Tagesstruktur & Routinen",
    description: "Ruhige Tagesplanung für neurodiverse Köpfe — bald verfügbar.",
    url: "",
    icon: "time",
    color: "#A85C7D",
    available: false,
  },
];

export const AVAILABLE_APP_SLUGS = CLAR_APPS.filter((app) => app.available).map((app) => app.slug);

export function getAppBySlug(slug: string | null | undefined): ClarApp | null {
  if (!slug) return null;
  return CLAR_APPS.find((app) => app.slug === slug) ?? null;
}
