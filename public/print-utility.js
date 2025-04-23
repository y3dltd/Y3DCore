/**
 * Direct print utility for packaging slips
 * Place this file in the public folder and include it with a script tag
 * 
 * Usage in HTML:
 * <script src="/print-utility.js"></script>
 * 
 * Then call the function:
 * <button onclick="printPackagingSlip()">Print</button>
 */

function printPackagingSlip() {
  // Get content from hidden template
  const template = document.getElementById('packaging-slip-template');
  
  if (!template) {
    console.error('Template element not found');
    return;
  }
  
  // Try to get the raw text content to avoid escaping issues
  const content = template.textContent || template.innerText || '';
  
  // Create print window
  const printWin = window.open('', '_blank');
  
  if (!printWin) {
    alert('Please allow pop-ups for printing');
    return;
  }
  
  // Write content directly
  printWin.document.open();
  printWin.document.write(content);
  printWin.document.close();
  
  // Wait for content to load before printing
  setTimeout(() => {
    printWin.focus();
    printWin.print();
    
    // Close the window after a delay
    setTimeout(() => {
      printWin.close();
    }, 1000);
  }, 500);
} 
