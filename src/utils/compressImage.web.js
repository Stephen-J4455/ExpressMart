const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;

const loadImage = (uri) =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode selected image"));
    image.src = uri;
  });

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress selected image"))),
      "image/jpeg",
      IMAGE_QUALITY,
    );
  });

export const compressProductImage = async (uri, pickedFile = null) => {
  if (!uri) throw new Error("A local image URI is required");

  try {
    const sourceUrl = pickedFile ? URL.createObjectURL(pickedFile) : uri;
    const image = await loadImage(sourceUrl);
    if (pickedFile) URL.revokeObjectURL(sourceUrl);

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressedFile = await canvasToBlob(canvas);
    return {
      uri,
      originalSize: pickedFile?.size || 0,
      compressedSize: compressedFile.size || 0,
      pickedFile: compressedFile,
      contentType: "image/jpeg",
      fileName: `product-${Date.now()}.jpg`,
    };
  } catch (error) {
    console.warn("Product image compression failed; uploading original:", error);
    return {
      uri,
      originalSize: pickedFile?.size || 0,
      compressedSize: pickedFile?.size || 0,
      pickedFile,
      contentType: pickedFile?.type || null,
      fileName: null,
    };
  }
};