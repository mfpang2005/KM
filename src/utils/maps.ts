/**
 * Generates a Google Maps URL for a given address.
 * @param address The address to search for.
 * @returns The Google Maps URL.
 */
export const getGoogleMapsUrl = (address: string): string => {
    if (!address) return '#';
    const encodedAddress = encodeURIComponent(address);
    // Use the search query parameter to launch a search for the address
    return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
};
