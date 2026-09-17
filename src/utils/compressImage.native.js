import {
  Image as ImageCompressor,
  Video as VideoCompressor,
} from "react-native-compressor";
import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;
const VIDEO_MAX_DIMENSION = 720;
const VIDEO_BITRATE = 1500000;

const verifyNativeImage = (uri) =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else reject(new Error("Compressed image has invalid dimensions"));
      },
      () =>
        reject(
          new Error("Native image decoder could not read compressed image"),
        ),
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
    console.warn(
      "Product image compression failed; uploading original:",
      error,
    );
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

export const compressProductVideo = async (uri, pickedFile = null) => {
  if (!uri) throw new Error("A local video URI is required");

  let originalSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    originalSize = Number(info?.size || pickedFile?.size || 0);
  } catch (error) {
    originalSize = Number(pickedFile?.size || 0);
  }

  try {
    const compressedUri = await VideoCompressor.compress(uri, {
      compressionMethod: "manual",
      maxSize: VIDEO_MAX_DIMENSION,
      bitrate: VIDEO_BITRATE,
      minimumFileSizeForCompress: 0,
    });
    const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
    const compressedSize = Number(compressedInfo?.size || originalSize || 0);

    if (compressedSize > originalSize) {
      return {
        uri,
        originalSize,
        compressedSize: originalSize,
        pickedFile: null,
        contentType: pickedFile?.type || "video/mp4",
        fileName: null,
        unchanged: true,
      };
    }

    return {
      uri: compressedUri,
      originalSize,
      compressedSize,
      pickedFile: null,
      contentType: "video/mp4",
      fileName: `product-video-${Date.now()}.mp4`,
      unchanged: false,
    };
  } catch (error) {
    console.warn(
      "Product video compression failed; uploading original:",
      error,
    );
    return {
      uri,
      originalSize,
      compressedSize: originalSize,
      pickedFile: null,
      contentType: pickedFile?.type || "video/mp4",
      fileName: null,
      unchanged: true,
    };
  }
};
