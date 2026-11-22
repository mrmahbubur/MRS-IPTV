const https = require("https");

https.get("https://collection.cloudinary.com/main.6c2764cea5ebbd93.js", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const matches = data.match(/https?:\/\/[^\s"'`<>]+/g) || [];
    console.log("Matches:", matches.slice(0, 20));
  });
});
