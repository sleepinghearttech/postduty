/**
 * Homepage publishing list.
 * To remove any project from the homepage, set featured to false.
 * Add a project here only after its URL is reviewed for public sharing.
 * An unverified URL must remain null and renders as a non-clickable preview.
 */
export type FeaturedProject = {
  id: "christmas" | "clads" | "shop";
  number: string;
  category: string;
  title: string;
  description: string;
  status: "live" | "in-progress";
  href: string | null;
  featured: boolean;
};

export const featuredProjects: readonly FeaturedProject[] = [
  {
    id: "christmas",
    number: "01",
    category: "OBJECTS / SEASONAL",
    title: "Christmas Atelier",
    description: "Small objects. A little wonder.",
    status: "in-progress",
    href: null, // set to https://christmas.postduty.in/ once the custom domain is attached and verified
    featured: true,
  },
  {
    id: "clads",
    number: "02",
    category: "MEDICINE / INTERACTIVE",
    title: "CLADS Simulator",
    description: "Anaesthesia training, made tactile.",
    status: "live",
    href: "https://clads.postduty.in/",
    featured: true,
  },
  {
    id: "shop",
    number: "03",
    category: "DESIGN / 3D PRINT",
    title: "The PostDuty Store",
    description: "Useful objects, thoughtfully made.",
    status: "live",
    href: "https://store.postduty.in/",
    featured: true,
  },
];
