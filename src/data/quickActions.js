// Shared quick-actions used by the Account page's horizontal tile row and by
// the SellerAdmin hamburger-menu drawer (sellers are also customers, so they
// get the same shortcuts). Keep this list in sync if you add or remove an
// action — both screens read from this single source of truth.

export const quickActions = [
  {
    icon: "cube",
    label: "Orders",
    screen: "Orders",
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
  {
    icon: "bookmark",
    label: "Collection",
    screen: "Collections",
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    icon: "location",
    label: "Addresses",
    screen: "Addresses",
    color: "#22C55E",
    bg: "#F0FDF4",
  },
  {
    icon: "people",
    label: "Following",
    screen: "Following",
    color: "#A855F7",
    bg: "#FAF5FF",
  },
];