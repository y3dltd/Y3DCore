
/**
 * Prints the packaging slip for an order
 * This function opens the print dialog with the contents of the packaging slip
 * @param {number} orderId - The ID of the order to print
 */
export const printPackagingSlip = (orderId: number): void => {
    // Get the content from our hidden template
    const templateEl = document.getElementById('packaging-slip-template');

    if (!templateEl) {
        console.error('Packaging slip template not found');
        return;
    }

    // Check that this is the right order
    if (Number(templateEl.getAttribute('data-order-id')) !== orderId) {
        console.error('Template order ID does not match requested order ID');
        return;
    }

    try {
        // Create a new print window directly with document.write
        const printWindow = window.open('', '_blank');

        if (!printWindow) {
            alert('Please allow pop-ups to print the packaging slip');
            return;
        }

        // Write the content directly to avoid escaping issues
        const content = templateEl.textContent || '';

        printWindow.document.write(content);
        printWindow.document.close();

        // Wait a moment for content to render
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();

            // Close after printing
            setTimeout(() => {
                printWindow.close();
            }, 1000);
        }, 500);
    } catch (error) {
        console.error('Error printing:', error);
        alert('Error printing. Please try again.');
    }
}; 
