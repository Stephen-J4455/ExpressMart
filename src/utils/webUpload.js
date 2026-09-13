const getImageExtension = (uri) => {
  const cleanUri = uri?.split("?")[0] || "";
  const fileNameSegment = cleanUri.split("/").pop() || "";
  const ext = fileNameSegment.includes(".")
    ? fileNameSegment.split(".").pop()?.toLowerCase()
    : null;

  if (!ext || ext.length > 5) return "jpg";
  return ext === "jpeg" ? "jpg" : ext;
};

export const getImageContentType = (uri, fallbackType = null) => {
  if (fallbackType && typeof fallbackType === "string") return fallbackType;
  const ext = getImageExtension(uri);
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
};

const fetchBlobFromUri = async (uri, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(uri, { signal: controller.signal });
  clearTimeout(timer);
  return await response.blob();
};

const xhrBlobFromUri = (uri, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", uri, true);
    xhr.responseType = "blob";
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(xhr.response);
        return;
      }
      reject(new Error(`Failed to read selected file (status ${xhr.status})`));
    };
    xhr.onerror = () => {
      reject(new Error("Failed to read selected file"));
    };
    xhr.onabort = () => {
      reject(new Error("Reading selected file was aborted"));
    };
    xhr.ontimeout = () => {
      reject(new Error("Reading selected file timed out"));
    };
    xhr.send();
  });

export const getWebUploadPayload = async ({
  uri,
  pickedFile = null,
  preferredContentType = null,
}) => {
  let fileBody = pickedFile instanceof Blob ? pickedFile : null;

  if (!fileBody) {
    try {
      fileBody = await fetchBlobFromUri(uri);
    } catch (fetchError) {
      try {
        fileBody = await xhrBlobFromUri(uri);
      } catch (xhrError) {
        throw new Error(
          `Unable to read selected file for upload (${fetchError.message || "fetch failed"}; ${xhrError.message || "xhr failed"})`,
        );
      }
    }
  }

  const contentType = getImageContentType(
    uri,
    preferredContentType || fileBody?.type || null,
  );

  return { fileBody, contentType };
};