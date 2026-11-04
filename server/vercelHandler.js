const path = require("node:path");
const { createRequestHandler } = require("expo-server/adapter/vercel");

const handleRequest = createRequestHandler({
  build: path.join(process.cwd(), "dist/server"),
});

module.exports = (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const expoPath = url.searchParams.get("__expoPath");

  if (expoPath?.startsWith("/") && !expoPath.startsWith("//")) {
    url.searchParams.delete("__expoPath");
    req.url = `${expoPath}${url.search}`;
  } else if (url.pathname === "/api/index") {
    req.url = `/${url.search}`;
  }

  return handleRequest(req, res);
};
