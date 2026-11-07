export const keys = {
  route: (city: string, route: string) => ({ pk: `CITY#${city}`, sk: `ROUTE#${route}` }),
  latest: (city: string) => ({ pk: `CITY#${city}`, sk: "LATEST" }),
  dayPk: (city: string, date: string) => `DAY#${city}#${date}`,
  profilePk: (city: string, dow: number) => `PROFILE#${city}#${dow}`,
};
