const fs = require("fs");
const https = require("https");

https.get("https://collection.cloudinary.com/main.6c2764cea5ebbd93.js", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    // Find all occurrences of "https://" or API paths or fetch templates
    const matches = data.match(/[`'"]([^`'"]*api[^`'"]*)[`'"]/gi) || [];
    console.log("API Strings:", [...new Set(matches)].slice(0, 50));
  });
});
