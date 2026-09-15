import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (start < 0 || end <= start) throw new Error("AI returned invalid product data");
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
  new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS.at(-1)));

const checkImageSupport = async (apiKey: string, requestedModel: string) => {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Could not check model capabilities (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const payload = await response.json();
      const models = Array.isArray(payload?.data) ? payload.data : [];
      if (requestedModel === "openrouter/free") {
        const freeVisionModel = models.find(
          (model: any) => isFreeModel(model) && supportsImageInput(model),
        );
        if (freeVisionModel) return { supported: true, checkedModel: freeVisionModel.id };
        lastError = new Error("OpenRouter has no available free model that accepts image input");
      } else {
        const selected = models.find((model: any) => model?.id === requestedModel);
        if (!selected) {
          lastError = new Error(`Model '${requestedModel}' was not found in OpenRouter`);
        } else if (supportsImageInput(selected)) {
          return { supported: true, checkedModel: requestedModel };
        } else {
          lastError = new Error(`Model '${requestedModel}' does not support image input`);
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

    const body = await req.json();
    const image = String(body?.image || "");
    const availableCategories = Array.isArray(body?.categories)
      ? body.categories.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 50)
      : [];
    const isDataImage = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image);
    const isRemoteImage = /^https:\/\//i.test(image);
    if (!isDataImage && !isRemoteImage) {
      return responseJson(
        { success: false, error: "A compressed image data URL or HTTPS image URL is required" },
        400,
      );
    }
    if (isDataImage && image.length > 8_000_000) {
      return responseJson({ success: false, error: "Compressed image is too large" }, 413);
    }

    // Product creation always uses OpenRouter's free router. The router picks
    // an available free model, while the preflight below confirms that at
    // least one eligible model can accept image input.
    const model = DEFAULT_MODEL;

    // Check the OpenRouter model catalog before sending the image. This avoids
    // paying for or invoking a text-only model with multimodal content.
    const capability = await checkImageSupport(apiKey, model);
    if (!capability.supported) {
      return responseJson(
        {
          success: false,
          error: capability.reason,
          code: "VISION_MODEL_UNSUPPORTED",
          model,
        },
        400,
      );
    }

    const requestModels = [...new Set([model, capability.checkedModel])];
    let openRouterResponse;
    let lastGenerationError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const requestModel = requestModels[Math.min(attempt, requestModels.length - 1)];
      try {
        openRouterResponse = await fetch(OPENROUTER_URL, {
          method: "POST",
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
                text: `Analyze this product image and create a detailed but honest listing draft.${body?.category ? ` Current category context: ${String(body.category)}.` : ""} Available store categories: ${availableCategories.length ? availableCategories.join(", ") : "none provided"}. Use this exact JSON shape: {"category":"string","title":"string","description":"string","specifications":[{"key":"string","value":"string"}],"tags":["string"]}. Choose exactly one category from the available store categories when possible; if none fit, return an empty category. Make the description about 80-140 words and naturally incorporate the visible product details, likely use, appearance, materials, components, and practical benefits. Extract 4-8 useful specifications when the image supports them, such as color, material, style, dimensions, included components, controls, compatibility, or condition. Use an empty array for details that cannot be determined confidently.`,
              },
              { type: "image_url", image_url: { url: image } },
            ],
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
      if (attempt < MAX_RETRIES - 1) await waitBeforeRetry(attempt);
    }
    if (!openRouterResponse?.ok) throw lastGenerationError || new Error("Vision model request failed");
    const result = await openRouterResponse.json();
    const content = result?.choices?.[0]?.message?.content;
    const product = extractJson(typeof content === "string" ? content : "");
    return responseJson({ success: true, product });
  } catch (error) {
    console.error("product-vision error:", error);
    return responseJson({ success: false, error: error?.message || String(error) }, 500);
  }
});
