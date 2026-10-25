export const isCrossOriginWrite = (request: Request) => {
  const origin = request.headers.get('Origin');
  const isWrite = request.method !== 'GET' && request.method !== 'HEAD';

  return isWrite && origin !== null && origin !== new URL(request.url).origin;
};
