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

const streamCachedFile = (req, res, filePath, contentTypeFilePath) => {
    if (!(fs.existsSync(filePath) && fs.existsSync(contentTypeFilePath))) return false;
    const cachedContentType = fs.readFileSync(contentTypeFilePath, 'utf-8');
    const stats = fs.statSync(filePath);
    let range = req.range(stats.size);

    if (range === -1 || range === -2) {
        range = undefined;
    }

    if (range && (range[0].end - range[0].start + 1) === stats.size) {
        range = undefined; // Full file requested
    }

    console.log('Served: ', filePath, cachedContentType);

    res.setHeader('Content-Type', cachedContentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=31557600, immutable');

    if (range) {
        const { start, end } = range[0];
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Content-Length', chunkSize);

        const stream = fs.createReadStream(filePath, { start, end });
        return stream.pipe(res);
    } else {
        res.status(200);
        res.setHeader('Content-Length', stats.size);

        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
    }
}

app.get("/ipfs/:cid(*)", async (req, res) => {
    const cid = req.params.cid;

    const cacheFilePath = getCacheFilePath(cid);
    const contentTypeFilePath = getContentTypeFilePath(cid);

    if (streamCachedFile(req, res, cacheFilePath, contentTypeFilePath)) {
        console.log('Cache hit', cid);
        return;
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

            if (streamCachedFile(req, res, cacheFilePath, contentTypeFilePath)) {
                console.log("Fetched from gateway:", `${gateway}/ipfs/${cid}`);
                return;
            }
        } catch (err) {
            console.error("Failed to fetch from gateway:", `${gateway}/ipfs/${cid}`, err.message);
        }
    }

    res.status(500).send("Failed to fetch content.");
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
