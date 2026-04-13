const hashString = (input) => {
  let hash = 0;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
};

const createSeededRandom = (seed) => {
  let state = hashString(seed);
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const shuffleWithSeed = (items, seed) => {
  const random = createSeededRandom(seed);
  const copy = [...(items || [])];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
};

export const injectAdsIntoProducts = ({
  products,
  ads,
  seed,
  minInterval = 5,
  maxInterval = 9,
  maxAds = 3,
}) => {
  const baseProducts = Array.isArray(products) ? products : [];
  const inlineOnlyStyles = new Set([
    "popup",
    "fullscreen",
    "sticky_footer",
    "carousel",
    "sidebar",
    "story",
  ]);
  const activeAds = Array.isArray(ads)
    ? ads.filter(
        (ad) =>
          ad && !inlineOnlyStyles.has(String(ad.style || "").toLowerCase()),
      )
    : [];

  if (baseProducts.length === 0 || activeAds.length === 0) {
    return baseProducts;
  }

  const minSafe = Math.max(3, minInterval);
  const maxSafe = Math.max(minSafe, maxInterval);
  const random = createSeededRandom(seed || "expressmart-ads");

  // Limit injected ads so we do not flood the grid.
  const densityLimit = Math.max(1, Math.floor(baseProducts.length / minSafe));
  const injectCount = Math.max(
    1,
    Math.min(maxAds, densityLimit, activeAds.length),
  );
  const selectedAds = shuffleWithSeed(activeAds, `${seed}-pick`).slice(
    0,
    injectCount,
  );

  const injected = [];
  let adCursor = 0;
  let nextInsertAfter =
    minSafe + Math.floor(random() * (maxSafe - minSafe + 1));

  for (let i = 0; i < baseProducts.length; i += 1) {
    injected.push(baseProducts[i]);

    const productCount = i + 1;
    if (adCursor < selectedAds.length && productCount >= nextInsertAfter) {
      const ad = selectedAds[adCursor];
      injected.push({
        __type: "injected_ad",
        id: `ad-${ad.id}-${adCursor}`,
        ad,
      });

      adCursor += 1;
      nextInsertAfter +=
        minSafe + Math.floor(random() * (maxSafe - minSafe + 1));
    }
  }

  return injected;
};
