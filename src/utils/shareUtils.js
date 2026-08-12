// Share and Deeplinking Utilities for ExpressMart
import { Platform, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '../context/ToastContext';

/**
 * Generate deeplink URLs for various app content
 */
export const generateDeepLink = (type, id, params = {}) => {
  const baseUrl = 'expressmart://';
  
  switch (type) {
    case 'product':
      return `${baseUrl}product/${id}`;
    case 'store':
      return `${baseUrl}store/${id}`;
    case 'category':
      return `${baseUrl}category/${id}`;
    case 'order':
      return `${baseUrl}orders/${id}`;
    case 'chat':
      return `${baseUrl}chat/${id}`;
    case 'status':
      return `${baseUrl}status/${id}`;
    case 'home':
      return `${baseUrl}home`;
    case 'search':
      const query = params.query ? `?query=${encodeURIComponent(params.query)}` : '';
      return `${baseUrl}search${query}`;
    default:
      return baseUrl;
  }
};

/**
 * Generate web URLs for sharing (fallback for non-app users)
 */
export const generateWebUrl = (type, id, params = {}) => {
  const baseUrl = 'https://expressmart.app';
  
  switch (type) {
    case 'product':
      return `${baseUrl}/product/${id}`;
    case 'store':
      return `${baseUrl}/store/${id}`;
    case 'category':
      return `${baseUrl}/category/${id}`;
    case 'home':
      return baseUrl;
    default:
      return baseUrl;
  }
};

/**
 * Share content with native share sheet
 */
export const shareContent = async (title, message, url = null) => {
  try {
    const content = {
      title,
      message: url ? `${message}\n\n${url}` : message,
    };
    
    if (Platform.OS === 'web') {
      // Web sharing API
      if (navigator.share) {
        await navigator.share({
          title,
          text: message,
          url: url || window.location.href,
        });
      } else {
        // Fallback: copy to clipboard
        await Clipboard.setStringAsync(url ? `${message}\n${url}` : message);
        return { success: true, method: 'clipboard' };
      }
    } else {
      // Native share sheet
      const result = await Share.share(content);
      
      if (result.action === Share.sharedAction) {
        return { success: true, method: 'share' };
      }
    }
    
    return { success: true, method: 'share' };
  } catch (error) {
    console.error('Error sharing content:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Share a product with deeplink
 */
export const shareProduct = async (productId, productTitle, productImage = null) => {
  const deeplink = generateDeepLink('product', productId);
  const webUrl = generateWebUrl('product', productId);
  
  const message = `Check out "${productTitle}" on ExpressMart!`;
  
  return shareContent('Share Product', message, deeplink);
};

/**
 * Share a reel (Feed video) — shares the underlying product deeplink so the
 * recipient lands on the product detail page. A reel is just a product
 * showcase, so the share target is the product, not the video.
 */
export const shareReel = async (reel) => {
  const productId = reel?.product_id || reel?.id;
  const title = reel?.title || 'this product';
  if (!productId) {
    return { success: false, error: 'Missing product' };
  }
  const message = `Check out "${title}" on ExpressMart!`;
  return shareContent('Share Product', message, generateDeepLink('product', productId));
};

/**
 * Share a store/seller with deeplink
 */
export const shareStore = async (sellerId, storeName, storeImage = null) => {
  const deeplink = generateDeepLink('store', sellerId);
  const webUrl = generateWebUrl('store', sellerId);
  
  const message = `Check out "${storeName}" on ExpressMart!`;
  
  return shareContent('Share Store', message, deeplink);
};

/**
 * Share a search query
 */
export const shareSearch = async (query) => {
  const deeplink = generateDeepLink('search', null, { query });
  
  const message = `Search for "${query}" on ExpressMart!`;
  
  return shareContent('Share Search', message, deeplink);
};

/**
 * Copy deeplink to clipboard
 */
export const copyDeepLink = async (type, id, params = {}) => {
  try {
    const deeplink = generateDeepLink(type, id, params);
    await Clipboard.setStringAsync(deeplink);
    return { success: true, deeplink };
  } catch (error) {
    console.error('Error copying deeplink:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Open deeplink in app or fallback to web
 */
export const openDeepLink = async (type, id, params = {}) => {
  try {
    const deeplink = generateDeepLink(type, id, params);
    const webUrl = generateWebUrl(type, id, params);
    
    // Try to open in app first
    const canOpen = await Linking.canOpenURL(deeplink);
    
    if (canOpen) {
      await Linking.openURL(deeplink);
      return { success: true, openedIn: 'app' };
    } else {
      // Fallback to web
      await Linking.openURL(webUrl);
      return { success: true, openedIn: 'web' };
    }
  } catch (error) {
    console.error('Error opening deeplink:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Hook for using share utilities with toast notifications
 */
export const useShare = () => {
  const toast = useToast();
  
  const shareWithToast = async (type, id, params = {}, title = 'Share') => {
    try {
      const result = await shareContent(
        title,
        `Check this out on ExpressMart!`,
        generateDeepLink(type, id, params)
      );
      
      if (result.success) {
        toast.success('Shared successfully!');
      } else {
        toast.error('Failed to share');
      }
      
      return result;
    } catch (error) {
      toast.error('Failed to share');
      return { success: false, error: error.message };
    }
  };
  
  const copyLinkWithToast = async (type, id, params = {}) => {
    try {
      const result = await copyDeepLink(type, id, params);
      
      if (result.success) {
        toast.success('Link copied to clipboard!');
      } else {
        toast.error('Failed to copy link');
      }
      
      return result;
    } catch (error) {
      toast.error('Failed to copy link');
      return { success: false, error: error.message };
    }
  };
  
  return {
    generateDeepLink,
    generateWebUrl,
    shareContent,
    shareProduct,
    shareStore,
    shareSearch,
    copyDeepLink,
    openDeepLink,
    shareWithToast,
    copyLinkWithToast,
  };
};

export default {
  generateDeepLink,
  generateWebUrl,
  shareContent,
  shareProduct,
  shareStore,
  shareSearch,
  copyDeepLink,
  openDeepLink,
  useShare,
};