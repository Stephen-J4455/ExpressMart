import { useWindowDimensions } from "react-native";

/**
 * Breakpoints (CSS-style):
 *   mobile:  width < 768
 *   tablet:  768 <= width < 1024
 *   desktop: width >= 1024
 */
const BREAKPOINTS = { tablet: 768, desktop: 1024 };

export const useResponsive = () => {
  const { width, height } = useWindowDimensions();

  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isWide = width >= BREAKPOINTS.tablet; // tablet OR desktop

  // Product grid columns (2 / 4 / 5 based on screen size)
  const gridColumns = isDesktop ? 5 : isTablet ? 4 : 2;

  // Card grid columns for non-product cards (orders, addresses, etc.)
  const cardColumns = isDesktop ? 3 : isTablet ? 2 : 1;

  // Content max-width (centred on very wide screens)
  const contentMaxWidth = isDesktop ? 1200 : isTablet ? 900 : width;

  // Sidebar width for wide screens
  const sidebarWidth = isDesktop ? 260 : isTablet ? 220 : 0;

  // Horizontal padding that scales with screen
  const horizontalPadding = isDesktop ? 32 : isTablet ? 24 : 16;

  /**
   * Calculate the pixel width for a grid item so it never stretches.
   * Uses the full screen width — pass `containerWidth` for screens with a sidebar.
   * @param cols           number of columns
   * @param hPad           horizontal padding on each side (defaults to horizontalPadding)
   * @param gap            gap between items (default 8)
   * @param containerWidth override if the grid lives inside a narrower container
   */
  const getItemWidth = (
    cols,
    hPad = horizontalPadding,
    gap = 8,
    containerWidth = width,
  ) => Math.floor((containerWidth - hPad * 2 - gap * (cols - 1)) / cols);

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    gridColumns,
    cardColumns,
    getItemWidth,
    contentMaxWidth,
    sidebarWidth,
    horizontalPadding,
    breakpoints: BREAKPOINTS,
  };
};
