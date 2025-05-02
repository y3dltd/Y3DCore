'use client';

import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SerializableOrderDetailsData } from '@/types/order-details';

interface PrintPackagingSlipButtonProps {
  order: SerializableOrderDetailsData;
}

export function PrintPackagingSlipButton({ order }: PrintPackagingSlipButtonProps) {
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    setError(null);

    try {
      const response = await fetch(`/api/generate-pdf/packing-slips?ids=${order.id}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to generate PDF: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const blob = await response.blob();

      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;

      const disposition = response.headers.get('content-disposition');
      let filename = `Yorkshire3D_Order_${order.shipstation_order_number || order.id}.pdf`;
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]?)(.*?)['"]?$)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[3]) {
          filename = matches[3].replace(/^"|"$/g, '');
        }
      }
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      let errorMessage = 'An unknown error occurred while generating the PDF.';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      console.error('Error generating/downloading PDF:', err);
      setError(errorMessage);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
        onClick={handleDownloadPDF}
        disabled={isGeneratingPDF}
      >
        {isGeneratingPDF ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="mr-2 h-4 w-4" />
        )}
        {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
      </Button>
      {error && <p className="text-sm text-destructive">Error: {error}</p>}
    </div>
  );
}
