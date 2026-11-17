const ALLOWED_EXTENSIONS = new Set([".html", ".css", ".js"]);

export function onRequest({ request, next }) {
  const { pathname } = new URL(request.url);
  const fileName = pathname.slice(pathname.lastIndexOf("/") + 1);
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

  if (pathname === "/" || ALLOWED_EXTENSIONS.has(extension)) {
    return next();
  }

  return new Response("Not Found", { status: 404 });
}
