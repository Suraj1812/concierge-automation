export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);
export const addHours = (date: Date, hours: number): Date => addMinutes(date, hours * 60);

export const parseDateOrNull = (value?: string): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};
