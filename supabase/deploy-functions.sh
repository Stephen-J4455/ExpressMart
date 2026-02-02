#!/bin/bash

# Deploy Supabase Edge Functions

echo "Deploying Supabase Edge Functions..."

# Deploy payment function
echo "Deploying payment function..."
supabase functions deploy payment

echo "Payment function deployed successfully!"