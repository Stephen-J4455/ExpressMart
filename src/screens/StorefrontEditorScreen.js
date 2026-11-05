import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";
import { callEdgeFunction, supabase } from "../lib/supabase";
import { generatePaymentReference } from "../services/payment";
import {
  R2_FOLDERS,
  deleteMediaByUrl,
  uploadToR2Presigned,
} from "../services/r2Storage";

const STOREFRONT_TEMPLATES = [
  {
    id: "chicwave",
    name: "ChicWave",
    description: "Warm, colorful, and welcoming",
    color: "#E85B55",
    background: "#FFF4EC",
  },
  {
    id: "fashionia",
    name: "FashioNia",
    description: "A bold, editorial boutique",
    color: "#5B4638",
    background: "#F4EEE7",
  },
  {
    id: "minimal",
    name: "Modern Minimal",
    description: "Clean lines and a calm palette",
    color: "#334155",
    background: "#F1F5F9",
  },
  {
    id: "botanical",
    name: "Botanical",
    description: "Natural greens and an organic feel",
    color: "#527A54",
    background: "#F3F7EF",
  },
  {
    id: "luxe",
    name: "Luxe",
    description: "Refined neutrals with boutique details",
    color: "#9A7848",
    background: "#F7F2E8",
  },
  {
    id: "clarity",
    name: "Clarity",
    description: "Airy editorial sections with a calm, focused feel",
    color: "#171717",
    background: "#F5F4F0",
  },
  {
    id: "studio-air",
    name: "Studio Air",
    description: "Monochrome product storytelling for statement collections",
    color: "#202020",
    background: "#E8E8E8",
  },
];

const STOREFRONT_COLORS = [
  "#E85B55",
  "#5B4638",
  "#334155",
  "#FF5A79",
  "#0F766E",
  "#2563EB",
  "#7C3AED",
  "#111827",
];

const STOREFRONT_LAYOUTS = [
  {
    id: "classic",
    name: "Classic",
    description: "Full-width image banner above a balanced product grid",
    requirement: "Needs: store name, description, and optional cover image",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-style image panel beside your store introduction",
    requirement: "Needs: store name, description, and optional cover image",
  },
  {
    id: "catalog",
    name: "Catalog",
    description:
      "Compact store introduction and a dense five-column product grid",
    requirement: "Needs: store name and products; cover image is optional",
  },
  {
    id: "split",
    name: "Split",
    description:
      "Store introduction on the left with your cover image on the right",
    requirement: "Needs: store name and description; cover image is optional",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    description:
      "Large featured product followed by the rest of your collection",
    requirement: "Needs: at least one product; cover image is optional",
  },
  {
    id: "immersive",
    name: "Immersive",
    description: "Full-bleed cover image with an overlay store introduction",
    requirement: "Needs: store name and description; cover image recommended",
  },
  {
    id: "gallery",
    name: "Gallery",
    description: "Visual three-panel landing area using one cover image and generated accents",
    requirement: "Needs: two cover images for the split gallery",
  },
  {
    id: "product-first",
    name: "Product First",
    description: "Featured product-led layout with a strong shopping focus",
    requirement: "Needs: at least one product; cover image is optional",
  },
  {
    id: "quiet",
    name: "Quiet",
    description: "Minimal typography, generous spacing, and an understated grid",
    requirement: "Needs: store name and description; no image required",
  },
  {
    id: "asymmetric",
    name: "Asymmetric",
    description: "Offset editorial composition with a less predictable rhythm",
    requirement: "Needs: store name and description; cover image is optional",
  },
];

const makeSlug = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const buildStyles = (c) => ({
  container: { flex: 1, backgroundColor: c.background },
  content: { paddingBottom: 36 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: c.surface,
  },
  headerTitle: { color: c.dark, fontSize: 18, fontWeight: "700" },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: c.primary,
  },
  saveButtonDisabled: { opacity: 0.55 },
  saveButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  intro: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 22 },
  title: {
    color: c.dark,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: { color: c.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { color: c.dark, fontSize: 17, fontWeight: "700" },
  sectionHint: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  templateList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  templateCardSelected: { borderWidth: 2, borderColor: c.primary },
  templateSwatch: {
    width: 44,
    height: 44,
    borderRadius: 9,
    padding: 7,
    justifyContent: "space-between",
    marginRight: 9,
  },
  templateSwatchBar: {
    height: 6,
    width: "60%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  templateSwatchPanel: {
    height: 17,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  templateName: { color: c.dark, fontSize: 14, fontWeight: "700" },
  templateDescription: { color: c.muted, fontSize: 11, marginTop: 3 },
  colorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: { borderColor: c.dark },
  layoutList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  layoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  layoutCardSelected: { borderWidth: 2, borderColor: c.primary },
  layoutName: { color: c.dark, fontSize: 13, fontWeight: "700" },
  layoutDescription: { color: c.muted, fontSize: 11, marginTop: 3 },
  layoutRequirement: {
    color: c.primary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  activationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  activationTitle: { color: c.dark, fontSize: 15, fontWeight: "700" },
  activationDescription: {
    color: c.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 260,
  },
  fieldLabel: {
    color: c.dark,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    color: c.dark,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 112, textAlignVertical: "top" },
  slugPrefix: { color: c.muted, fontSize: 14 },
  slugInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  slugInput: { flex: 1, color: c.dark, paddingVertical: 13, fontSize: 15 },
  storefrontUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  storefrontUrlText: {
    flex: 1,
    color: c.dark,
    fontSize: 13,
    fontWeight: "600",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  copyButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  coverPicker: {
    height: 190,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  coverImage: { width: "100%", height: "100%" },
  coverPlaceholder: { alignItems: "center", gap: 8 },
  coverPlaceholderText: { color: c.muted, fontSize: 14, fontWeight: "600" },
  coverAction: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  coverActionText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  preview: {
    flex: 1,
    minHeight: 0,
    maxHeight: "100%",
    marginBottom: 0,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  previewBrowserBar: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    backgroundColor: "#E7E5E4",
  },
  previewBrowserDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A8A29E",
  },
  previewSite: { paddingHorizontal: 12 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  previewBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  previewBrandIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBrandName: { fontSize: 11, fontWeight: "700", flexShrink: 1 },
  previewNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  previewNavText: {
    fontSize: 7,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  previewActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewActionText: { fontSize: 7, fontWeight: "600" },
  previewSearch: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.16)",
    borderRadius: 14,
    paddingHorizontal: 7,
    height: 24,
    marginVertical: 8,
  },
  previewSearchText: { color: "#78716C", fontSize: 8, flex: 1 },
  previewSearchButton: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewHero: {
    minHeight: 230,
    justifyContent: "flex-end",
    padding: 18,
    overflow: "hidden",
  },
  previewHeroText: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    minHeight: 205,
  },
  previewEyebrow: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  previewName: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 7,
  },
  previewDescription: { fontSize: 9, lineHeight: 14, marginTop: 7 },
  previewCta: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  previewCtaText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  previewHeroImage: { flex: 1, minHeight: 170, backgroundColor: "#E7E5E4" },
  previewTrust: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  previewTrustText: {
    fontSize: 6,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  previewCollection: { paddingTop: 16, paddingBottom: 18 },
  previewCollectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  previewCollectionLabel: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  previewCollectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 4 },
  previewCount: { color: "#78716C", fontSize: 8, paddingBottom: 2 },
  previewProductGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewProductCard: { width: "48%", flexGrow: 1, flexBasis: "40%" },
  previewProductImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  previewProductInitial: { fontSize: 22, fontWeight: "700", opacity: 0.35 },
  previewProductInfo: { paddingTop: 6 },
  previewProductLabel: { fontSize: 7, fontWeight: "600" },
  previewProductPrice: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  previewSiteScroll: { flex: 1 },
  previewSiteInner: { paddingHorizontal: 12, paddingBottom: 18 },
  previewFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    paddingVertical: 10,
    alignItems: "center",
  },
  previewFooterText: { fontSize: 7, color: "#78716C" },
  previewDeviceToggle: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  previewDeviceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
  },
  previewDeviceButtonSelected: { backgroundColor: c.primary },
  previewDeviceButtonText: { color: c.muted, fontSize: 12, fontWeight: "600" },
  previewDeviceButtonTextSelected: { color: "#fff" },
  largeLayout: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  previewColumn: {
    flex: 1,
    width: "46%",
    maxWidth: 640,
    minHeight: 0,
    maxHeight: "100%",
    overflow: "hidden",
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: "flex-start",
  },
  controlsColumn: { flex: 1, minWidth: 0, maxWidth: 640 },
  controlsContent: { flexGrow: 1, paddingBottom: 36 },
  previewColumnSection: {
    flex: 1,
    minHeight: 0,
    maxHeight: "100%",
    overflow: "hidden",
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorCard: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: c.surface,
  },
  errorText: {
    color: c.dark,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: c.primary,
  },
});

