import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL = "openrouter/free";
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1200];

const responseJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const extractJson = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("AI returned invalid product data");
  return JSON.parse(candidate.slice(start, end + 1));
};

const supportsImageInput = (model: any) =>
  Array.isArray(model?.architecture?.input_modalities) &&
  model.architecture.input_modalities.some(
    (modality: unknown) => String(modality).toLowerCase() === "image",
  );

const isFreeModel = (model: any) =>
  String(model?.id || "").endsWith(":free") ||
  (String(model?.pricing?.prompt || "") === "0" &&
    String(model?.pricing?.completion || "") === "0");

const waitBeforeRetry = (attempt: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS.at(-1)),
  );

const resolveModel = async () => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Supabase env not configured");
    const { data, error } = await createClient(url, key)
      .from("express_settings")
      .select("value")
      .eq("key", "ai_model")
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (error) throw error;
    const model = typeof data?.value === "string" ? data.value.trim() : "";
    return model
      ? { model, source: "Database: express_settings.ai_model" }
      : {
          model: DEFAULT_MODEL,
          source:
            "product-vision DEFAULT_MODEL (express_settings.ai_model missing or empty)",
        };
  } catch {
    return {
      model: DEFAULT_MODEL,
      source: "product-vision DEFAULT_MODEL (database setting unavailable)",
    };
  }
};

