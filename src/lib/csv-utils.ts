import Papa from 'papaparse';
import { format } from 'date-fns';
import { PrintTaskStatus } from '@prisma/client';

// Import the PrintTaskData interface directly from the component file
import type { PrintTaskData } from '@/components/print-queue-table';
import { toast } from 'sonner';

interface CSVExportRow {
  'Task ID': number;
  'Date - Ship By Date': string;
  'Market - Markeplace Name': string;
  'Item - SKU': string;
  'Item - Name': string;
  'Item - Qty': number;
  'Colour 1': string;
  'Colour 2': string;
  'Name': string;
  'Status': string;
  'Order - Number': string;
  'Bill To - Name': string;
  'Review': string;
}

/**
 * Convert PrintTaskData array to CSV string using PapaParse
 */
export function convertToCSV(data: PrintTaskData[]): string {
  if (data.length === 0) return '';

  // Prepare data for PapaParse
  const csvData = data.map(task => {
    // Format Ship By Date to match format "4/24/2025 11:59:59 PM"
    const shipByDate = task.ship_by_date 
      ? format(new Date(task.ship_by_date), 'M/d/yyyy h:mm:ss a')
      : 'N/A';
    
    // Extract customer name or use placeholder if not available
    const customerName = task.order?.customer_name || '';
    
    // Format the review field based on needs_review flag and review_reason
    const reviewInfo = task.needs_review
      ? task.review_reason || 'Needs Review'
      : 'No';
    
    // Return a row object with exact column names matching the user's spreadsheet
    return {
      'Task ID': task.id,
      'Date - Ship By Date': shipByDate,
      'Market - Markeplace Name': task.order?.marketplace || 'N/A',
      'Item - SKU': task.product?.sku || 'N/A',
      'Item - Name': task.product?.name || 'N/A',
      'Item - Qty': task.quantity,
      'Colour 1': task.color_1 || '',
      'Colour 2': task.color_2 || '',
      'Name': task.custom_text || '',
      'Status': task.status,
      'Order - Number': task.marketplace_order_number || '',
      'Bill To - Name': customerName,
      'Review': reviewInfo
    } as CSVExportRow;
  });

  // Use PapaParse to convert to CSV
  return Papa.unparse(csvData as unknown as object[], {
    header: true,
    quotes: true, // Always quote fields
    quoteChar: '"',
    escapeChar: '"'
  });
}

/**
 * Download CSV content with BOM for Excel compatibility
 */
export function downloadCSV(csvContent: string, fileName: string): void {
  // Add BOM (Byte Order Mark) for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const csvContentWithBOM = BOM + csvContent;
  
  // Create a blob with the CSV content
  const blob = new Blob([csvContentWithBOM], { type: 'text/csv;charset=utf-8;' });
  
  // Create a URL for the blob
  const url = URL.createObjectURL(blob);
  
  // Create a link element and trigger the download
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up by revoking the object URL
  URL.revokeObjectURL(url);
}

/**
 * Update task data from CSV row
 */
export async function updateTaskFromCSVRow(taskData: Record<string, string>): Promise<Response> {
  // Extract task ID from the CSV data
  const taskId = parseInt(taskData['Task ID'], 10);
  if (isNaN(taskId)) {
    throw new Error(`Invalid Task ID: ${taskData['Task ID']}`);
  }

  // Map CSV columns to task data properties
  const updateData: Record<string, string | PrintTaskStatus> = {};
  
  // Map status if provided and valid
  if (taskData['Status'] && Object.values(PrintTaskStatus).includes(taskData['Status'] as PrintTaskStatus)) {
    updateData.status = taskData['Status'] as PrintTaskStatus;
  }
  
  // Map color fields
  if (taskData['Colour 1']) updateData.color_1 = taskData['Colour 1'];
  if (taskData['Colour 2']) updateData.color_2 = taskData['Colour 2'];
  
  // Map custom text from Name field
  if (taskData['Name']) updateData.custom_text = taskData['Name'];
  
  // Only update if we have valid data to update
  if (Object.keys(updateData).length === 0) {
    return new Response(JSON.stringify({ message: `No valid data to update for task ${taskId}` }), { status: 400 });
  }

  // Send the update request to the API endpoint
  return fetch(`/api/print-tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });
}

/**
 * Process a CSV file and import data
 */
export async function processCSVImport(
  file: File, 
  onSuccess: (count: number) => void,
  onError: (count: number) => void,
  onComplete: (stats: { success: number; failed: number; total: number }) => void
): Promise<void> {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const rows = results.data as Record<string, string>[];
      let successCount = 0;
      let failedCount = 0;
      
      // Process each row
      for (const row of rows) {
        try {
          const response = await updateTaskFromCSVRow(row);
          if (response.ok) {
            successCount++;
            onSuccess(successCount);
          } else {
            failedCount++;
            console.error(`Failed to update task: ${await response.text()}`);
            onError(failedCount);
          }
        } catch (error) {
          failedCount++;
          console.error('Error updating task:', error);
          onError(failedCount);
        }
      }
      
      // Call the complete callback with stats
      onComplete({
        success: successCount,
        failed: failedCount,
        total: rows.length
      });
    },
    error: (error) => {
      console.error('Error parsing CSV:', error);
      toast.error('Failed to parse CSV file');
      onComplete({ success: 0, failed: 0, total: 0 });
    }
  });
}
