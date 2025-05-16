const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
app.use(cors());

const ABORT_SIGNAL_TIMEOUT = 5000;
const localGateway = "http://ipfs:8080";
const gateways = ["https://api.universalprofile.cloud", "https://ipfs.io", "https://gateway.pinata.cloud"];

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
    let range = req.range();
    if (range === -1) {
        range = undefined;
    }

    // Check if the file exists in the cache
    if (fs.existsSync(cacheFilePath) && fs.existsSync(contentTypeFilePath)) {
        const cachedContentType = fs.readFileSync(contentTypeFilePath, 'utf-8');
        if (!range) {
            res.set('Cache-Control', 'public, max-age=31557600');
        }
        res.setHeader('Content-Type', cachedContentType);

        const stream = fs.createReadStream(cacheFilePath, range ? range[0] : undefined);

        console.log('Cache hit', cid, cachedContentType);
        return stream.pipe(res);
    }

    for (const gateway of gateways) {
        try {
            const response = await axios.get(`${gateway}/ipfs/${cid}`, {
                responseType: "arraybuffer",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; LuksoHangout/1.0)'
                },
                signal: localGateway === gateway ? AbortSignal.timeout(ABORT_SIGNAL_TIMEOUT) : undefined
            });

            fs.writeFileSync(cacheFilePath, response.data);
            fs.writeFileSync(contentTypeFilePath, response.headers['content-type']);

            if (!range) {
                res.set('Cache-Control', 'public, max-age=31557600');
            }
            res.setHeader('Content-Type', response.headers['content-type']);

            const stream = fs.createReadStream(cacheFilePath, range ? range[0] : undefined);
            console.log("Fetched from gateway:", `${gateway}/ipfs/${cid}`);
            return stream.pipe(res);
        } catch (err) {
            console.error("Failed to fetch from gateway:", `${gateway}/ipfs/${cid}`, err.message);
        }
    }

    res.status(500).send("Failed to fetch content.");
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
