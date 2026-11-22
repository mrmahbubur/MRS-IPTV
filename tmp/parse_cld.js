const https = require("https");

https.get("https://collection.cloudinary.com/main.6c2764cea5ebbd93.js", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    // Find string literals that look like endpoints or URLs or paths
    const strings = data.match(/["'](\/[a-zA-Z0-9_\-\/]+|https?:\/\/[^"']+)["']/g) || [];
    const unique = [...new Set(strings)].map(s => s.slice(1, -1));
    console.log("Found candidate strings:");
    unique.filter(s => s.includes("collection") || s.includes("asset") || s.includes("public") || s.includes("api") || s.includes("cld")).slice(0, 50).forEach(s => console.log(s));
  });
});
