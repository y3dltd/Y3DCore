// more details-card.tsx
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card' // Assuming usage of shadcn/ui Card
import { Info } from 'lucide-react' // Restore Info import
import { formatDateTime } from '@/lib/shared/date-utils' // Import date utility functions

// Define the interface for the orderData prop
interface MoreDetailsData {
    payment_date: string | null
    order_key: string | null
    shipstation_store_id: number | null
    payment_method: string | null
    amount_paid: string | null // Serialized Decimal
    shipping_price: string | null // Serialized Decimal
    tax_amount: string | null // Serialized Decimal
    discount_amount: string | null // Serialized Decimal
    shipping_amount_paid: string | null // Serialized Decimal
    shipping_tax: string | null // Serialized Decimal
    gift: boolean | null
    gift_message: string | null
    internal_notes: string | null
    last_sync_date: string | null // Serialized DateTime
    order_weight_value: string | null // Serialized Decimal
    order_weight_units: string | null
    dimensions_units: string | null
    dimensions_length: string | null // Serialized Decimal
    dimensions_width: string | null // Serialized Decimal
    dimensions_height: string | null // Serialized Decimal
    insurance_provider: string | null
    insurance_insure_shipment: boolean | null
    insurance_insured_value: string | null // Serialized Decimal
    gift_email: string | null
    notes: string | null
}

interface MoreDetailsCardProps {
    orderData: MoreDetailsData
    className?: string
}

export function MoreDetailsCard({ orderData, className }: MoreDetailsCardProps) {
    // Helper to format data or return 'N/A'
    const formatDetail = (value: string | number | boolean | null | undefined, prefix = '', suffix = '') => {
        if (value === null || typeof value === 'undefined') return 'N/A'
        if (typeof value === 'boolean') return value ? 'Yes' : 'No'
        return `${prefix}${value}${suffix}`
    }

    // Helper to format dates
    const formatDate = (date: string | null | undefined) => {
        if (!date) return 'N/A'
        return formatDateTime(date)
    }

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    More Details
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div><strong>Payment Date:</strong> {formatDate(orderData.payment_date)}</div>
                    <div><strong>Payment Method:</strong> {formatDetail(orderData.payment_method)}</div>
                    <div><strong>Amount Paid:</strong> {formatDetail(orderData.amount_paid, '$')}</div>
                    <div><strong>Shipping Paid:</strong> {formatDetail(orderData.shipping_amount_paid, '$')}</div>
                    <div><strong>Tax Amount:</strong> {formatDetail(orderData.tax_amount, '$')}</div>
                    <div><strong>Discount Amount:</strong> {formatDetail(orderData.discount_amount, '$')}</div>
                    <div><strong>Shipping Tax:</strong> {formatDetail(orderData.shipping_tax, '$')}</div>
                    <div><strong>Order Key:</strong> {formatDetail(orderData.order_key)}</div>
                    <div><strong>Store ID:</strong> {formatDetail(orderData.shipstation_store_id)}</div>
                    <div><strong>Is Gift:</strong> {formatDetail(orderData.gift)}</div>
                </div>
                {orderData.gift_message && (
                    <div className="pt-2 border-t mt-2">
                        <strong>Gift Message:</strong>
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs italic">{orderData.gift_message}</p>
                    </div>
                )}
                <div className="pt-2 border-t mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                    <div><strong>Weight:</strong> {formatDetail(orderData.order_weight_value, '', ` ${orderData.order_weight_units || ''}`)}</div>
                    <div><strong>Dimensions:</strong> {`${formatDetail(orderData.dimensions_length)}x${formatDetail(orderData.dimensions_width)}x${formatDetail(orderData.dimensions_height)} ${orderData.dimensions_units || ''}`}</div>
                    <div><strong>Insured:</strong> {formatDetail(orderData.insurance_insure_shipment)}</div>
                    <div><strong>Insured Value:</strong> {formatDetail(orderData.insurance_insured_value, '$')}</div>
                    <div><strong>Insurance Provider:</strong> {formatDetail(orderData.insurance_provider)}</div>
                </div>
                {orderData.internal_notes && (
                    <div className="pt-2 border-t mt-2">
                        <strong>Internal Notes:</strong>
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs">{orderData.internal_notes}</p>
                    </div>
                )}
                {orderData.notes && (
                    <div className="pt-2 border-t mt-2">
                        <strong>General Notes:</strong>
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs">{orderData.notes}</p>
                    </div>
                )}
                {orderData.gift && orderData.gift_email && (
                    <div className="pt-2 border-t mt-2">
                        <strong>Gift Recipient Email:</strong>
                        <p className="text-muted-foreground text-xs">{orderData.gift_email}</p>
                    </div>
                )}
                <div className="pt-2 border-t mt-2 text-xs text-muted-foreground">
                    Last Sync: {formatDate(orderData.last_sync_date)}
                </div>
            </CardContent>
        </Card>
    )
}
