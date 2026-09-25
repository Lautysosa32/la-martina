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
      supabase.from('products').select('id, name, price, original_price, category_id, subcategory_id, badge, stock, is_paused').in('id', itemIds),
      supabase.from('offers').select('*').eq('active', true),
      supabase.from('offer_redemptions').select('*').gte('redemption_date', new Date().toISOString().split('T')[0]),
      supabase.from('settings').select('key, value').in('key', ['general_config', 'delivery_radius_km', 'shipping_cost_per_km', 'base_shipping_cost', 'store_lat', 'store_lng', 'free_shipping_min_amount', 'delivery_time_slots'])
    ])

    if (productsRes.error) throw new Error('Error fetching products: ' + productsRes.error.message)
    const products = productsRes.data

    let customer: PricingCustomer | null = null
    let customerProfileData: any = null
    if (realPhone) {
      const cleanDigits = realPhone.replace(/\D/g, '')
      const possiblePhones = [
        realPhone,
        cleanDigits,
        `+54${cleanDigits}`,
        `+549${cleanDigits}`,
        `54${cleanDigits}`,
        `549${cleanDigits}`
      ]
      const { data: customerData } = await supabase
        .from('customer_profiles')
        .select('id, name, last_name, dni, phone, tier, birthday')
        .in('phone', possiblePhones)
        .limit(1)
        .maybeSingle()

      if (customerData) {
        customer = customerData
        customerProfileData = customerData
      }
    }

    // Map database snake_case offers to PricingOffer interface expected by pricing engine
    const mappedOffers: PricingOffer[] = (offersRes.data || []).map((o: any) => ({
      id: o.id,
      name: o.name || '',
      description: o.description || '',
      scope: o.scope,
      targetId: o.target_id || o.targetId,
      targetIds: o.target_ids || (o.target_id && o.target_id.includes(',') ? o.target_id.split(',').map((s: string) => s.trim()) : (o.target_id ? [o.target_id] : [])),
      productId: o.product_id || o.productId,
      subcategoryId: o.subcategory_id || o.subcategoryId,
      tagFilter: o.tag_filter || o.tagFilter,
      requiredTier: o.required_tier || o.requiredTier,
      discountType: o.discount_type || o.discountType || 'percent',
      discountPercent: o.discount_percent ?? o.discountPercent ?? (o.discount_value || o.discountValue || 0),
      discountValue: o.discount_value ?? o.discountValue ?? 0,
      maxDiscountAmount: o.max_discount_amount ?? o.maxDiscountAmount,
      startDate: o.start_date || o.startDate || '',
      endDate: o.end_date || o.endDate || '',
      active: o.active !== false,
      label: o.label || '',
      daily_quantity_limit: o.daily_quantity_limit,
      per_customer_daily_limit: o.per_customer_daily_limit,
      total_quantity_limit: o.total_quantity_limit,
      limit_strategy: o.limit_strategy || 'discount_only'
    }))

    // Settings map
    const settingsMap = (settingsRes.data || []).reduce((acc: any, row: any) => {
      acc[row.key] = row.value
      return acc
    }, {})

    const generalConfig = settingsMap['general_config'] || {}
    const storeLat = parseFloat(generalConfig.storeLat || settingsMap['store_lat'] || '-33.459009')
    const storeLng = parseFloat(generalConfig.storeLng || settingsMap['store_lng'] || '-67.551826')
    const costPerKm = parseFloat(generalConfig.shippingCostPerKm || settingsMap['shipping_cost_per_km'] || '400')
    const baseCost = parseFloat(generalConfig.shippingBaseCost || generalConfig.baseShippingCost || settingsMap['base_shipping_cost'] || '1000')
    const freeShippingMin = parseFloat(generalConfig.freeShippingMinAmount || settingsMap['free_shipping_min_amount'] || '0')

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const pricingProducts: PricingProduct[] = products.map((p: any) => ({
      id: p.id,
      categoryId: p.category_id,
      subcategoryId: p.subcategory_id,
      badge: p.badge,
      price: p.price,
      originalPrice: p.original_price,
      original_price: p.original_price
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

      const basePrice = (prod.original_price && prod.original_price > prod.price)
        ? prod.original_price
        : prod.price

      const pricingInput: PricingItemInput = {
        productId: prod.id,
        categoryId: prod.category_id,
        price: basePrice,
        originalPrice: prod.original_price,
        quantity: qty
      }

      const itemOffer = applyOffersToCartItem(
        pricingInput,
        pricingProducts,
        mappedOffers,
        redemptionsRes.data as PricingOfferRedemption[],
        todayStr,
        customer,
        { forDisplay: isQuote }
      )

      const lineOriginalTotal = basePrice * qty
      const lineFinalTotal = Math.round(itemOffer.finalPrice * qty * 100) / 100
      
      subtotal += lineOriginalTotal
      subtotalAfterItemDiscounts += lineFinalTotal

      finalItems.push({
        id: prod.id,
        name: prod.name,
        quantity: qty,
        price: Math.round(itemOffer.finalPrice * 100) / 100
      })
    }

    subtotal = Math.round(subtotal * 100) / 100
    subtotalAfterItemDiscounts = Math.round(subtotalAfterItemDiscounts * 100) / 100

    // Calculate Global Offer
    const orderOffer = applyOrderOffers(
      subtotalAfterItemDiscounts,
      mappedOffers,
      redemptionsRes.data as PricingOfferRedemption[],
      todayStr,
      today.getMonth() + 1,
      today.getDate(),
      customer
    )

    const activeTotalPrice = Math.round((subtotalAfterItemDiscounts - orderOffer.discountAmount) * 100) / 100
    const totalDiscount = Math.round(((subtotal - subtotalAfterItemDiscounts) + orderOffer.discountAmount) * 100) / 100

    // Calculate Shipping
    let distanceKm = null
    if (!isPickup && delivery_lat !== null && delivery_lat !== undefined && delivery_lng !== null && delivery_lng !== undefined) {
      const lat = parseFloat(delivery_lat)
      const lng = parseFloat(delivery_lng)
      if (!isNaN(lat) && !isNaN(lng)) {
        distanceKm = calculateDistanceKm(storeLat, storeLng, lat, lng)
      }
    }

    const shipping = calculateShippingCost({
      distanceKm,
      cartTotal: activeTotalPrice,
      baseCost,
      costPerKm,
      freeShippingMinAmount: freeShippingMin,
      isPickup
    })

    const { delivery_data, payment_method, notes, dni, expected_total, customer_name } = payload

    // Check if selected delivery slot has free shipping benefit
    const defaultDeliverySlots = [
      { id: 'asap', label: 'Lo antes posible', sub: '30-60 min' },
      { id: 'today_midday', label: 'Hoy al Mediodía', sub: '13:00 a 14:00', freeShipping: true },
      { id: 'today_2', label: 'Hoy a la Noche', sub: '21:00 a 22:00', freeShipping: true },
      { id: 'tomorrow_1', label: 'Mañana al Mediodía', sub: '13:00 a 14:00', freeShipping: true }
    ]
    const rawDeliverySlots = settingsMap['delivery_time_slots']
    const deliverySlots = (Array.isArray(rawDeliverySlots) && rawDeliverySlots.length > 0)
      ? rawDeliverySlots
      : defaultDeliverySlots

    const selectedSlotLabel = delivery_data?.deliveryTime || payload.deliveryTime
    const matchedSlot = Array.isArray(deliverySlots) ? deliverySlots.find((s: any) =>
      selectedSlotLabel === s.label ||
      (s.sub && selectedSlotLabel === `${s.label} (${s.sub})`) ||
      (Boolean(s.label) && selectedSlotLabel?.startsWith(s.label))
    ) : null

    const hasSlotFreeShipping = Boolean(matchedSlot?.freeShipping)
    const effectiveShippingCost = (hasSlotFreeShipping && !isPickup) ? 0 : Math.round(shipping.cost * 100) / 100

    const finalTotal = Math.round((activeTotalPrice + effectiveShippingCost) * 100) / 100

    if (isQuote) {
      return new Response(
        JSON.stringify({
          success: true,
          items: finalItems,
          subtotal,
          discountAmount: totalDiscount,
          discountLabel: orderOffer.offerLabel,
          shippingCost: effectiveShippingCost,
          distanceKm: shipping.distanceKm,
          total: finalTotal
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CHECKOUT LOGIC: Helper to format currency with at most 2 decimal places
    const formatPriceDecimal = (val: number | string | undefined | null) => {
      if (val === undefined || val === null || isNaN(Number(val))) return '0'
      const num = Number(val)
      return (Math.round(num * 100) / 100).toFixed(2).replace(/\.00$/, '')
    }

    if (expected_total !== undefined) {
      const numExpected = parseFloat(expected_total)
      if (!isNaN(numExpected) && Math.abs(finalTotal - numExpected) > 1) {
        console.warn(`Price mismatch: server=${finalTotal}, client=${numExpected}`);
        return new Response(JSON.stringify({ 
          success: false,
          error: 'PRICE_MISMATCH', 
          message: `El total calculado por el servidor ($${formatPriceDecimal(finalTotal)}) difiere del total en pantalla ($${formatPriceDecimal(numExpected)}).`,
          serverTotal: finalTotal,
          clientTotal: numExpected
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    let fullAddress = delivery_data?.address || '';
    if (delivery_data?.houseNumber) fullAddress += ` ${delivery_data.houseNumber}`;
    if (delivery_data?.reference) fullAddress += ` (Ref: ${delivery_data.reference})`;
    if (notes) fullAddress += ` - Notas: ${notes}`;

    const profileFullName = customerProfileData
      ? [customerProfileData.name, customerProfileData.last_name].filter(Boolean).join(' ').trim()
      : ''

    const customerFullName = profileFullName || customer_name?.trim() || 'Invitado'

    const orderPayload = {
      total: finalTotal,
      discount: totalDiscount,
      discountLabel: orderOffer.offerLabel,
      paid_amount: 0,
      customer: customerFullName,
      dni: dni || customerProfileData?.dni || null,
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

    // Encolar mensaje de WhatsApp para el cliente confirmando recepción del pedido (Estado: Nuevo)
    if (realPhone) {
      try {
        const cleanDigits = realPhone.replace(/\D/g, '')
        const waPhone = cleanDigits.startsWith('549')
          ? cleanDigits
          : cleanDigits.startsWith('54')
            ? '549' + cleanDigits.slice(2)
            : '549' + cleanDigits

        const formattedTotal = `$${finalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const welcomeMsg = `👋 *¡Hola ${customerFullName}!* Recibimos tu pedido en *Martina Supermercado*.\n\nTu pedido *#${rpcData.order_id}* por *${formattedTotal}* se registró con éxito. ¡En breve comenzamos a prepararlo! 🛒`

        await supabase.from('whatsapp_messages').insert({
          phone: waPhone,
          customer_name: customerFullName,
          type: 'order_status_changed',
          title: 'Estado: Nuevo',
          message: welcomeMsg,
          order_id: rpcData.order_id,
          customer_phone: waPhone,
          status: 'pending',
          branch_id: 'main'
        })
      } catch (waErr) {
        console.error('Error encolando mensaje WhatsApp para nuevo pedido:', waErr)
      }
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
