'use client';

import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface RowPrintPackingSlipButtonProps {
  orderId: number;
  orderNumber?: string | null;
}

/**
 * Small button used in the Orders list to download a packing-slip PDF for a
 * single order. It calls the existing `/api/generate-pdf/packing-slips` route
 * with a single `ids` query parameter, streams the resulting PDF and triggers
 * a download in the browser.
 */
export function RowPrintPackingSlipButton({
  orderId,
  orderNumber,
}: RowPrintPackingSlipButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/generate-pdf/packing-slips?ids=${orderId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to generate PDF: ${response.status} ${response.statusText} – ${errorText}`
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers.get('content-disposition');
      let filename = `Yorkshire3D_Order_${orderNumber || orderId}.pdf`;
      if (disposition && disposition.includes('filename=')) {
        const filenameMatch = /filename[^;=\n]*=((['"]?)(.*)\2)/.exec(disposition);
        if (filenameMatch && filenameMatch[3]) filename = filenameMatch[3];
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error generating/downloading packing-slip PDF', err);
      alert('Failed to generate packing-slip PDF. See console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadPDF}
      disabled={isGenerating}
      className="gap-1"
      title="Download packing slip PDF"
    >
      {isGenerating ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <FileDown className="h-3 w-3" />
      )}
      <span className="sr-only md:not-sr-only">Slip</span>
    </Button>
  );
}
