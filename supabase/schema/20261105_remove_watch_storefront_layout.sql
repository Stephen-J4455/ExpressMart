-- Retire the removed watch storefront layout for existing sellers.
UPDATE public.express_sellers
SET storefront_layout = 'classic'
WHERE storefront_layout = 'watch';
