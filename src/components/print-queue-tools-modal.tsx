'use client'

import React, { useState, useTransition } from 'react'
import { runPopulateQueueForOrder, syncOrderFromShipStation } from '@/lib/actions/tool-actions'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react' // For loading spinner
import { toast } from "sonner"
import { useRouter } from 'next/navigation' // Import useRouter

interface PrintQueueToolsModalProps {
    children: React.ReactNode // To wrap the trigger button
}

export function PrintQueueToolsModal({ children }: PrintQueueToolsModalProps) {
    const router = useRouter() // Initialize router
    const [isOpen, setIsOpen] = useState(false)
    const [orderId, setOrderId] = useState('')
    const [output, setOutput] = useState('')
    const [error, setError] = useState('')
    const [isPending, startTransition] = useTransition()

    const handleRunScript = async () => {
        if (!orderId) {
            setError('Please enter an Order ID.')
            return
        }
        setError('')
        setOutput('')

        startTransition(async () => {
            const result = await runPopulateQueueForOrder(orderId)
            if (result.success) {
                setOutput(result.output || 'Script completed successfully, no output.')
                // Create a more descriptive success message
                const successMessage = orderId.includes('-')
                    ? `Successfully processed marketplace order ${orderId}`
                    : `Successfully processed order ID ${orderId}`
                toast.success(successMessage)

                // Refresh the page to show updated data
                router.refresh()

                // Optional: Close the modal after successful execution
                // setIsOpen(false)
            } else {
                setError(result.error || 'An unknown error occurred.')
                setOutput(result.output || '') // Show output even on error
                // Create a more descriptive error message
                const errorPrefix = orderId.includes('-')
                    ? `Failed to process marketplace order ${orderId}`
                    : `Failed to process order ID ${orderId}`
                toast.error(`${errorPrefix}: ${result.error}`)
            }
            // Optionally clear orderId after run? Maybe not, allow re-runs easily.
            // setOrderId('')
        })
    }

    const handleSyncOrder = async () => {
        if (!orderId) {
            setError('Please enter an Order ID.')
            return
        }
        setError('')
        setOutput('')

        startTransition(async () => {
            const result = await syncOrderFromShipStation(orderId)
            if (result.success) {
                setOutput(result.output || 'Order synced successfully from ShipStation.')
                // Create a more descriptive success message
                const successMessage = orderId.includes('-')
                    ? `Successfully synced marketplace order ${orderId} from ShipStation`
                    : `Successfully synced order ID ${orderId} from ShipStation`
                toast.success(successMessage)

                // Refresh the page to show updated data
                router.refresh()

                // Optional: Close the modal after successful execution
                // setIsOpen(false)
            } else {
                setError(result.error || 'An unknown error occurred.')
                setOutput(result.output || '') // Show output even on error
                // Create a more descriptive error message
                const errorPrefix = orderId.includes('-')
                    ? `Failed to sync marketplace order ${orderId} from ShipStation`
                    : `Failed to sync order ID ${orderId} from ShipStation`
                toast.error(`${errorPrefix}: ${result.error}`)
            }
        })
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (!open) {
            // Reset state when closing
            setOrderId('')
            setOutput('')
            setError('')
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[800px]">
                <DialogHeader>
                    <DialogTitle>Print Queue Tools</DialogTitle>
                    <DialogDescription>
                        Run specific maintenance or processing tasks. Use with caution.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="orderId" className="text-right">
                            Order ID/Number
                        </Label>
                        <div className="col-span-3 space-y-1">
                            <Input
                                id="orderId"
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                className="w-full"
                                placeholder="Enter Order ID or Marketplace Order Number"
                                disabled={isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter an internal order ID (e.g., 12345) or a marketplace order number:<br />
                                • Amazon: 123-1234567-1234567<br />
                                • eBay: 12-12345-12345<br />
                                • Etsy: 1234567890<br />
                                • Shopify: #1001 or 1001
                            </p>
                        </div>
                    </div>

                    {/* Output/Error Display Area */}
                    {(output || error) && (
                        <ScrollArea className="max-h-[250px] w-full rounded-md border p-4 mt-4">
                            <pre className="text-sm whitespace-pre">
                                {error && <p className="text-red-600 mb-2 whitespace-normal">Error: {error}</p>}
                                {output}
                            </pre>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    )}
                </div>
                <DialogFooter className="flex-col space-y-2 sm:space-y-0 sm:flex-row sm:justify-between sm:space-x-2">
                    <div className="flex flex-col space-y-2 w-full sm:flex-row sm:space-y-0 sm:space-x-2">
                        <Button
                            type="button"
                            onClick={handleRunScript}
                            disabled={isPending || !orderId}
                            className="flex-1"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                'Run Populate Queue'
                            )}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSyncOrder}
                            disabled={isPending || !orderId}
                            variant="secondary"
                            className="flex-1"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                'Sync from ShipStation'
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
