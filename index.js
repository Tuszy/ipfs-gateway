const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
app.use(cors());

const gateways = ["http://ipfs:8080", "https://api.universalprofile.cloud", "https://ipfs.io", "https://gateway.pinata.cloud"];

const cacheDir = path.join(__dirname, 'cache');

if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}

const getCacheFilePath = (cidPath) => {
    return path.join(cacheDir, `${cidPath.replace(/\//g, '_')}.cache`);
};

const getContentTypeFilePath = (cidPath) => {
    return path.join(cacheDir, `${cidPath.replace(/\//g, '_')}.content-type`);
};


app.get("/ipfs/:cid(*)", async (req, res) => {
    const cid = req.params.cid;

    const cacheFilePath = getCacheFilePath(cid);
    const contentTypeFilePath = getContentTypeFilePath(cid);

    // Check if the file exists in the cache
    if (fs.existsSync(cacheFilePath) && fs.existsSync(contentTypeFilePath)) {
        console.log('Cache hit');

        const cachedContentType = fs.readFileSync(contentTypeFilePath, 'utf-8');
        res.set('Cache-Control', 'public, max-age=31557600');
        res.setHeader('Content-Type', cachedContentType);

        const stream = fs.createReadStream(cacheFilePath);
        return stream.pipe(res);
    }

    for (const gateway of gateways) {
        try {
            const response = await axios.get(`${gateway}/ipfs/${cid}`, {
                responseType: "arraybuffer",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; LuksoHangout/1.0)'
                }
            });

            fs.writeFileSync(cacheFilePath, response.data); // Save to cache file
            fs.writeFileSync(contentTypeFilePath, response.headers['content-type']); // Save Content-Type

            response.headers["Cache-Control"] = 'public, max-age=31557600';
            res.set(response.headers);
            res.send(response.data);
            console.error("Fetched from gateway:", `${gateway}/ipfs/${cid}`);
            return;
        } catch (err) {
            console.error("Failed to fetch from gateway:", `${gateway}/ipfs/${cid}`, err.message);
        }
    }

    res.status(500).send("Failed to fetch content.");
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
