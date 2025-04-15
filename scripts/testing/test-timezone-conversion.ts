/**
 * This script tests the timezone conversion function for ShipStation dates
 */

/**
 * Converts a ShipStation timestamp string to a Date object with proper timezone handling.
 * ShipStation uses PST (UTC-8) for timestamps.
 * 
 * @param dateString The ShipStation timestamp string
 * @returns A Date object in UTC
 */
function convertShipStationDateToUTC(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  // Parse the date string into a Date object
  // This will interpret the date in the local timezone
  const date = new Date(dateString);
  
  // ShipStation uses PST (UTC-8) for timestamps
  // We need to adjust for this by adding 8 hours to convert to UTC
  // This is a simplified approach - for production, consider using a library like date-fns-tz
  // that handles daylight saving time correctly
  const pstOffsetHours = 8; // PST is UTC-8
  const adjustedDate = new Date(date.getTime() + (pstOffsetHours * 60 * 60 * 1000));
  
  return adjustedDate;
}

// Test with a sample ShipStation date
const testDate = "2025-04-06T08:24:40.000"; // This would be 8:24 AM PST
const convertedDate = convertShipStationDateToUTC(testDate);

console.log("Original ShipStation date (PST):", testDate);
console.log("Converted to UTC:", convertedDate);
console.log("ISO String:", convertedDate?.toISOString());
console.log("Local String:", convertedDate?.toString());

// Calculate time difference from now
const now = new Date();
if (convertedDate) {
  const diffHours = Math.floor((now.getTime() - convertedDate.getTime()) / (1000 * 60 * 60));
  console.log(`\nTime difference: ${diffHours} hours ago`);
}

// Test with the actual order date from our database
const orderDateFromDB = "2025-04-06T15:24:40.000Z"; // This is the UTC time stored in DB
const orderDate = new Date(orderDateFromDB);

console.log("\nOrder date from DB (UTC):", orderDateFromDB);
console.log("Parsed as local:", orderDate.toString());
console.log("ISO String:", orderDate.toISOString());

// Calculate time difference from now for the DB date
const diffHoursDB = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60));
console.log(`Time difference: ${diffHoursDB} hours ago`);

// Show what the time would be if we convert back to PST for display
const pstOffsetHours = 8; // PST is UTC-8
const pstDate = new Date(orderDate.getTime() - (pstOffsetHours * 60 * 60 * 1000));
console.log("\nConverted back to PST:", pstDate.toString());
const diffHoursPST = Math.floor((now.getTime() - pstDate.getTime()) / (1000 * 60 * 60));
console.log(`Time difference in PST: ${diffHoursPST} hours ago`);

// Show current time in different formats
console.log("\nCurrent time:");
console.log("Local:", now.toString());
console.log("UTC:", now.toUTCString());
console.log("ISO:", now.toISOString());
console.log("Timezone offset:", now.getTimezoneOffset() / -60, "hours from UTC");