export const StorefrontEditorScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildStyles(c));
  const { isWide, isDesktop } = useResponsive();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverImage2, setCoverImage2] = useState("");
  const [coverFile2, setCoverFile2] = useState(null);
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialWhatsapp, setSocialWhatsapp] = useState("");
  const [socialWebsite, setSocialWebsite] = useState("");
  const [themeColor, setThemeColor] = useState(STOREFRONT_COLORS[0]);
  const [storefrontTheme, setStorefrontTheme] = useState("chicwave");
  const [storefrontLayout, setStorefrontLayout] = useState("classic");
  const [storefrontEnabled, setStorefrontEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enterpriseUpgradeFee, setEnterpriseUpgradeFee] = useState(null);
  const [processingUpgrade, setProcessingUpgrade] = useState(false);
  const processedPaymentReference = useRef("");
  const [previewViewport, setPreviewViewport] = useState("desktop");

  const cleanSlug = makeSlug(slug || name);
  const storefrontUrl = cleanSlug
    ? `https://store.tagitshop.online/store/${cleanSlug}`
    : "https://store.tagitshop.online/store/your-store";
  const [copiedUrl, setCopiedUrl] = useState(false);
  const copyStorefrontUrl = async () => {
    try {
      await Clipboard.setStringAsync(storefrontUrl);
      setCopiedUrl(true);
      toast.success("Storefront URL copied");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      toast.error("Could not copy link");
    }
  };

  const selectedTemplate = useMemo(
    () =>
      STOREFRONT_TEMPLATES.find((template) => template.id === storefrontTheme),
    [storefrontTheme],
  );
  const previewBackground =
    storefrontTheme === "chicwave"
      ? "#fff8f4"
      : storefrontTheme === "minimal"
        ? "#f8fafc"
        : selectedTemplate?.background || "#fff8f4";
  const previewForeground =
    storefrontTheme === "minimal"
      ? "#0F172A"
      : storefrontTheme === "fashionia"
        ? "#312820"
        : storefrontTheme === "botanical"
          ? "#243327"
          : storefrontTheme === "luxe"
            ? "#342B20"
            : storefrontTheme === "clarity" || storefrontTheme === "studio-air"
              ? "#202020"
            : "#292524";
  const previewSplitHero = storefrontLayout === "split";
  const previewEditorialHero = storefrontLayout === "editorial";
  const previewIsDesktop = previewViewport === "desktop";
  const previewIsWide = previewViewport !== "mobile";
  const validThemeColor = /^#[\da-f]{6}$/i.test(themeColor);

  const loadSeller = useCallback(async () => {
    if (!supabase || !user?.id) {
      setLoadError("Sign in with a seller account to customize a storefront.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("express_sellers")
        .select(
          "id,name,slug,avatar,cover_image,cover_image_2,store_description,theme_color,storefront_enabled,storefront_theme,storefront_layout,enterprise_enabled,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setLoadError("We couldn't find a store connected to this account.");
        return;
      }

      const { data: feeSetting, error: feeError } = await supabase
        .from("express_settings")
        .select("value")
        .eq("key", "enterprise_upgrade_fee")
        .maybeSingle();
      if (feeError) throw feeError;
      const configuredFee = Number(feeSetting?.value);
      if (!Number.isFinite(configuredFee) || configuredFee < 0) {
        throw new Error(
          "Enterprise upgrade pricing is not configured correctly.",
        );
      }
      setEnterpriseUpgradeFee(configuredFee);
      setSeller(data);
      setName(data.name || "");
      setSlug(data.slug || makeSlug(data.name));
      setDescription(data.store_description || "");
      setCoverImage(data.cover_image || "");
      setCoverImage2(data.cover_image_2 || "");
      setSocialFacebook(data.social_facebook || "");
      setSocialInstagram(data.social_instagram || "");
      setSocialTwitter(data.social_twitter || "");
      setSocialWhatsapp(data.social_whatsapp || "");
      setSocialWebsite(data.social_website || "");
      setThemeColor(data.theme_color || STOREFRONT_COLORS[0]);
      setStorefrontTheme(data.storefront_theme || "chicwave");
      setStorefrontLayout(data.storefront_layout || "classic");
      setStorefrontEnabled(data.storefront_enabled ?? false);
    } catch (error) {
      console.error("Failed to load storefront", error);
      setLoadError(error.message || "Could not load your storefront.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSeller();
  }, [loadSeller]);

  useEffect(() => {
    const reference = route?.params?.reference;
    if (
      route?.params?.payment !== "success" ||
      route?.params?.orderData?.type !== "enterprise_upgrade" ||
      !reference ||
      processedPaymentReference.current === reference
    ) {
      return;
    }

    processedPaymentReference.current = reference;
    const verifyUpgrade = async () => {
      setProcessingUpgrade(true);
      try {
        const result = await callEdgeFunction("payment", {
          action: "verify-enterprise-upgrade",
          reference,
        });
        if (!result?.success || !result.verified) {
          throw new Error("Payment could not be verified. Please try again.");
        }
        toast.success("Enterprise storefront access enabled");
        await loadSeller();
      } catch (error) {
        console.error("Enterprise upgrade verification failed", error);
        toast.error(error.message || "Could not verify the Enterprise payment");
      } finally {
        setProcessingUpgrade(false);
        navigation.setParams({
          payment: undefined,
          reference: undefined,
          orderData: undefined,
        });
      }
    };
    void verifyUpgrade();
  }, [route?.params, navigation, loadSeller, toast]);

  const startEnterpriseUpgrade = async () => {
    if (enterpriseUpgradeFee === null) return;
    setProcessingUpgrade(true);
    try {
      if (enterpriseUpgradeFee === 0) {
        const result = await callEdgeFunction("payment", {
          action: "activate-free-enterprise",
        });
        if (!result?.success || !result.activated) {
          throw new Error(
            result?.error || "Could not activate Enterprise access.",
          );
        }
        toast.success("Your free Enterprise upgrade is active");
        await loadSeller();
        return;
      }

      if (!user?.email) {
        throw new Error(
          "Your account needs an email address to make this payment.",
        );
      }
      const reference = generatePaymentReference(user.id);
      const init = await callEdgeFunction("payment", {
        action: "initialize-enterprise-upgrade",
        reference,
      });
      if (!init?.success || !init.data?.authorization_url) {
        throw new Error(
          init?.error || "Could not start the Enterprise upgrade",
        );
      }
      const paymentAmount = Number(init.data.amount_ghs);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new Error(
          "The Enterprise upgrade amount is invalid. Please try again.",
        );
      }
      navigation.navigate("PaymentWebView", {
        authorization_url: init.data.authorization_url,
        access_code: init.data.access_code,
        paystack_public_key: init.data.paystack_public_key || null,
        amount: paymentAmount,
        email: user.email,
        reference,
        orderData: { type: "enterprise_upgrade" },
        returnTo: "StorefrontEditor",
      });
    } catch (error) {
      console.error("Enterprise upgrade initialization failed", error);
      toast.error(error.message || "Could not start the Enterprise upgrade");
    } finally {
      setProcessingUpgrade(false);
    }
  };

  const pickCoverImage = async (second = false) => {
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          toast.error("Gallery permission is required");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (second) {
        setCoverImage2(asset.uri);
        setCoverFile2(asset.file instanceof Blob ? asset.file : null);
      } else {
        setCoverImage(asset.uri);
        setCoverFile(asset.file instanceof Blob ? asset.file : null);
      }
    } catch (error) {
      console.error("Storefront cover selection failed", error);
      toast.error(error.message || "Could not open image picker");
    }
  };

  const saveStorefront = async () => {
    const cleanName = name.trim();
    const cleanSlug = makeSlug(slug || cleanName);
    if (!cleanName) {
      toast.error("Store name is required");
      return;
    }
    if (!cleanSlug) {
      toast.error("Add a valid storefront URL");
      return;
    }
    if (!validThemeColor) {
      toast.error("Enter a valid hex accent color, such as #E85B55");
      return;
    }
    if (storefrontLayout === "gallery" && (!coverImage || !coverImage2)) {
      toast.error("Gallery layout requires two cover images");
      return;
    }
    if (!seller || !supabase) {
      toast.error("Your storefront could not be loaded");
      return;
    }

    setSaving(true);
    try {
      let coverUrl = coverImage || null;
      let coverUrl2 = coverImage2 || null;
      if (coverImage && !/^https?:\/\//i.test(coverImage)) {
        const fileNamePart =
          coverImage.split("?")[0].split("/").pop() || "cover.jpg";
        const extension = fileNamePart.includes(".")
          ? fileNamePart.split(".").pop().toLowerCase()
          : "jpg";
        const { publicUrl } = await uploadToR2Presigned({
          uri: coverImage,
          pickedFile: coverFile,
          folder: `${R2_FOLDERS.PROFILE}/${seller.id}`,
          fileName: `storefront-cover-${Date.now()}.${extension}`,
        });
        coverUrl = publicUrl;
      }
      if (coverImage2 && !/^https?:\/\//i.test(coverImage2)) {
        const fileNamePart =
          coverImage2.split("?")[0].split("/").pop() || "cover-2.jpg";
        const extension = fileNamePart.includes(".")
          ? fileNamePart.split(".").pop().toLowerCase()
          : "jpg";
        const { publicUrl } = await uploadToR2Presigned({
          uri: coverImage2,
          pickedFile: coverFile2,
          folder: `${R2_FOLDERS.PROFILE}/${seller.id}`,
          fileName: `storefront-cover-2-${Date.now()}.${extension}`,
        });
        coverUrl2 = publicUrl;
      }

      const updates = {
        name: cleanName,
        slug: cleanSlug,
        store_description: description.trim() || null,
        cover_image: coverUrl,
        cover_image_2: coverUrl2,
        social_facebook: socialFacebook.trim() || null,
        social_instagram: socialInstagram.trim() || null,
        social_twitter: socialTwitter.trim() || null,
        social_whatsapp: socialWhatsapp.trim() || null,
        social_website: socialWebsite.trim() || null,
        theme_color: themeColor,
        storefront_theme: storefrontTheme,
        storefront_layout: storefrontLayout,
        storefront_color_mode: "system",
        storefront_enabled: storefrontEnabled,
        theme_apply_customer: true,
      };
      const { error } = await supabase
        .from("express_sellers")
        .update(updates)
        .eq("id", seller.id);
      if (error) throw error;

      if (
        seller.cover_image &&
        seller.cover_image !== coverUrl &&
        /^https?:\/\//i.test(seller.cover_image)
      ) {
        await deleteMediaByUrl(seller.cover_image).catch((error) =>
          console.warn("Could not remove previous storefront cover", error),
        );
      }

      setSeller((current) => ({ ...current, ...updates }));
      setSlug(cleanSlug);
      setCoverImage(coverUrl || "");
      setCoverImage2(coverUrl2 || "");
      setCoverFile(null);
      setCoverFile2(null);
      toast.success("Storefront saved");
    } catch (error) {
      console.error("Failed to save storefront", error);
      if (error?.code === "23514" && error?.message?.includes("storefront_layout")) {
        toast.error(
          "Your database needs the latest storefront layout migration before this layout can be saved.",
        );
      } else {
        toast.error(error.message || "Could not save your storefront");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStorefront = async (enabled) => {
    if (!seller || !supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("express_sellers")
        .update({ storefront_enabled: enabled })
        .eq("id", seller.id);
      if (error) throw error;
      setStorefrontEnabled(enabled);
      setSeller((current) => ({ ...current, storefront_enabled: enabled }));
      toast.success(
        enabled ? "Storefront activated" : "Storefront deactivated",
      );
    } catch (error) {
      console.error("Failed to update storefront status", error);
      toast.error(error.message || "Could not update storefront status");
    } finally {
      setSaving(false);
    }
  };

  const pageWidthStyle = null;

  if (loading) {
    return (
      <View
        style={[styles.container, styles.loading, { paddingTop: insets.top }]}
      >
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (!seller) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={21} color={themeColors.dark} />
          </Pressable>
          <Text style={styles.headerTitle}>Storefront</Text>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={loadSeller}>
            <Text style={styles.saveButtonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!seller.enterprise_enabled) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={21} color={themeColors.dark} />
          </Pressable>
          <Text style={styles.headerTitle}>Storefront</Text>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.errorCard}>
          <Ionicons
            name="storefront-outline"
            size={42}
            color={themeColors.primary}
          />
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            Unlock your Enterprise storefront
          </Text>
          <Text
            style={[styles.sectionHint, { textAlign: "center", marginTop: 8 }]}
          >
            Enterprise unlocks the tools to build and grow your branded online
            shop.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: 18, gap: 12 }}>
            {[
              "Publish a public storefront with its own shareable store link",
              "Choose from a growing collection of storefront themes and page layouts",
              "Customize your store details, cover image, and brand color",
              "Let customers browse products and shop your collection",
              "Display the Enterprise badge on your seller profile and store",
            ].map((benefit) => (
              <View
                key={benefit}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 9,
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={themeColors.primary}
                />
                <Text style={[styles.sectionHint, { flex: 1 }]}>{benefit}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            {enterpriseUpgradeFee === null
              ? "Loading upgrade options…"
              : enterpriseUpgradeFee === 0
                ? "Free Enterprise upgrade"
                : `GH₵${enterpriseUpgradeFee.toLocaleString()} one-time`}
          </Text>
          {processingUpgrade ? (
            <ActivityIndicator
              style={{ marginTop: 18 }}
              size="small"
              color={themeColors.primary}
            />
          ) : enterpriseUpgradeFee !== null ? (
            <Pressable
              style={[styles.saveButton, { marginTop: 18 }]}
              onPress={startEnterpriseUpgrade}
            >
              <Text style={styles.saveButtonText}>
                {enterpriseUpgradeFee === 0
                  ? "Activate Enterprise for free"
                  : "Upgrade with Paystack"}
              </Text>
            </Pressable>
          ) : (
            <Text
              style={[
                styles.sectionHint,
                { textAlign: "center", marginTop: 8 },
              ]}
            >
              We could not load upgrade pricing. Try again shortly.
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={21} color={themeColors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Storefront</Text>
        <Pressable
          onPress={saveStorefront}
          disabled={saving}
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      {isDesktop ? (
        <View style={styles.largeLayout}>
          <View style={styles.previewColumn}>
            <View style={styles.intro}>
              <Text style={styles.title}>Create your storefront</Text>
              <Text style={styles.subtitle}>
                Choose a look, add your store details, and make your shop feel
                like yours.
              </Text>
            </View>

            <View style={styles.previewColumnSection}>
              <Text style={styles.sectionTitle}>Live storefront preview</Text>
              <Text style={styles.sectionHint}>
                See the selected template and layout with sample products and
                your current store details.
              </Text>
              <View
                style={styles.previewDeviceToggle}
                accessibilityRole="tablist"
              >
                {[
                  {
                    id: "mobile",
                    label: "Mobile",
                    icon: "phone-portrait-outline",
                  },
                  {
                    id: "tablet",
                    label: "Tablet",
                    icon: "tablet-portrait-outline",
                  },
                  { id: "desktop", label: "Desktop", icon: "desktop-outline" },
                ].map((device) => {
                  const selected = previewViewport === device.id;
                  return (
                    <Pressable
                      key={device.id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => setPreviewViewport(device.id)}
                      style={[
                        styles.previewDeviceButton,
                        selected && styles.previewDeviceButtonSelected,
                      ]}
                    >
                      <Ionicons
                        name={device.icon}
                        size={14}
                        color={selected ? "#fff" : themeColors.muted}
                      />
                      <Text
                        style={[
                          styles.previewDeviceButtonText,
                          selected && styles.previewDeviceButtonTextSelected,
                        ]}
                      >
                        {device.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={[styles.preview, { backgroundColor: previewBackground }]}
              >
                <View style={styles.previewBrowserBar}>
                  <View style={styles.previewBrowserDot} />
                  <View style={styles.previewBrowserDot} />
                  <View style={styles.previewBrowserDot} />
                </View>
                <View style={styles.previewSite}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewBrand}>
                      {seller.avatar ? (
                        <Image
                          source={{ uri: seller.avatar }}
                          style={styles.previewBrandIcon}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.previewBrandIcon,
                            { backgroundColor: themeColor },
                          ]}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            {(name || "S").slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewBrandName,
                          {
                            color: previewForeground,
                            fontFamily:
                              storefrontTheme === "fashionia" ||
                              storefrontTheme === "luxe"
                                ? "Georgia"
                                : undefined,
                          },
                        ]}
                      >
                        {name || "Your store"}
                      </Text>
                    </View>
                    {previewIsWide ? (
                      <View style={styles.previewNav}>
                        <Text
                          style={[
                            styles.previewNavText,
                            { color: previewForeground },
                          ]}
                        >
                          Home
                        </Text>
                        <Text
                          style={[
                            styles.previewNavText,
                            { color: previewForeground },
                          ]}
                        >
                          Shop
                        </Text>
                        <Text
                          style={[
                            styles.previewNavText,
                            { color: previewForeground },
                          ]}
                        >
                          About
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.previewActions}>
                      <Ionicons
                        name="bag-outline"
                        size={12}
                        color={previewForeground}
                      />
                      <Text
                        style={[
                          styles.previewActionText,
                          { color: previewForeground },
                        ]}
                      >
                        Cart
                      </Text>
                      <Text
                        style={[
                          styles.previewActionText,
                          { color: previewForeground },
                        ]}
                      >
                        Sign in
                      </Text>
                      {previewIsWide ? (
                        <View
                          style={[
                            styles.previewSearchButton,
                            { backgroundColor: themeColor },
                          ]}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 7,
                              fontWeight: "700",
                            }}
                          >
                            Sign up
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.previewSearch}>
                    <Text style={styles.previewSearchText}>
                      Search {name || "this store"}
                    </Text>
                    <View
                      style={[
                        styles.previewSearchButton,
                        { backgroundColor: themeColor },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 7,
                          fontWeight: "700",
                        }}
                      >
                        Search
                      </Text>
                    </View>
                  </View>

                  {storefrontLayout === "gallery" ? (
                    <View style={{ flexDirection: previewIsWide ? "row" : "column", minHeight: previewIsWide ? 250 : undefined, gap: 2 }}>
                      <View style={[styles.previewHeroImage, { flex: 1, minHeight: 150, backgroundColor: `${themeColor}35` }]} />
                      <View style={{ flex: 1, minHeight: 150, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: previewBackground }}>
                        <Text style={[styles.previewEyebrow, { color: previewForeground }]}>THE COLLECTION</Text>
                        <Text numberOfLines={1} style={[styles.previewName, { color: previewForeground }]}>{name || "Your store name"}</Text>
                        <View style={[styles.previewCta, { backgroundColor: themeColor, marginTop: 8 }]}><Text style={styles.previewCtaText}>Browse →</Text></View>
                      </View>
                      {previewIsWide ? <View style={[styles.previewHeroImage, { flex: 1, minHeight: 250, backgroundColor: `${themeColor}20` }]} /> : null}
                    </View>
                  ) : storefrontLayout === "immersive" ? (
                    <View style={[styles.previewHero, { minHeight: 270, backgroundColor: themeColor, justifyContent: "flex-end", padding: 18 }]}>
                      {coverImage ? <Image source={{ uri: coverImage }} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", opacity: 0.62 }} resizeMode="cover" /> : null}
                      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.42)" }} />
                      <Text style={styles.previewEyebrow}>WELCOME TO THE STORE</Text>
                      <Text numberOfLines={2} style={styles.previewName}>{name || "Your store name"}</Text>
                      <View style={[styles.previewCta, { backgroundColor: "#fff", borderRadius: 18 }]}><Text style={{ color: "#222", fontSize: 8, fontWeight: "700" }}>Shop collection →</Text></View>
                    </View>
                  ) : storefrontLayout === "product-first" ? (
                    <View style={{ flexDirection: previewIsWide ? "row-reverse" : "column", minHeight: previewIsWide ? 250 : undefined, backgroundColor: previewBackground }}>
                      <View style={[styles.previewHeroImage, previewIsWide ? { flex: 1.35, minHeight: 250 } : { height: 150 }, { backgroundColor: `${themeColor}22` }]}>
                        <Text style={[styles.previewProductInitial, { color: themeColor }]}>P</Text>
                      </View>
                      <View style={[styles.previewHeroText, { flex: previewIsWide ? 0.65 : undefined }]}>
                        <Text style={[styles.previewEyebrow, { color: themeColor }]}>FEATURED NOW</Text>
                        <Text numberOfLines={2} style={[styles.previewName, { color: previewForeground }]}>Featured product</Text>
                        <View style={[styles.previewCta, { backgroundColor: themeColor }]}><Text style={styles.previewCtaText}>Shop now →</Text></View>
                      </View>
                    </View>
                  ) : storefrontLayout === "quiet" ? (
                    <View style={{ minHeight: 220, padding: 22, justifyContent: "center", backgroundColor: previewBackground, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(0,0,0,0.14)" }}>
                      <Text style={[styles.previewEyebrow, { color: previewForeground, opacity: 0.55 }]}>A QUIET COLLECTION</Text>
                      <Text numberOfLines={2} style={[styles.previewName, { color: previewForeground, fontSize: 28 }]}>{name || "Your store name"}</Text>
                      <Text numberOfLines={2} style={[styles.previewDescription, { color: previewForeground }]}>View the collection →</Text>
                    </View>
                  ) : storefrontLayout === "asymmetric" ? (
                    <View style={{ flexDirection: previewIsWide ? "row" : "column", minHeight: previewIsWide ? 250 : undefined, backgroundColor: previewBackground }}>
                      <View style={[styles.previewHeroImage, previewIsWide ? { flex: 1.4, minHeight: 250 } : { height: 150 }, { backgroundColor: `${themeColor}35` }]} />
                      <View style={[styles.previewHeroText, { flex: previewIsWide ? 0.8 : undefined, justifyContent: "flex-end" }]}>
                        <Text style={[styles.previewEyebrow, { color: themeColor }]}>NEW PERSPECTIVE</Text>
                        <Text numberOfLines={2} style={[styles.previewName, { color: previewForeground }]}>{name || "Your store name"}</Text>
                        <Text style={[styles.previewDescription, { color: previewForeground }]}>Explore →</Text>
                      </View>
                    </View>
                  ) : storefrontLayout === "catalog" ? (
                    <View
                      style={{
                        minHeight: 125,
                        padding: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: previewBackground,
                        overflow: "hidden",
                      }}
                    >
                      {coverImage ? (
                        <Image
                          source={{ uri: coverImage }}
                          style={{
                            position: "absolute",
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0.16,
                          }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.previewEyebrow,
                          { color: previewForeground, opacity: 0.65 },
                        ]}
                      >
                        BROWSE THE STORE
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewName,
                          {
                            color: previewForeground,
                            fontFamily:
                              storefrontTheme === "fashionia" ||
                              storefrontTheme === "luxe"
                                ? "Georgia"
                                : undefined,
                            marginTop: 4,
                          },
                        ]}
                      >
                        {name || "Your store name"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewDescription,
                          { color: previewForeground, opacity: 0.72 },
                        ]}
                      >
                        {description ||
                          "Your store description will appear here."}
                      </Text>
                      <View
                        style={[
                          styles.previewCta,
                          { backgroundColor: themeColor, paddingVertical: 5 },
                        ]}
                      >
                        <Text style={styles.previewCtaText}>
                          Browse all products →
                        </Text>
                      </View>
                    </View>
                  ) : previewSplitHero || previewEditorialHero ? (
                    <View
                      style={{
                        flexDirection: previewIsWide
                          ? previewEditorialHero
                            ? "row-reverse"
                            : "row"
                          : previewEditorialHero
                            ? "column-reverse"
                            : "column",
                        backgroundColor: previewBackground,
                        minHeight: previewIsWide
                          ? previewEditorialHero
                            ? 260
                            : 220
                          : undefined,
                      }}
                    >
                      <View
                        style={[
                          styles.previewHeroText,
                          {
                            flex: previewIsWide ? 1 : undefined,
                            alignItems:
                              storefrontTheme === "fashionia"
                                ? "flex-start"
                                : undefined,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewEyebrow,
                            { color: previewForeground, opacity: 0.65 },
                          ]}
                        >
                          {previewEditorialHero
                            ? "THE NEW COLLECTION"
                            : storefrontTheme === "fashionia"
                              ? "THE NEW COLLECTION"
                              : storefrontTheme === "minimal"
                                ? "THOUGHTFULLY SELECTED"
                                : `DISCOVER ${name || "OUR STORE"}`}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.previewName,
                            {
                              color: previewForeground,
                              fontFamily:
                                storefrontTheme === "fashionia" ||
                                storefrontTheme === "luxe"
                                  ? "Georgia"
                                  : undefined,
                              textTransform:
                                storefrontTheme === "fashionia"
                                  ? "uppercase"
                                  : "none",
                            },
                          ]}
                        >
                          {name || "Your store name"}
                        </Text>
                        <Text
                          numberOfLines={3}
                          style={[
                            styles.previewDescription,
                            { color: previewForeground, opacity: 0.72 },
                          ]}
                        >
                          {description ||
                            "Your store description will appear here."}
                        </Text>
                        <View
                          style={[
                            styles.previewCta,
                            {
                              backgroundColor:
                                storefrontTheme === "fashionia"
                                  ? "transparent"
                                  : themeColor,
                              borderWidth:
                                storefrontTheme === "fashionia" ? 1 : 0,
                              borderColor: previewForeground,
                              borderRadius:
                                storefrontTheme === "minimal" ? 4 : 16,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color:
                                storefrontTheme === "fashionia"
                                  ? previewForeground
                                  : "#fff",
                              fontSize: 8,
                              fontWeight: "700",
                            }}
                          >
                            Browse collection →
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.previewHeroImage,
                          previewIsWide
                            ? {
                                minHeight: previewEditorialHero ? 260 : 220,
                                flex: previewEditorialHero ? 1.25 : 1,
                              }
                            : { height: 150, flex: undefined },
                          !coverImage && { backgroundColor: `${themeColor}30` },
                        ]}
                      >
                        {coverImage ? (
                          <Image
                            source={{ uri: coverImage }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.previewHero,
                        {
                          minHeight:
                            storefrontLayout === "spotlight" ? 190 : 230,
                          backgroundColor: themeColor,
                          justifyContent: "flex-end",
                        },
                      ]}
                    >
                      {coverImage ? (
                        <Image
                          source={{ uri: coverImage }}
                          style={{
                            position: "absolute",
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0.6,
                          }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bottom: 0,
                          left: 0,
                          backgroundColor: "rgba(0,0,0,0.38)",
                        }}
                      />
                      <Text style={styles.previewEyebrow}>
                        {(seller.location || "INDEPENDENT STORE").toUpperCase()}
                      </Text>
                      <Text numberOfLines={2} style={styles.previewName}>
                        {name || "Your store name"}
                      </Text>
                      <Text numberOfLines={3} style={styles.previewDescription}>
                        {description ||
                          "Your store description will appear here."}
                      </Text>
                      <View
                        style={[
                          styles.previewCta,
                          { backgroundColor: "#fff", borderRadius: 18 },
                        ]}
                      >
                        <Text
                          style={{
                            color: "#292524",
                            fontSize: 8,
                            fontWeight: "700",
                          }}
                        >
                          {storefrontLayout === "spotlight"
                            ? "Discover the featured piece  →"
                            : "Shop the collection  →"}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.previewTrust}>
                    <Text
                      style={[
                        styles.previewTrustText,
                        { color: previewForeground },
                      ]}
                    >
                      ✦ Curated for you
                    </Text>
                    <Text
                      style={[
                        styles.previewTrustText,
                        { color: previewForeground },
                      ]}
                    >
                      Shop independent
                    </Text>
                    <Text
                      style={[
                        styles.previewTrustText,
                        { color: previewForeground },
                      ]}
                    >
                      5 products
                    </Text>
                  </View>

                  <View style={styles.previewCollection}>
                    <View style={styles.previewCollectionHeader}>
                      <View>
                        <Text
                          style={[
                            styles.previewCollectionLabel,
                            { color: themeColor },
                          ]}
                        >
                          {storefrontTheme === "fashionia"
                            ? "SELECTED PIECES"
                            : "THE COLLECTION"}
                        </Text>
                        <Text
                          style={[
                            styles.previewCollectionTitle,
                            {
                              color: previewForeground,
                              fontFamily:
                                storefrontTheme === "fashionia" ||
                                storefrontTheme === "luxe"
                                  ? "Georgia"
                                  : undefined,
                            },
                          ]}
                        >
                          {storefrontLayout === "catalog"
                            ? "Browse all products"
                            : `Shop ${name || "our store"}`}
                        </Text>
                      </View>
                      <Text style={styles.previewCount}>5 items</Text>
                    </View>
                    <View style={styles.previewProductGrid}>
                      {storefrontLayout === "spotlight" ? (
                        <View
                          key="spotlight-preview"
                          style={{
                            flexDirection: previewIsWide ? "row" : "column",
                            width: "100%",
                            marginBottom: 8,
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: "rgba(0,0,0,0.1)",
                            backgroundColor: "rgba(255,255,255,0.35)",
                          }}
                        >
                          <View
                            style={[
                              styles.previewProductImage,
                              {
                                height: previewIsWide ? 132 : 145,
                                flex: previewIsWide ? 1 : undefined,
                                borderRadius: 0,
                                backgroundColor: `${themeColor}18`,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.previewProductInitial,
                                { color: themeColor, fontSize: 34 },
                              ]}
                            >
                              {(name || "S").slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View
                            style={{
                              flex: 1,
                              justifyContent: "center",
                              alignItems: "flex-start",
                              padding: 14,
                            }}
                          >
                            <Text
                              style={[
                                styles.previewCollectionLabel,
                                { color: themeColor },
                              ]}
                            >
                              FEATURED PIECE
                            </Text>
                            <Text
                              style={[
                                styles.previewCollectionTitle,
                                {
                                  color: previewForeground,
                                  marginTop: 4,
                                  fontSize: 13,
                                },
                              ]}
                            >
                              Featured product
                            </Text>
                            <Text
                              style={[
                                styles.previewProductPrice,
                                { color: themeColor, marginTop: 4 },
                              ]}
                            >
                              Product price
                            </Text>
                            <View
                              style={[
                                styles.previewCta,
                                {
                                  backgroundColor: themeColor,
                                  marginTop: 8,
                                  paddingVertical: 5,
                                },
                              ]}
                            >
                              <Text style={styles.previewCtaText}>
                                View product →
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : null}
                      {[
                        "Featured product",
                        "New arrival",
                        "Everyday essential",
                        "Bestseller",
                        "Just added",
                      ]
                        .filter(
                          (_, index) =>
                            storefrontLayout !== "spotlight" || index > 0,
                        )
                        .map((productName, index) => {
                          const cardWidth = previewIsDesktop
                            ? storefrontLayout === "catalog"
                              ? "18%"
                              : storefrontLayout === "editorial"
                                ? "31%"
                                : "23%"
                            : previewViewport === "tablet"
                              ? storefrontLayout === "editorial"
                                ? "48%"
                                : "31%"
                              : "48%";
                          return (
                            <View
                              key={productName}
                              style={[
                                styles.previewProductCard,
                                {
                                  width: cardWidth,
                                  flexBasis: cardWidth,
                                  flexGrow: 0,
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.previewProductImage,
                                  {
                                    aspectRatio:
                                      storefrontLayout === "catalog" ? 0.88 : 1,
                                    borderRadius:
                                      storefrontTheme === "fashionia"
                                        ? 0
                                        : storefrontLayout === "catalog"
                                          ? 6
                                          : 10,
                                    backgroundColor: `${themeColor}18`,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.previewProductInitial,
                                    { color: themeColor },
                                  ]}
                                >
                                  {(name || "S").slice(0, 1).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.previewProductInfo}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.previewProductLabel,
                                    { color: previewForeground },
                                  ]}
                                >
                                  {productName}
                                </Text>
                                <Text
                                  style={[
                                    styles.previewProductPrice,
                                    { color: themeColor },
                                  ]}
                                >
                                  Product price
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                  <View style={styles.previewFooter}>
                    <Text style={styles.previewFooterText}>
                      © {name || "Your store"} Terms Privacy Visit{" "}
                      {name || "store"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={[styles.controlsContent, pageWidthStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, minHeight: 0 }}
          >
            <View style={styles.section}>
              <View style={styles.activationCard}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.activationTitle}>
                    {storefrontEnabled
                      ? "Storefront is active"
                      : "Storefront is inactive"}
                  </Text>
                  <Text style={styles.activationDescription}>
                    {storefrontEnabled
                      ? "Shoppers can visit your public store page."
                      : "Your public store page is hidden from shoppers."}
                  </Text>
                </View>
                <Switch
                  value={storefrontEnabled}
                  onValueChange={toggleStorefront}
                  disabled={saving}
                  trackColor={{
                    false: themeColors.border,
                    true: themeColors.primary,
                  }}
                  thumbColor="#fff"
                  accessibilityLabel="Activate storefront"
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose a template</Text>
              <Text style={styles.sectionHint}>
                Pick a visual style for your public store. Choose its accent
                color separately below.
              </Text>
              <View style={styles.templateList}>
                {STOREFRONT_TEMPLATES.map((template) => {
                  const isSelected = template.id === storefrontTheme;
                  return (
                    <Pressable
                      key={template.name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setStorefrontTheme(template.id)}
                      style={[
                        styles.templateCard,
                        isWide
                          ? { width: "48%", flexGrow: 1 }
                          : { width: "100%" },
                        isSelected && styles.templateCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.templateSwatch,
                          { backgroundColor: template.color },
                        ]}
                      >
                        <View style={styles.templateSwatchBar} />
                        <View
                          style={[
                            styles.templateSwatchPanel,
                            { backgroundColor: template.background },
                          ]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateName}>{template.name}</Text>
                        <Text style={styles.templateDescription}>
                          {template.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={themeColors.primary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Primary color</Text>
              <Text style={styles.sectionHint}>
                Used for buttons, links, badges, and highlights. Pick a swatch
                or enter a custom hex color.
              </Text>
              <View style={styles.colorOptions}>
                {STOREFRONT_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${color} accent color`}
                    accessibilityState={{ selected: themeColor === color }}
                    onPress={() => setThemeColor(color)}
                    style={[
                      styles.colorOption,
                      themeColor === color && styles.colorOptionSelected,
                    ]}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: color,
                      }}
                    />
                  </Pressable>
                ))}
              </View>
              {Platform.OS === "web" ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  <Text style={styles.fieldLabel}>Custom picker</Text>
                  <input
                    aria-label="Choose primary color"
                    type="color"
                    value={
                      /^#[\da-f]{6}$/i.test(themeColor)
                        ? themeColor
                        : "#E85B55"
                    }
                    onChange={(event) => setThemeColor(event.target.value.toUpperCase())}
                    style={{
                      width: 44,
                      height: 34,
                      padding: 2,
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: 8,
                      backgroundColor: "transparent",
                      cursor: "pointer",
                    }}
                  />
                </View>
              ) : null}
              <TextInput
                value={themeColor}
                onChangeText={(value) => setThemeColor(value.trim())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                placeholder="#E85B55"
                placeholderTextColor={themeColors.muted}
                accessibilityLabel="Primary color hex value"
                style={[styles.input, { marginTop: 12 }]}
              />
              <Text style={styles.fieldLabel}>Store layout</Text>
              <View style={styles.layoutList}>
                {STOREFRONT_LAYOUTS.map((layout) => {
                  const isSelected = storefrontLayout === layout.id;
                  return (
                    <Pressable
                      key={layout.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setStorefrontLayout(layout.id)}
                      style={[
                        styles.layoutCard,
                        isWide
                          ? { width: "48%", flexGrow: 1 }
                          : { width: "100%" },
                        isSelected && styles.layoutCardSelected,
                      ]}
                    >
                      <View>
                        <Text style={styles.layoutName}>{layout.name}</Text>
                        <Text style={styles.layoutDescription}>
                          {layout.description}
                        </Text>
                        <Text style={styles.layoutRequirement}>
                          {layout.requirement}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={themeColors.primary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Store details</Text>
              <Text style={styles.fieldLabel}>Store name</Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (!slugTouched) setSlug(makeSlug(value));
                }}
                placeholder="Your store name"
                placeholderTextColor={themeColors.muted}
                style={styles.input}
                maxLength={80}
              />

              <Text style={styles.fieldLabel}>Storefront URL</Text>
              <View style={styles.slugInputRow}>
                <Text style={styles.slugPrefix}>/store/</Text>
                <TextInput
                  value={slug}
                  onChangeText={(value) => {
                    setSlugTouched(true);
                    setSlug(makeSlug(value));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="your-store"
                  placeholderTextColor={themeColors.muted}
                  style={styles.slugInput}
                  maxLength={80}
                />
              </View>
              <View style={styles.storefrontUrlRow}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  style={styles.storefrontUrlText}
                >
                  {storefrontUrl}
                </Text>
                <Pressable
                  onPress={copyStorefrontUrl}
                  accessibilityRole="button"
                  accessibilityLabel="Copy storefront URL"
                  style={styles.copyButton}
                >
                  <Ionicons
                    name={copiedUrl ? "checkmark" : "copy-outline"}
                    size={15}
                    color="#fff"
                  />
                  <Text style={styles.copyButtonText}>
                    {copiedUrl ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>About your store</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Tell shoppers what makes your store special"
                placeholderTextColor={themeColors.muted}
                style={[styles.input, styles.inputMultiline]}
                multiline
                maxLength={500}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Store cover</Text>
              <Text style={styles.sectionHint}>
                Add a wide image to introduce your products and brand.
              </Text>
              <Pressable onPress={pickCoverImage} style={styles.coverPicker}>
                {coverImage ? (
                  <Image
                    source={{ uri: coverImage }}
                    style={styles.coverImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Ionicons
                      name="image-outline"
                      size={30}
                      color={themeColors.muted}
                    />
                    <Text style={styles.coverPlaceholderText}>
                      Add a cover image
                    </Text>
                  </View>
                )}
                <View style={styles.coverAction}>
                  <Ionicons name="camera-outline" size={17} color="#fff" />
                  <Text style={styles.coverActionText}>
                    {coverImage ? "Change cover" : "Choose image"}
                  </Text>
                </View>
              </Pressable>
              {coverImage ? (
                <Pressable
                  onPress={() => {
                    setCoverImage("");
                    setCoverFile(null);
                  }}
                  style={{ alignSelf: "flex-end", paddingTop: 9 }}
                >
                  <Text style={{ color: themeColors.muted, fontSize: 13 }}>
                    Remove cover
                  </Text>
                </Pressable>
              ) : null}
              {storefrontLayout === "gallery" ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                    Gallery second cover
                  </Text>
                  <Text style={styles.sectionHint}>
                    Gallery uses two cover images. Add a second image for the
                    right-hand panel.
                  </Text>
                  <Pressable
                    onPress={() => pickCoverImage(true)}
                    style={styles.coverPicker}
                  >
                    {coverImage2 ? (
                      <Image
                        source={{ uri: coverImage2 }}
                        style={styles.coverImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <Ionicons
                          name="images-outline"
                          size={30}
                          color={themeColors.muted}
                        />
                        <Text style={styles.coverPlaceholderText}>
                          Add second cover image
                        </Text>
                      </View>
                    )}
                    <View style={styles.coverAction}>
                      <Ionicons name="camera-outline" size={17} color="#fff" />
                      <Text style={styles.coverActionText}>
                        {coverImage2 ? "Change second cover" : "Choose image"}
                      </Text>
                    </View>
                  </Pressable>
                </>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Social handles</Text>
              <Text style={styles.sectionHint}>
                Add full public URLs. They will appear in your storefront footer.
              </Text>
              {[
                ["Facebook", socialFacebook, setSocialFacebook, "https://facebook.com/your-store", "logo-facebook", "#1877F2"],
                ["Instagram", socialInstagram, setSocialInstagram, "https://instagram.com/your-store", "logo-instagram", "#E4405F"],
                ["Twitter / X", socialTwitter, setSocialTwitter, "https://x.com/your-store", "logo-twitter", "#1DA1F2"],
                ["WhatsApp", socialWhatsapp, setSocialWhatsapp, "https://wa.me/233...", "logo-whatsapp", "#25D366"],
                ["Website", socialWebsite, setSocialWebsite, "https://your-store.com", "globe-outline", themeColors.primary],
              ].map(([label, value, setter, placeholder, icon, color]) => (
                <View key={label} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Ionicons name={icon} size={18} color={color} />
                    <Text style={styles.fieldLabel}>{label}</Text>
                  </View>
                  <TextInput
                    value={value}
                    onChangeText={setter}
                    placeholder={placeholder}
                    placeholderTextColor={themeColors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    accessibilityLabel={`${label} URL`}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, pageWidthStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.title}>Create your storefront</Text>
            <Text style={styles.subtitle}>
              Choose a look, add your store details, and make your shop feel
              like yours.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live storefront preview</Text>
            <Text style={styles.sectionHint}>
              See the selected template and layout with sample products and your
              current store details.
            </Text>
            <View
              style={styles.previewDeviceToggle}
              accessibilityRole="tablist"
            >
              {[
                {
                  id: "mobile",
                  label: "Mobile",
                  icon: "phone-portrait-outline",
                },
                {
                  id: "tablet",
                  label: "Tablet",
                  icon: "tablet-portrait-outline",
                },
                { id: "desktop", label: "Desktop", icon: "desktop-outline" },
              ].map((device) => {
                const selected = previewViewport === device.id;
                return (
                  <Pressable
                    key={device.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setPreviewViewport(device.id)}
                    style={[
                      styles.previewDeviceButton,
                      selected && styles.previewDeviceButtonSelected,
                    ]}
                  >
                    <Ionicons
                      name={device.icon}
                      size={14}
                      color={selected ? "#fff" : themeColors.muted}
                    />
                    <Text
                      style={[
                        styles.previewDeviceButtonText,
                        selected && styles.previewDeviceButtonTextSelected,
                      ]}
                    >
                      {device.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View
              style={[styles.preview, { backgroundColor: previewBackground }]}
            >
              <View style={styles.previewBrowserBar}>
                <View style={styles.previewBrowserDot} />
                <View style={styles.previewBrowserDot} />
                <View style={styles.previewBrowserDot} />
              </View>
              <View style={styles.previewSite}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewBrand}>
                    {seller.avatar ? (
                      <Image
                        source={{ uri: seller.avatar }}
                        style={styles.previewBrandIcon}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.previewBrandIcon,
                          { backgroundColor: themeColor },
                        ]}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          {(name || "S").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.previewBrandName,
                        {
                          color: previewForeground,
                          fontFamily:
                            storefrontTheme === "fashionia" ||
                            storefrontTheme === "luxe"
                              ? "Georgia"
                              : undefined,
                        },
                      ]}
                    >
                      {name || "Your store"}
                    </Text>
                  </View>
                  {previewIsWide ? (
                    <View style={styles.previewNav}>
                      <Text
                        style={[
                          styles.previewNavText,
                          { color: previewForeground },
                        ]}
                      >
                        Home
                      </Text>
                      <Text
                        style={[
                          styles.previewNavText,
                          { color: previewForeground },
                        ]}
                      >
                        Shop
                      </Text>
                      <Text
                        style={[
                          styles.previewNavText,
                          { color: previewForeground },
                        ]}
                      >
                        About
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.previewActions}>
                    <Ionicons
                      name="bag-outline"
                      size={12}
                      color={previewForeground}
                    />
                    <Text
                      style={[
                        styles.previewActionText,
                        { color: previewForeground },
                      ]}
                    >
                      Cart
                    </Text>
                    <Text
                      style={[
                        styles.previewActionText,
                        { color: previewForeground },
                      ]}
                    >
                      Sign in
                    </Text>
                    {previewIsWide ? (
                      <View
                        style={[
                          styles.previewSearchButton,
                          { backgroundColor: themeColor },
                        ]}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 7,
                            fontWeight: "700",
                          }}
                        >
                          Sign up
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.previewSearch}>
                  <Text style={styles.previewSearchText}>
                    Search {name || "this store"}
                  </Text>
                  <View
                    style={[
                      styles.previewSearchButton,
                      { backgroundColor: themeColor },
                    ]}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 7, fontWeight: "700" }}
                    >
                      Search
                    </Text>
                  </View>
                </View>

                {storefrontLayout === "gallery" ? (
                  <View
                    style={{
                      flexDirection: previewIsWide ? "row" : "column",
                      minHeight: previewIsWide ? 250 : undefined,
                      backgroundColor: previewBackground,
                    }}
                  >
                    <View
                      style={[
                        styles.previewHeroText,
                        { flex: previewIsWide ? 0.9 : undefined },
                      ]}
                    >
                      <Text
                        style={[
                          styles.previewEyebrow,
                          { color: previewForeground, opacity: 0.65 },
                        ]}
                      >
                        THE GALLERY EDIT
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.previewName,
                          {
                            color: previewForeground,
                            fontFamily:
                              storefrontTheme === "fashionia" ||
                              storefrontTheme === "luxe"
                                ? "Georgia"
                                : undefined,
                          },
                        ]}
                      >
                        {name || "Your store name"}
                      </Text>
                      <Text
                        numberOfLines={3}
                        style={[
                          styles.previewDescription,
                          { color: previewForeground, opacity: 0.72 },
                        ]}
                      >
                        {description ||
                          "Your store description will appear here."}
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: previewIsWide ? 1.2 : undefined,
                        flexDirection: "row",
                        gap: 6,
                        height: previewIsWide ? undefined : 150,
                        padding: 6,
                      }}
                    >
                      {[coverImage, coverImage2].map((image, index) => (
                        <View
                          key={`gallery-preview-${index}`}
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            backgroundColor: `${themeColor}30`,
                          }}
                        >
                          {image ? (
                            <Image
                              source={{ uri: image }}
                              style={{ width: "100%", height: "100%" }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                flex: 1,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name="image-outline"
                                size={18}
                                color={themeColor}
                              />
                              <Text
                                style={{
                                  color: themeColor,
                                  fontSize: 8,
                                  marginTop: 4,
                                }}
                              >
                                Cover {index + 1}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : storefrontLayout === "catalog" ? (
                  <View
                    style={{
                      minHeight: 125,
                      padding: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: previewBackground,
                      overflow: "hidden",
                    }}
                  >
                    {coverImage ? (
                      <Image
                        source={{ uri: coverImage }}
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bottom: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          opacity: 0.16,
                        }}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.previewEyebrow,
                        { color: previewForeground, opacity: 0.65 },
                      ]}
                    >
                      BROWSE THE STORE
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.previewName,
                        {
                          color: previewForeground,
                          fontFamily:
                            storefrontTheme === "fashionia" ||
                            storefrontTheme === "luxe"
                              ? "Georgia"
                              : undefined,
                          marginTop: 4,
                        },
                      ]}
                    >
                      {name || "Your store name"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.previewDescription,
                        { color: previewForeground, opacity: 0.72 },
                      ]}
                    >
                      {description ||
                        "Your store description will appear here."}
                    </Text>
                    <View
                      style={[
                        styles.previewCta,
                        { backgroundColor: themeColor, paddingVertical: 5 },
                      ]}
                    >
                      <Text style={styles.previewCtaText}>
                        Browse all products →
                      </Text>
                    </View>
                  </View>
                ) : previewSplitHero || previewEditorialHero ? (
                  <View
                    style={{
                      flexDirection: previewIsWide
                        ? previewEditorialHero
                          ? "row-reverse"
                          : "row"
                        : previewEditorialHero
                          ? "column-reverse"
                          : "column",
                      backgroundColor: previewBackground,
                      minHeight: previewIsWide
                        ? previewEditorialHero
                          ? 260
                          : 220
                        : undefined,
                    }}
                  >
                    <View
                      style={[
                        styles.previewHeroText,
                        {
                          flex: previewIsWide ? 1 : undefined,
                          alignItems:
                            storefrontTheme === "fashionia"
                              ? "flex-start"
                              : undefined,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.previewEyebrow,
                          { color: previewForeground, opacity: 0.65 },
                        ]}
                      >
                        {previewEditorialHero
                          ? "THE NEW COLLECTION"
                          : storefrontTheme === "fashionia"
                            ? "THE NEW COLLECTION"
                            : storefrontTheme === "minimal"
                              ? "THOUGHTFULLY SELECTED"
                              : `DISCOVER ${name || "OUR STORE"}`}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.previewName,
                          {
                            color: previewForeground,
                            fontFamily:
                              storefrontTheme === "fashionia" ||
                              storefrontTheme === "luxe"
                                ? "Georgia"
                                : undefined,
                            textTransform:
                              storefrontTheme === "fashionia"
                                ? "uppercase"
                                : "none",
                          },
                        ]}
                      >
                        {name || "Your store name"}
                      </Text>
                      <Text
                        numberOfLines={3}
                        style={[
                          styles.previewDescription,
                          { color: previewForeground, opacity: 0.72 },
                        ]}
                      >
                        {description ||
                          "Your store description will appear here."}
                      </Text>
                      <View
                        style={[
                          styles.previewCta,
                          {
                            backgroundColor:
                              storefrontTheme === "fashionia"
                                ? "transparent"
                                : themeColor,
                            borderWidth:
                              storefrontTheme === "fashionia" ? 1 : 0,
                            borderColor: previewForeground,
                            borderRadius:
                              storefrontTheme === "minimal" ? 4 : 16,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color:
                              storefrontTheme === "fashionia"
                                ? previewForeground
                                : "#fff",
                            fontSize: 8,
                            fontWeight: "700",
                          }}
                        >
                          Browse collection →
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.previewHeroImage,
                        previewIsWide
                          ? {
                              minHeight: previewEditorialHero ? 260 : 220,
                              flex: previewEditorialHero ? 1.25 : 1,
                            }
                          : { height: 150, flex: undefined },
                        !coverImage && { backgroundColor: `${themeColor}30` },
                      ]}
                    >
                      {coverImage ? (
                        <Image
                          source={{ uri: coverImage }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.previewHero,
                      {
                        minHeight: storefrontLayout === "spotlight" ? 190 : 230,
                        backgroundColor: themeColor,
                        justifyContent: "flex-end",
                      },
                    ]}
                  >
                    {coverImage ? (
                      <Image
                        source={{ uri: coverImage }}
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bottom: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          opacity: 0.6,
                        }}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                        backgroundColor: "rgba(0,0,0,0.38)",
                      }}
                    />
                    <Text style={styles.previewEyebrow}>
                      {(seller.location || "INDEPENDENT STORE").toUpperCase()}
                    </Text>
                    <Text numberOfLines={2} style={styles.previewName}>
                      {name || "Your store name"}
                    </Text>
                    <Text numberOfLines={3} style={styles.previewDescription}>
                      {description ||
                        "Your store description will appear here."}
                    </Text>
                    <View
                      style={[
                        styles.previewCta,
                        { backgroundColor: "#fff", borderRadius: 18 },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#292524",
                          fontSize: 8,
                          fontWeight: "700",
                        }}
                      >
                        {storefrontLayout === "spotlight"
                          ? "Discover the featured piece  →"
                          : "Shop the collection  →"}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.previewTrust}>
                  <Text
                    style={[
                      styles.previewTrustText,
                      { color: previewForeground },
                    ]}
                  >
                    ✦ Curated for you
                  </Text>
                  <Text
                    style={[
                      styles.previewTrustText,
                      { color: previewForeground },
                    ]}
                  >
                    Shop independent
                  </Text>
                  <Text
                    style={[
                      styles.previewTrustText,
                      { color: previewForeground },
                    ]}
                  >
                    5 products
                  </Text>
                </View>

                <View style={styles.previewCollection}>
                  <View style={styles.previewCollectionHeader}>
                    <View>
                      <Text
                        style={[
                          styles.previewCollectionLabel,
                          { color: themeColor },
                        ]}
                      >
                        {storefrontTheme === "fashionia"
                          ? "SELECTED PIECES"
                          : "THE COLLECTION"}
                      </Text>
                      <Text
                        style={[
                          styles.previewCollectionTitle,
                          {
                            color: previewForeground,
                            fontFamily:
                              storefrontTheme === "fashionia" ||
                              storefrontTheme === "luxe"
                                ? "Georgia"
                                : undefined,
                          },
                        ]}
                      >
                        {storefrontLayout === "catalog"
                          ? "Browse all products"
                          : `Shop ${name || "our store"}`}
                      </Text>
                    </View>
                    <Text style={styles.previewCount}>5 items</Text>
                  </View>
                  <View style={styles.previewProductGrid}>
                    {storefrontLayout === "spotlight" ? (
                      <View
                        key="spotlight-preview"
                        style={{
                          flexDirection: previewIsWide ? "row" : "column",
                          width: "100%",
                          marginBottom: 8,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: "rgba(0,0,0,0.1)",
                          backgroundColor: "rgba(255,255,255,0.35)",
                        }}
                      >
                        <View
                          style={[
                            styles.previewProductImage,
                            {
                              height: previewIsWide ? 132 : 145,
                              flex: previewIsWide ? 1 : undefined,
                              borderRadius: 0,
                              backgroundColor: `${themeColor}18`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.previewProductInitial,
                              { color: themeColor, fontSize: 34 },
                            ]}
                          >
                            {(name || "S").slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View
                          style={{
                            flex: 1,
                            justifyContent: "center",
                            alignItems: "flex-start",
                            padding: 14,
                          }}
                        >
                          <Text
                            style={[
                              styles.previewCollectionLabel,
                              { color: themeColor },
                            ]}
                          >
                            FEATURED PIECE
                          </Text>
                          <Text
                            style={[
                              styles.previewCollectionTitle,
                              {
                                color: previewForeground,
                                marginTop: 4,
                                fontSize: 13,
                              },
                            ]}
                          >
                            Featured product
                          </Text>
                          <Text
                            style={[
                              styles.previewProductPrice,
                              { color: themeColor, marginTop: 4 },
                            ]}
                          >
                            Product price
                          </Text>
                          <View
                            style={[
                              styles.previewCta,
                              {
                                backgroundColor: themeColor,
                                marginTop: 8,
                                paddingVertical: 5,
                              },
                            ]}
                          >
                            <Text style={styles.previewCtaText}>
                              View product →
                            </Text>
                          </View>
                        </View>
                      </View>
                    ) : null}
                    {[
                      "Featured product",
                      "New arrival",
                      "Everyday essential",
                      "Bestseller",
                      "Just added",
                    ]
                      .filter(
                        (_, index) =>
                          storefrontLayout !== "spotlight" || index > 0,
                      )
                      .map((productName, index) => {
                        const cardWidth = previewIsDesktop
                          ? storefrontLayout === "catalog"
                            ? "18%"
                            : storefrontLayout === "editorial"
                              ? "31%"
                              : "23%"
                          : previewViewport === "tablet"
                            ? storefrontLayout === "editorial"
                              ? "48%"
                              : "31%"
                            : "48%";
                        return (
                          <View
                            key={productName}
                            style={[
                              styles.previewProductCard,
                              {
                                width: cardWidth,
                                flexBasis: cardWidth,
                                flexGrow: 0,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.previewProductImage,
                                {
                                  aspectRatio:
                                    storefrontLayout === "catalog" ? 0.88 : 1,
                                  borderRadius:
                                    storefrontTheme === "fashionia"
                                      ? 0
                                      : storefrontLayout === "catalog"
                                        ? 6
                                        : 10,
                                  backgroundColor: `${themeColor}18`,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.previewProductInitial,
                                  { color: themeColor },
                                ]}
                              >
                                {(name || "S").slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.previewProductInfo}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.previewProductLabel,
                                  { color: previewForeground },
                                ]}
                              >
                                {productName}
                              </Text>
                              <Text
                                style={[
                                  styles.previewProductPrice,
                                  { color: themeColor },
                                ]}
                              >
                                Product price
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                  </View>
                </View>
                <View style={styles.previewFooter}>
                  <Text style={styles.previewFooterText}>
                    © {name || "Your store"} Terms Privacy Visit{" "}
                    {name || "store"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.activationCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.activationTitle}>
                  {storefrontEnabled
                    ? "Storefront is active"
                    : "Storefront is inactive"}
                </Text>
                <Text style={styles.activationDescription}>
                  {storefrontEnabled
                    ? "Shoppers can visit your public store page."
                    : "Your public store page is hidden from shoppers."}
                </Text>
              </View>
              <Switch
                value={storefrontEnabled}
                onValueChange={toggleStorefront}
                disabled={saving}
                trackColor={{
                  false: themeColors.border,
                  true: themeColors.primary,
                }}
                thumbColor="#fff"
                accessibilityLabel="Activate storefront"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose a template</Text>
            <Text style={styles.sectionHint}>
              Pick a visual style for your public store. Choose its accent color
              separately below.
            </Text>
            <View style={styles.templateList}>
              {STOREFRONT_TEMPLATES.map((template) => {
                const isSelected = template.id === storefrontTheme;
                return (
                  <Pressable
                    key={template.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setStorefrontTheme(template.id)}
                    style={[
                      styles.templateCard,
                      isWide
                        ? { width: "48%", flexGrow: 1 }
                        : { width: "100%" },
                      isSelected && styles.templateCardSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.templateSwatch,
                        { backgroundColor: template.color },
                      ]}
                    >
                      <View style={styles.templateSwatchBar} />
                      <View
                        style={[
                          styles.templateSwatchPanel,
                          { backgroundColor: template.background },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{template.name}</Text>
                      <Text style={styles.templateDescription}>
                        {template.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={themeColors.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Primary color</Text>
            <Text style={styles.sectionHint}>
              Used for buttons, links, badges, and highlights. Pick a swatch or
              enter a custom hex color.
            </Text>
            <View style={styles.colorOptions}>
              {STOREFRONT_COLORS.map((color) => (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${color} accent color`}
                  accessibilityState={{ selected: themeColor === color }}
                  onPress={() => setThemeColor(color)}
                  style={[
                    styles.colorOption,
                    themeColor === color && styles.colorOptionSelected,
                  ]}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: color,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            {Platform.OS === "web" ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <Text style={styles.fieldLabel}>Custom picker</Text>
                <input
                  aria-label="Choose primary color"
                  type="color"
                  value={
                    /^#[\da-f]{6}$/i.test(themeColor)
                      ? themeColor
                      : "#E85B55"
                  }
                  onChange={(event) => setThemeColor(event.target.value.toUpperCase())}
                  style={{
                    width: 44,
                    height: 34,
                    padding: 2,
                    border: `1px solid ${themeColors.border}`,
                    borderRadius: 8,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                  }}
                />
              </View>
            ) : null}
            <TextInput
              value={themeColor}
              onChangeText={(value) => setThemeColor(value.trim())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#E85B55"
              placeholderTextColor={themeColors.muted}
              accessibilityLabel="Primary color hex value"
              style={[styles.input, { marginTop: 12 }]}
            />
            <Text style={styles.fieldLabel}>Store layout</Text>
            <View style={styles.layoutList}>
              {STOREFRONT_LAYOUTS.map((layout) => {
                const isSelected = storefrontLayout === layout.id;
                return (
                  <Pressable
                    key={layout.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setStorefrontLayout(layout.id)}
                    style={[
                      styles.layoutCard,
                      isWide
                        ? { width: "48%", flexGrow: 1 }
                        : { width: "100%" },
                      isSelected && styles.layoutCardSelected,
                    ]}
                  >
                    <View>
                      <Text style={styles.layoutName}>{layout.name}</Text>
                      <Text style={styles.layoutDescription}>
                        {layout.description}
                      </Text>
                      <Text style={styles.layoutRequirement}>
                        {layout.requirement}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={themeColors.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store details</Text>
            <Text style={styles.fieldLabel}>Store name</Text>
            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (!slugTouched) setSlug(makeSlug(value));
              }}
              placeholder="Your store name"
              placeholderTextColor={themeColors.muted}
              style={styles.input}
              maxLength={80}
            />

            <Text style={styles.fieldLabel}>Storefront URL</Text>
            <View style={styles.slugInputRow}>
              <Text style={styles.slugPrefix}>/store/</Text>
              <TextInput
                value={slug}
                onChangeText={(value) => {
                  setSlugTouched(true);
                  setSlug(makeSlug(value));
                }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="your-store"
                placeholderTextColor={themeColors.muted}
                style={styles.slugInput}
                maxLength={80}
              />
            </View>
            <View style={styles.storefrontUrlRow}>
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                style={styles.storefrontUrlText}
              >
                {storefrontUrl}
              </Text>
              <Pressable
                onPress={copyStorefrontUrl}
                accessibilityRole="button"
                accessibilityLabel="Copy storefront URL"
                style={styles.copyButton}
              >
                <Ionicons
                  name={copiedUrl ? "checkmark" : "copy-outline"}
                  size={15}
                  color="#fff"
                />
                <Text style={styles.copyButtonText}>
                  {copiedUrl ? "Copied" : "Copy"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>About your store</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Tell shoppers what makes your store special"
              placeholderTextColor={themeColors.muted}
              style={[styles.input, styles.inputMultiline]}
              multiline
              maxLength={500}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store cover</Text>
            <Text style={styles.sectionHint}>
              Add a wide image to introduce your products and brand.
            </Text>
            <Pressable onPress={pickCoverImage} style={styles.coverPicker}>
              {coverImage ? (
                <Image
                  source={{ uri: coverImage }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={30}
                    color={themeColors.muted}
                  />
                  <Text style={styles.coverPlaceholderText}>
                    Add a cover image
                  </Text>
                </View>
              )}
              <View style={styles.coverAction}>
                <Ionicons name="camera-outline" size={17} color="#fff" />
                <Text style={styles.coverActionText}>
                  {coverImage ? "Change cover" : "Choose image"}
                </Text>
              </View>
            </Pressable>
            {coverImage ? (
              <Pressable
                onPress={() => {
                  setCoverImage("");
                  setCoverFile(null);
                }}
                style={{ alignSelf: "flex-end", paddingTop: 9 }}
              >
                <Text style={{ color: themeColors.muted, fontSize: 13 }}>
                  Remove cover
                </Text>
              </Pressable>
            ) : null}
            {storefrontLayout === "gallery" ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                  Gallery second cover
                </Text>
                <Text style={styles.sectionHint}>
                  Gallery uses two cover images. Add a second image for the
                  right-hand panel.
                </Text>
                <Pressable
                  onPress={() => pickCoverImage(true)}
                  style={styles.coverPicker}
                >
                  {coverImage2 ? (
                    <Image
                      source={{ uri: coverImage2 }}
                      style={styles.coverImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <Ionicons
                        name="images-outline"
                        size={30}
                        color={themeColors.muted}
                      />
                      <Text style={styles.coverPlaceholderText}>
                        Add second cover image
                      </Text>
                    </View>
                  )}
                  <View style={styles.coverAction}>
                    <Ionicons name="camera-outline" size={17} color="#fff" />
                    <Text style={styles.coverActionText}>
                      {coverImage2 ? "Change second cover" : "Choose image"}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Social handles</Text>
            <Text style={styles.sectionHint}>
              Add full public URLs. They will appear in your storefront footer.
            </Text>
            {[
              ["Facebook", socialFacebook, setSocialFacebook, "https://facebook.com/your-store", "logo-facebook", "#1877F2"],
              ["Instagram", socialInstagram, setSocialInstagram, "https://instagram.com/your-store", "logo-instagram", "#E4405F"],
              ["Twitter / X", socialTwitter, setSocialTwitter, "https://x.com/your-store", "logo-twitter", "#1DA1F2"],
              ["WhatsApp", socialWhatsapp, setSocialWhatsapp, "https://wa.me/233...", "logo-whatsapp", "#25D366"],
              ["Website", socialWebsite, setSocialWebsite, "https://your-store.com", "globe-outline", themeColors.primary],
            ].map(([label, value, setter, placeholder, icon, color]) => (
              <View key={label} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Ionicons name={icon} size={18} color={color} />
                  <Text style={styles.fieldLabel}>{label}</Text>
                </View>
                <TextInput
                  value={value}
                  onChangeText={setter}
                  placeholder={placeholder}
                  placeholderTextColor={themeColors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  accessibilityLabel={`${label} URL`}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
