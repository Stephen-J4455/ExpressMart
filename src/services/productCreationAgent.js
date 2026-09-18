// One cancellable owner for preparation, requests, validation and retry delays.
export const abortError = () =>
  Object.assign(new Error("Agent cancelled"), { name: "AbortError" });

export const agentTask = (task, signal, timeoutMs = 120000) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const controller = new AbortController();
    let timer;
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      callback(value);
    };
    const cancel = () => {
      controller.abort();
      finish(reject, abortError());
    };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      finish(reject, new Error("Agent request timed out"));
    }, timeoutMs);
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw abortError();
        return task(controller.signal);
      })
      .then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
  });

export const agentDelay = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });

export const validateProductDraft = (product) => {
  if (
    !product ||
    typeof product.title !== "string" ||
    !product.title.trim() ||
    typeof product.description !== "string" ||
    !product.description.trim() ||
    typeof product.category !== "string" ||
    !Array.isArray(product.tags) ||
    !product.tags.every((tag) => typeof tag === "string") ||
    !Array.isArray(product.specifications) ||
    !product.specifications.every(
      (spec) =>
        spec && typeof spec.key === "string" && typeof spec.value === "string",
    )
  ) {
    throw new Error("AI returned an incomplete or invalid draft; trying again");
  }
  return product;
};

export const runProductCreationAgent = async ({
  prepare,
  request,
  signal,
  onEvent,
  onDebug,
  delay = agentDelay,
  timeoutMs = 120000,
}) => {
  let image;
  for (let attempt = 1; !signal.aborted; attempt += 1) {
    const emit = (message, status = "info") =>
      onEvent({ message, status, attempt });
    try {
      emit(`Attempt ${attempt}: preparing product image`, "active");
      if (!image) image = await agentTask(prepare, signal, timeoutMs);
      emit(
        "Requesting vision analysis; awaiting server model selection",
        "active",
      );
      const result = await agentTask(
        (requestSignal) => request(image, requestSignal),
        signal,
        timeoutMs,
      );
      if (signal.aborted) throw abortError();
      const debugPayload = result?.debug ?? result?.data?.debug ?? null;
      if (debugPayload) onDebug?.(debugPayload);
      for (const event of debugPayload?.events || []) {
        emit(event.message, event.status || "info");
      }
      if (!result?.success)
        throw new Error(result?.error || "Vision request failed");
      emit("Validating generated draft", "active");
      const product = validateProductDraft(result.product);
      emit("Draft validation passed", "done");
      return product;
    } catch (error) {
      if (signal.aborted) throw abortError();
      emit(error?.message || "Generation failed", "error");
      const delayMs = Math.min(30000, 2000 * 2 ** Math.min(attempt - 1, 4));
      emit(`Retrying in ${delayMs / 1000}s. Cancel to stop.`, "waiting");
      await delay(delayMs, signal);
    }
  }
  throw abortError();
};
