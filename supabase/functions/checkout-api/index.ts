// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
// @ts-ignore: Deno import
import { corsHeaders } from "../_shared/cors.ts"
// @ts-ignore: Deno import
import { applyOffersToCartItem, applyOrderOffers } from "../_shared/pricing.ts"
// @ts-ignore: Deno import
import { calculateDistanceKm, calculateShippingCost } from "../_shared/shipping.ts"
// @ts-ignore: Deno import
import type { PricingItemInput, PricingCustomer, PricingOffer, PricingOfferRedemption, PricingProduct } from "../_shared/pricing.types.ts"

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const isQuote = url.pathname.endsWith('/quote')
    const isCheckout = url.pathname.endsWith('/checkout')

    if (!isQuote && !isCheckout) {
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }

    // @ts-ignore: Deno global
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    // @ts-ignore: Deno global
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    const { items, delivery_lat, delivery_lng, isPickup, customer_phone, checkout_token } = payload

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items are required')
    }

    // 1. Fetch related data
    const itemIds = items.map((i: any) => i.id || i.productId)
    
    // Si es checkout definitivo, validamos el token y obtenemos el teléfono real
    let realPhone = customer_phone;
    
    if (isCheckout) {
      if (!checkout_token) throw new Error('Checkout token is required');
      const { data: td, error: te } = await supabase
        .from('checkout_tokens')
        .select('phone, is_used, expires_at')
        .eq('token', checkout_token)
        .single();
        
      if (te || !td) throw new Error('Token inválido');
      if (td.is_used) throw new Error('Token ya utilizado');
      if (new Date(td.expires_at) < new Date()) throw new Error('Token expirado');
      
      realPhone = td.phone;
    }

    const [productsRes, offersRes, redemptionsRes, settingsRes] = await Promise.all([
      supabase.from('products').select('id, name, price, category_id, subcategory_id, badge, stock, is_paused').in('id', itemIds),
      supabase.from('offers').select('*').eq('active', true),
      supabase.from('offer_redemptions').select('*').gte('redemption_date', new Date().toISOString().split('T')[0]),
      supabase.from('settings').select('key, value').in('key', ['general_config', 'delivery_radius_km', 'shipping_cost_per_km', 'base_shipping_cost', 'store_lat', 'store_lng', 'free_shipping_min_amount'])
    ])

    if (productsRes.error) throw new Error('Error fetching products: ' + productsRes.error.message)
    const products = productsRes.data

    let customer: PricingCustomer | null = null
    if (realPhone) {
      const { data: customerData } = await supabase.from('customer_profiles').select('dni, phone, tier, birthday').eq('phone', realPhone).single()
      if (customerData) customer = customerData
    }

    // Settings map
    const settingsMap = (settingsRes.data || []).reduce((acc: any, row: any) => {
      acc[row.key] = row.value
      return acc
    }, {})

    const generalConfig = settingsMap['general_config'] || {}
    const storeLat = parseFloat(generalConfig.storeLat || settingsMap['store_lat'] || '-33.459009')
    const storeLng = parseFloat(generalConfig.storeLng || settingsMap['store_lng'] || '-67.551826')
    const costPerKm = parseFloat(generalConfig.shippingCostPerKm || settingsMap['shipping_cost_per_km'] || '400')
    const baseCost = parseFloat(generalConfig.baseShippingCost || settingsMap['base_shipping_cost'] || '1000')
    const freeShippingMin = parseFloat(generalConfig.freeShippingMinAmount || settingsMap['free_shipping_min_amount'] || '0')

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const pricingProducts: PricingProduct[] = products.map((p: any) => ({
      id: p.id,
      categoryId: p.category_id,
      subcategoryId: p.subcategory_id,
      badge: p.badge
    }))

    // Calculate Items
    let subtotal = 0
    let subtotalAfterItemDiscounts = 0
    const finalItems = []

    for (const item of items) {
      const prod = products.find((p: any) => p.id === (item.id || item.productId))
      if (!prod) throw new Error(`Product ${item.id} not found`)
      if (prod.is_paused) throw new Error(`Product ${item.id} is paused`)
      
      const qty = parseInt(item.quantity)
      if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${item.id}`)
      
      // Stock check on checkout (not on quote to avoid quote failing too early if just browsing)
      if (isCheckout) {
        if (qty > prod.stock) {
          throw new Error(`Insufficient stock for product ${prod.id}. Requested: ${qty}, Available: ${prod.stock}`)
        }
      }

      const pricingInput: PricingItemInput = {
        productId: prod.id,
        categoryId: prod.category_id,
        price: prod.price,
        quantity: qty
      }

      const itemOffer = applyOffersToCartItem(
        pricingInput,
        pricingProducts,
        offersRes.data as PricingOffer[],
        redemptionsRes.data as PricingOfferRedemption[],
        todayStr,
        customer,
        { forDisplay: isQuote }
      )

      const lineOriginalTotal = prod.price * qty
      const lineFinalTotal = itemOffer.finalPrice * qty
      
      subtotal += lineOriginalTotal
      subtotalAfterItemDiscounts += lineFinalTotal

      finalItems.push({
        id: prod.id,
        name: prod.name,
        quantity: qty,
        price: itemOffer.finalPrice
      })
    }

    // Calculate Global Offer
    const orderOffer = applyOrderOffers(
      subtotalAfterItemDiscounts,
      offersRes.data as PricingOffer[],
      redemptionsRes.data as PricingOfferRedemption[],
      todayStr,
      today.getMonth() + 1,
      today.getDate(),
      customer
    )

    const activeTotalPrice = subtotalAfterItemDiscounts - orderOffer.discountAmount
    const totalDiscount = (subtotal - subtotalAfterItemDiscounts) + orderOffer.discountAmount

    // Calculate Shipping
    let distanceKm = null
    if (!isPickup && delivery_lat !== undefined && delivery_lng !== undefined) {
      distanceKm = calculateDistanceKm(storeLat, storeLng, parseFloat(delivery_lat), parseFloat(delivery_lng))
    }

    const shipping = calculateShippingCost({
      distanceKm,
      cartTotal: activeTotalPrice,
      baseCost,
      costPerKm,
      freeShippingMinAmount: freeShippingMin,
      isPickup
    })

    const finalTotal = activeTotalPrice + shipping.cost

    if (isQuote) {
      return new Response(
        JSON.stringify({
          success: true,
          items: finalItems,
          subtotal,
          discountAmount: totalDiscount,
          discountLabel: orderOffer.offerLabel,
          shippingCost: shipping.cost,
          distanceKm: shipping.distanceKm,
          total: finalTotal
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CHECKOUT LOGIC
    const { delivery_data, payment_method, notes, dni, expected_total } = payload

    if (expected_total !== undefined && Math.abs(finalTotal - expected_total) > 1) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'PRICE_MISMATCH', 
        message: 'El total calculado por el servidor difiere. Por favor, actualizá tu carrito.',
        serverTotal: finalTotal,
        clientTotal: expected_total
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let fullAddress = delivery_data?.address || '';
    if (delivery_data?.houseNumber) fullAddress += ` ${delivery_data.houseNumber}`;
    if (delivery_data?.reference) fullAddress += ` (Ref: ${delivery_data.reference})`;
    if (notes) fullAddress += ` - Notas: ${notes}`;

    const orderPayload = {
      total: finalTotal,
      discount: totalDiscount,
      discountLabel: orderOffer.offerLabel,
      paid_amount: finalTotal, // assuming full payment pending
      customer: customer ? (customer as any).name : 'Invitado',
      dni,
      payment_method,
      address: fullAddress.trim(),
      delivery_lat,
      delivery_lng,
      method: isPickup ? 'pickup' : 'delivery',
      delivery_time: delivery_data?.deliveryTime
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_secure_order', {
      p_order: orderPayload,
      p_items: finalItems,
      p_checkout_token: checkout_token
    })

    if (rpcError) {
      throw new Error('RPC Error: ' + rpcError.message)
    }

    return new Response(
      JSON.stringify({ success: true, order_id: rpcData.order_id, total: finalTotal }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
