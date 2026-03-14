export const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return "#ef4444"; // Red
  if (rate >= 70) return "#f59e0b"; // Amber
  return "#10b981"; // Emerald
};

export const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}${ampm}`;
};