const checkImageSupport = async (apiKey: string, requestedModel: string) => {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Could not check model capabilities (${response.status}): ${errorText.slice(0, 200)}`,
        );
      }

      const payload = await response.json();
      const models = Array.isArray(payload?.data) ? payload.data : [];
      if (requestedModel === "openrouter/free") {
        const freeVisionModel = models.find(
          (model: any) => isFreeModel(model) && supportsImageInput(model),
        );
        if (freeVisionModel)
          return { supported: true, checkedModel: freeVisionModel.id };
        lastError = new Error(
          "OpenRouter has no available free model that accepts image input",
        );
      } else {
        const selected = models.find(
          (model: any) => model?.id === requestedModel,
        );
        if (!selected) {
          return {
            supported: false,
            checkedModel: requestedModel,
            reason: `Model '${requestedModel}' was not found in OpenRouter`,
          };
        } else if (supportsImageInput(selected)) {
          return { supported: true, checkedModel: requestedModel };
        } else {
          return {
            supported: false,
            checkedModel: requestedModel,
            reason: `Model '${requestedModel}' does not support image input`,
          };
        }
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_RETRIES - 1) await waitBeforeRetry(attempt);
  }
  throw lastError || new Error("Could not find an image-capable model");
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const debug = {
    requestedModel: DEFAULT_MODEL,
    modelSource: "Database setting not yet resolved",
    selectedModel: DEFAULT_MODEL,
    selectionSource: "OpenRouter free router",
    actualModel: null as string | null,
    modelsUsed: [] as string[],
    modelNames: [] as string[],
    events: [] as { message: string; status: string }[],
  };
  const trace = (message: string, status = "info") =>
    debug.events.push({ message, status });
  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

    const body = await req.json();
    const image = String(body?.image || "");
    const requestedPrice =
      body?.price != null && body.price !== "" ? Number(body.price) : null;
    const requestedQuantity =
      body?.quantity != null && body.quantity !== ""
        ? Number(body.quantity)
        : null;
    const availableCategories = Array.isArray(body?.categories)
      ? body.categories
          .map((value: unknown) => String(value).trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];
    const isDataImage = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image);
    const isRemoteImage = /^https:\/\//i.test(image);
    if (!isDataImage && !isRemoteImage) {
      return responseJson(
        {
          success: false,
          error: "A compressed image data URL or HTTPS image URL is required",
        },
        400,
      );
    }
    if (isDataImage && image.length > 8_000_000) {
      return responseJson(
        { success: false, error: "Compressed image is too large" },
        413,
      );
    }
    if (
      isRemoteImage &&
      !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$|cdn\.expressmart\./i.test(
        new URL(image).hostname,
      )
    ) {
      return responseJson(
        {
          success: false,
          error:
            "This image host is not allowed; upload product media through the app",
        },
        400,
      );
    }

    trace("Reading model from express_settings.ai_model");
    const configured = await resolveModel();
    const preferredModel = configured.model;
    const fallbackModel = DEFAULT_MODEL;
    debug.requestedModel = preferredModel;
    debug.modelSource = configured.source;
    debug.selectedModel = preferredModel;
    debug.selectionSource = configured.source;
    debug.modelsUsed = [preferredModel];
    debug.modelNames = [preferredModel];
    trace(`Requested model: ${preferredModel} — ${configured.source}`);

    // Keep the database model as the primary candidate. Only move to the free
    // fallback when the configured model is known to be invalid or unusable.
    trace(`Checking image support in ${OPENROUTER_MODELS_URL}`);
    let primaryCapability = await checkImageSupport(apiKey, preferredModel);
    let requestModels = [preferredModel];
    let selectionSource =
      preferredModel === DEFAULT_MODEL
        ? "OpenRouter free router"
        : configured.source;

    if (!primaryCapability.supported) {
      selectionSource = `Fallback: ${primaryCapability.reason}; using ${fallbackModel}`;
      trace(selectionSource);
      const fallbackCapability = await checkImageSupport(apiKey, fallbackModel);
      requestModels = [
        preferredModel,
        fallbackModel,
        fallbackCapability.checkedModel,
      ].filter(Boolean);
      debug.selectedModel = fallbackModel;
      debug.selectionSource = selectionSource;
      debug.modelsUsed = [
        ...new Set([...(debug.modelsUsed || []), ...requestModels]),
      ];
      debug.modelNames = [
        ...new Set([...(debug.modelNames || []), ...requestModels]),
      ];
      trace(`Catalog check passed: ${fallbackCapability.checkedModel}`, "done");
    } else {
      requestModels = [preferredModel, primaryCapability.checkedModel].filter(
        Boolean,
      );
      debug.selectedModel = preferredModel;
      debug.selectionSource = configured.source;
      debug.modelsUsed = [
        ...new Set([...(debug.modelsUsed || []), ...requestModels]),
      ];
      debug.modelNames = [
        ...new Set([...(debug.modelNames || []), ...requestModels]),
      ];
      trace(`Catalog check passed: ${primaryCapability.checkedModel}`, "done");
    }

    const requestModelsUnique = [...new Set(requestModels.filter(Boolean))];
    debug.modelsUsed = [
      ...new Set([...(debug.modelsUsed || []), ...requestModelsUnique]),
    ];
    debug.modelNames = [
      ...new Set([...(debug.modelNames || []), ...requestModelsUnique]),
    ];
    let openRouterResponse;
    let lastGenerationError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const requestModel =
        requestModelsUnique[Math.min(attempt, requestModelsUnique.length - 1)];
      debug.selectedModel = requestModel;
      debug.selectionSource =
        requestModel === preferredModel
          ? selectionSource
          : "Fallback: first free image-capable entry from OpenRouter /api/v1/models";
      debug.modelsUsed = [
        ...new Set([...(debug.modelsUsed || []), requestModel]),
      ];
      debug.modelNames = [
        ...new Set([...(debug.modelNames || []), requestModel]),
      ];
      trace(
        `Provider attempt ${attempt + 1}: ${requestModel} — ${debug.selectionSource}`,
      );
      try {
        openRouterResponse = await fetch(OPENROUTER_URL, {
          method: "POST",
          signal: AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://expressmart.app",
            "X-Title": "ExpressMart Product Creator",
          },
          body: JSON.stringify({
            model: requestModel,
            temperature: 0.2,
            max_tokens: 1200,
            messages: [
              {
                role: "system",
                content:
                  "You create accurate ecommerce drafts from product photos. Carefully inspect visible materials, colors, shape, design, condition, components, controls, labels, and other useful product details. Write a moderately detailed buyer-facing description of about 80-140 words, using the visible details and explaining practical benefits without hype. Never invent exact technical facts, measurements, brand names, model numbers, certifications, or performance claims that are not visible. Return JSON only with category, title, description, specifications, and tags.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this product image and create a detailed but honest listing draft.${body?.category ? ` Current category context: ${String(body.category)}.` : ""} Available store categories: ${availableCategories.length ? availableCategories.join(", ") : "none provided"}. Seller-entered inventory values: price=${requestedPrice != null && Number.isFinite(requestedPrice) ? requestedPrice : "not provided"}, quantity=${requestedQuantity != null && Number.isFinite(requestedQuantity) ? requestedQuantity : "not provided"}. Use this exact JSON shape: {"category":"string","title":"string","description":"string","price":"number|nullable","quantity":"number|nullable","specifications":[{"key":"string","value":"string"}],"tags":["string"]}. Choose exactly one category from the available store categories when possible; if none fit, return an empty category. Fill price and quantity from the seller-entered values when they are provided, otherwise leave them as null or omit them. Make the description about 80-140 words and naturally incorporate the visible product details, likely use, appearance, materials, components, and practical benefits. Extract 4-8 useful specifications when the image supports them, such as color, material, style, dimensions, included components, controls, compatibility, or condition. Use an empty array for details that cannot be determined confidently.`,
                  },
                  { type: "image_url", image_url: { url: image } },
                ],
              },
            ],
          }),
        });
        if (openRouterResponse.ok) break;
        const errorText = await openRouterResponse.text();
        lastGenerationError = new Error(
          `Vision model error (${openRouterResponse.status}): ${errorText.slice(0, 300)}`,
        );
      } catch (error) {
        lastGenerationError = error;
      }
      trace(
        `Provider attempt ${attempt + 1} failed; ${attempt < MAX_RETRIES - 1 ? "retrying selected image-capable model" : "returning to client retry loop"}`,
        "error",
      );
      if (attempt < MAX_RETRIES - 1) await waitBeforeRetry(attempt);
    }
    if (!openRouterResponse?.ok)
      throw lastGenerationError || new Error("Vision model request failed");
    const result = await openRouterResponse.json();
    debug.actualModel = typeof result?.model === "string" ? result.model : null;
    trace(
      `Response model: ${debug.actualModel || "not reported by provider"}`,
      "done",
    );
    const content = result?.choices?.[0]?.message?.content;
    const product = extractJson(typeof content === "string" ? content : "");
    trace("Parsed product draft; client will validate required fields", "done");
    return responseJson({ success: true, product, debug });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace(message, "error");
    return responseJson({ success: false, error: message, debug }, 500);
  }
});
