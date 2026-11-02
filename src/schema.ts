import { obj, type Properties } from '@earendil-works/pi-schema';

export const params = <const P extends Properties>(properties: P) =>
  obj(properties, { open: true });
