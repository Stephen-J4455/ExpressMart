import { Image as ImageCompressor } from "react-native-compressor";
import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;

const verifyNativeImage = (uri) =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else reject(new Error("Compressed image has invalid dimensions"));
      },
      () => reject(new Error("Native image decoder could not read compressed image")),
    );
  });

export const compressProductImage = async (uri) => {
  if (!uri) throw new Error("A local image URI is required");

  try {
    const originalInfo = await FileSystem.getInfoAsync(uri);
    const compressedUri = await ImageCompressor.compress(uri, {
      compressionMethod: "manual",
      maxWidth: MAX_IMAGE_DIMENSION,
      maxHeight: MAX_IMAGE_DIMENSION,
      quality: IMAGE_QUALITY,
      output: "jpg",
      returnableOutputType: "uri",
    });
    await verifyNativeImage(compressedUri);
    const compressedInfo = await FileSystem.getInfoAsync(compressedUri);

    return {
      uri: compressedUri,
      originalSize: originalInfo?.size || 0,
      compressedSize: compressedInfo?.size || 0,
      pickedFile: null,
      contentType: "image/jpeg",
      fileName: `product-${Date.now()}.jpg`,
    };
  } catch (error) {
    console.warn("Product image compression failed; uploading original:", error);
    return {
      uri,
      originalSize: 0,
      compressedSize: 0,
      pickedFile: null,
      contentType: null,
      fileName: null,
    };
  }
};